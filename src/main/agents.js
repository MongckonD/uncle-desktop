'use strict';

// Her coding agents as live sessions, the same ones on the computer and on your phone (Remote
// Control, for any agent): Claude Code through its stream-json protocol, Codex through
// `codex app-server`. Every session sends the same events to onEvent({ id, type, ... }):
//   session { resume }            the agent's own id for it (to pick it up again later)
//   text { text }                 what it says
//   tool { label }                a step: a command, a file
//   ask { askId, kind, title, options }  a permission ('permission') or its question ('question')
//   turn { status, text }         done or error, back to waiting for you
//   closed { code }
// and takes: send(id, text), answer(id, askId, { decision: 'allow'|'always'|'deny', text }),
// interrupt(id), close(id).

const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path'); // win32: splits on either slash

// one JSON message per line, both ways
function jsonLines(child, onMessage) {
  let buffer = '';
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim(); buffer = buffer.slice(nl + 1);
      let m; try { m = JSON.parse(line); } catch { continue; }
      onMessage(m);
    }
  });
  return (m) => {
    if (!child.stdin.writable || child.stdin.destroyed) throw new Error('การเชื่อมต่อ Agent ปิดแล้ว');
    child.stdin.write(`${JSON.stringify(m)}\n`);
  };
}
const short = (v, n = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const toolLabel = (name, input = {}) => `${name}: ${short(input.command || input.file_path || input.path || input.pattern || input.url || input.description || '', 120)}`;

// One visible question at a time; the provider receives one complete, keyed response.
function askQuestions(asks, requestId, questions, emit, respond) {
  const answers = Object.create(null);
  const next = index => {
    const q = questions[index];
    if (!q) { respond(answers); return; }
    const askId = questions.length === 1 ? String(requestId) : `${requestId}:q${index}`;
    asks.set(askId, { answerQuestion(text) { answers[q.id || q.question] = text; next(index + 1); } });
    emit({ type: 'ask', askId, kind: 'question', title: q.question, options: (q.options || []).map(o => o.label) });
  };
  next(0);
}

// Claude Code: one process for the whole session, your messages in on stdin, its permission
// prompts as control requests (--permission-prompt-tool stdio)
function claude({ cwd, resume, model, run, emit }) {
  const args = ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose', '--permission-prompt-tool', 'stdio',
    ...(model ? ['--model', model] : []), ...(resume ? ['--resume', resume] : [])];
  const child = run('claude', args, { cwd, windowsHide: true }); // a real program: no shell
  const asks = new Map();
  const send = jsonLines(child, (m) => {
    if (m.type === 'system' && m.subtype === 'init') emit({ type: 'session', resume: m.session_id });
    if (m.type === 'assistant') {
      for (const c of m.message?.content || []) {
        if (c.type === 'text' && c.text.trim()) emit({ type: 'text', text: c.text });
        if (c.type === 'tool_use' && c.name !== 'AskUserQuestion') emit({ type: 'tool', label: toolLabel(c.name, c.input) });
      }
    }
    if (m.type === 'control_request' && m.request?.subtype === 'can_use_tool') {
      const { tool_name: tool, input = {} } = m.request;
      const question = tool === 'AskUserQuestion';
      if (question && input.questions?.length) {
        askQuestions(asks, m.request_id, input.questions, emit, answers => send({ type: 'control_response', response: { subtype: 'success', request_id: m.request_id,
          response: { behavior: 'deny', message: `The user answered: ${JSON.stringify(answers)}` } } }));
        return;
      }
      asks.set(m.request_id, m.request);
      emit({ type: 'ask', askId: m.request_id, kind: question ? 'question' : 'permission',
        allowSession: Boolean(m.request.permission_suggestions?.length),
        title: question ? (input.questions || []).map((q) => q.question).join('\n') : toolLabel(tool, input),
        options: question ? (input.questions?.[0]?.options || []).map((o) => o.label) : null });
    }
    if (m.type === 'result') emit({ type: 'turn', status: m.is_error ? 'error' : 'done', text: m.is_error ? short(m.result, 400) : '' });
  });
  return {
    child,
    clearAsks: () => asks.clear(),
    send: async (text) => send({ type: 'user', message: { role: 'user', content: text } }),
    answer(askId, { decision, text = '' }) {
      const req = asks.get(askId);
      if (!req) return false;
      if (decision === 'always' && !req.permission_suggestions?.length && !req.answerQuestion) return false;
      asks.delete(askId);
      if (req.answerQuestion) { req.answerQuestion(text || decision); return true; }
      // its question: your answer goes back as the tool's result
      const response = req.tool_name === 'AskUserQuestion' ? { behavior: 'deny', message: `The user answered: ${text || decision}` }
        : decision === 'deny' ? { behavior: 'deny', message: text || 'The user said no.' }
          : { behavior: 'allow', updatedInput: req.input, ...(decision === 'always' && req.permission_suggestions ? { updatedPermissions: req.permission_suggestions } : {}) };
      send({ type: 'control_response', response: { subtype: 'success', request_id: askId, response } });
      return true;
    },
    interrupt: () => send({ type: 'control_request', request_id: randomUUID(), request: { subtype: 'interrupt' } }),
  };
}

// Codex: `codex app-server`, JSON-RPC; sandboxed to the project, asking before anything else
function codex({ cwd, resume, model, run, emit, requestTimeoutMs }) {
  const win = process.platform === 'win32'; // npm's codex.cmd needs cmd (fixed arguments only)
  const child = run('codex', ['app-server'], { cwd, windowsHide: true, shell: win });
  let next = 0, thread = null, turn = null, files = '', generation = 0, cancelTurn = false;
  const waiting = new Map(), asks = new Map();
  const send = jsonLines(child, (m) => {
    if (m.method === undefined) { const done = waiting.get(m.id); waiting.delete(m.id); done?.(m); return; }
    const p = m.params || {};
    if (m.id !== undefined) { // its request: a permission, or a question
      if (!['item/tool/requestUserInput', 'item/commandExecution/requestApproval', 'item/fileChange/requestApproval'].includes(m.method)) {
        send({ jsonrpc: '2.0', id: m.id, error: { code: -32601, message: 'This request is not supported by Rocky' } });
        return;
      }
      const question = m.method === 'item/tool/requestUserInput';
      if (question && p.questions?.length) {
        askQuestions(asks, m.id, p.questions, emit, answers => send({ jsonrpc: '2.0', id: m.id,
          result: { answers: Object.fromEntries(Object.entries(answers).map(([id, answer]) => [id, { answers: [answer] }])) } }));
        return;
      }
      asks.set(String(m.id), m);
      emit({ type: 'ask', askId: String(m.id), kind: question ? 'question' : 'permission',
        allowSession: !Array.isArray(p.availableDecisions) || p.availableDecisions.includes('acceptForSession'),
        title: question ? (p.questions || []).map((q) => q.question).join('\n') : short(p.command || (m.method.includes('fileChange') ? `แก้ไฟล์: ${files}` : p.reason || m.method), 200),
        options: question ? (p.questions?.[0]?.options || []).map((o) => o.label) : null });
      return;
    }
    if (m.method === 'turn/started') {
      turn = p.turn?.id;
      if (cancelTurn && turn) call('turn/interrupt', { threadId: thread, turnId: turn }).catch(() => {});
    }
    if (m.method === 'item/started' && p.item?.type === 'commandExecution') emit({ type: 'tool', label: `run: ${short(p.item.command, 120)}` });
    if (m.method === 'item/started' && p.item?.type === 'fileChange') { files = short((p.item.changes || []).map((c) => path.win32.basename(c.path)).join(', '), 120); emit({ type: 'tool', label: `edit: ${files}` }); }
    if (m.method === 'item/completed' && p.item?.type === 'agentMessage' && p.item.text) emit({ type: 'text', text: p.item.text });
    if (m.method === 'turn/completed') { turn = null; cancelTurn = false; emit({ type: 'turn', status: p.turn?.status === 'interrupted' ? 'interrupted' : p.turn?.status === 'failed' ? 'error' : 'done', text: short(p.turn?.error?.message, 400) }); }
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => {
      const text = `Agent ไม่ตอบ ${method} ภายในเวลาที่กำหนด`;
      waiting.delete(id); reject(new Error(text));
      emit({ type: 'turn', status: 'error', text, fatal: true });
    }, requestTimeoutMs);
    const done = (m) => { clearTimeout(timer); m.error ? reject(new Error(m.error.message)) : resolve(m.result); };
    waiting.set(id, done);
    try { send({ jsonrpc: '2.0', id, method, params }); }
    catch (err) { waiting.delete(id); done({ error: { message: err.message } }); }
  });
  const disconnected = () => {
    for (const done of waiting.values()) done({ error: { message: 'การเชื่อมต่อ Agent ปิดแล้ว' } });
    waiting.clear(); asks.clear();
  };
  child.on('error', disconnected);
  child.on('exit', disconnected);
  child.stdin.on('error', disconnected);
  const ready = (async () => {
    await call('initialize', { clientInfo: { name: 'uncle-desktop', title: 'Rocky', version: '1' }, capabilities: null });
    send({ jsonrpc: '2.0', method: 'initialized' });
    const available = (await call('model/list', { limit: 100 })).data || [];
    const selected = model ? available.find(m => m.model === model || m.id === model) : available.find(m => m.isDefault && !m.hidden) || available.find(m => !m.hidden);
    if (!selected) throw new Error(`โมเดล Codex ${model || '(ค่าเริ่มต้น)'} ไม่พร้อมใช้กับบัญชีนี้; รุ่นที่ใช้ได้: ${available.filter(m => !m.hidden).map(m => m.model).join(', ')}`);
    const options = { cwd, approvalPolicy: 'untrusted', sandbox: 'workspace-write', model: selected.model };
    thread = (await call(resume ? 'thread/resume' : 'thread/start', resume ? { threadId: resume, ...options } : options)).thread.id;
    emit({ type: 'session', resume: thread, model: selected.model });
  })();
  ready.catch((err) => emit({ type: 'turn', status: 'error', text: short(err.message, 400), fatal: true }));
  return {
    child,
    clearAsks: () => asks.clear(),
    async send(text) {
      const before = generation;
      await ready;
      if (before !== generation) { cancelTurn = false; throw new Error('ยกเลิกคำสั่งก่อน Agent พร้อมแล้ว'); }
      const input = [{ type: 'text', text, text_elements: [] }];
      // while it works, what you say joins the turn under way
      return turn ? call('turn/steer', { threadId: thread, expectedTurnId: turn, input }) : call('turn/start', { threadId: thread, input });
    },
    answer(askId, { decision, text = '' }) {
      const req = asks.get(askId);
      if (!req) return false;
      if (decision === 'always' && Array.isArray(req.params?.availableDecisions) && !req.params.availableDecisions.includes('acceptForSession')) return false;
      asks.delete(askId);
      if (req.answerQuestion) { req.answerQuestion(text || decision); return true; }
      const result = req.method === 'item/tool/requestUserInput'
        ? { answers: Object.fromEntries((req.params.questions || []).map((q) => [q.id, { answers: [text || decision] }])) }
        : { decision: decision === 'deny' ? 'decline' : decision === 'always' ? 'acceptForSession' : 'accept' };
      send({ jsonrpc: '2.0', id: req.id, result });
      return true;
    },
    interrupt: () => { generation++; cancelTurn = true; return turn ? call('turn/interrupt', { threadId: thread, turnId: turn }).catch(() => {}) : undefined; },
  };
}

const DRIVERS = { claude, codex };

function createAgents({ onEvent = () => {}, run = spawn, modelFor = () => null, log = () => {}, requestTimeoutMs = 30000 } = {}) {
  const sessions = new Map();

  function start({ agent = 'claude', cwd, resume = null, model = null, title = '' }) {
    const driver = DRIVERS[agent];
    if (!driver) throw new Error(`ไม่รู้จัก Agent: ${agent}`);
    const id = randomUUID().slice(0, 8);
    const s = { id, agent, cwd, title: title || cwd, status: 'idle', resume, asks: new Map(), started: Date.now(), log: [], closed: false };
    const expireAsks = () => {
      const pending = [...s.asks.keys()]; s.asks.clear(); s.driver?.clearAsks();
      if (s.status === 'asking') s.status = 'working';
      for (const askId of pending) emit({ type: 'answered', askId, decision: 'deny', text: 'คำถามหมดอายุแล้ว', expired: true });
    };
    const emit = (evt) => {
      if (s.closed) return;
      if (s.interrupted && ['ask', 'text', 'tool'].includes(evt.type)) return;
      if (evt.type === 'session') s.resume = evt.resume;
      if (evt.type === 'ask') { s.asks.set(evt.askId, evt); s.status = 'asking'; }
      if (evt.type === 'turn') { if (s.interrupted && !evt.fatal) evt = { ...evt, status: 'interrupted', text: 'หยุดโดยผู้ใช้' }; expireAsks(); s.interrupted = false; s.status = 'idle'; }
      if (evt.type === 'text' || evt.type === 'tool') s.status = s.asks.size ? 'asking' : 'working';
      s.log.push(evt); if (s.log.length > 300) s.log.shift(); // for a window opened later
      onEvent({ id, ...evt });
      if (evt.fatal) { s.finish(null); s.driver.child.kill(); }
    };
    const finish = (code) => {
      if (s.closed) return;
      expireAsks(); s.closed = true; sessions.delete(id); onEvent({ id, type: 'closed', code });
    };
    const failed = (err) => {
      if (s.closed) return;
      log(`[agents] ${agent}: ${err.message}`);
      emit({ type: 'turn', status: 'error', text: `เรียก ${agent} ไม่ได้: ${err.message}` });
      finish(null); s.driver.child.kill();
    };
    s.expireAsks = expireAsks;
    s.emit = emit;
    s.finish = finish;
    s.driver = driver({ cwd, resume, model: model || modelFor(agent), run, emit, requestTimeoutMs });
    s.driver.child.on('error', failed);
    s.driver.child.stdin.on('error', failed);
    s.driver.child.on('exit', finish);
    s.driver.child.stderr?.on('data', (d) => log(`[agents] ${agent}: ${short(d, 300)}`));
    sessions.set(id, s);
    return id;
  }
  const get = (id) => { const s = sessions.get(id); if (!s) throw new Error('ไม่มี session นี้ (อาจปิดไปแล้ว)'); return s; };

  return {
    start,
    async send(id, text) {
      const s = get(id);
      if (s.interrupted) throw new Error('กำลังหยุดรอบนี้ กรุณารอ Agent ยืนยันว่าจบรอบก่อน');
      s.status = s.asks.size ? 'asking' : 'working';
      try { await s.driver.send(text); }
      catch (err) { s.emit({ type: 'turn', status: 'error', text: short(err.message, 400) }); throw err; }
    },
    answer(id, askId, value) {
      const s = get(id);
      if (!s.asks.has(askId)) return false; // answered already (on the other side)
      if (!['allow', 'always', 'deny'].includes(value?.decision)) return false;
      s.asks.delete(askId);
      if (!s.asks.size && s.status === 'asking') s.status = 'working';
      const evt = { type: 'answered', askId, decision: value.decision, text: value.text || '' };
      let accepted;
      try { accepted = s.driver.answer(askId, value); }
      catch (err) {
        s.emit({ type: 'answered', askId, decision: 'deny', text: 'ส่งคำตอบให้ Agent ไม่สำเร็จ', expired: true });
        s.expireAsks(); throw err;
      }
      if (!accepted) { s.emit({ type: 'answered', askId, decision: 'deny', text: 'คำถามหมดอายุแล้ว', expired: true }); return false; }
      s.log.push(evt); if (s.log.length > 300) s.log.shift();
      onEvent({ id, ...evt }); // announce only after the driver accepts the answer
      return true;
    },
    history: (id) => [...(sessions.get(id)?.log || [])],
    interrupt(id) { const s = get(id); if (s.status === 'idle') return; s.interrupted = true; s.expireAsks(); return s.driver.interrupt(); },
    close(id) {
      const s = sessions.get(id); if (!s) return false;
      s.finish(null); s.driver.child.stdin.end();
      const timer = setTimeout(() => s.driver.child.kill(), 3000); timer.unref?.();
      s.driver.child.once('exit', () => clearTimeout(timer));
      return true;
    },
    closeAll() { for (const id of [...sessions.keys()]) this.close(id); },
    list: () => [...sessions.values()].map(({ id, agent, cwd, title, status, resume, asks, started }) => ({ id, agent, cwd, title, status, resume, asking: [...asks.values()], started })),
  };
}

module.exports = { createAgents, DRIVERS };

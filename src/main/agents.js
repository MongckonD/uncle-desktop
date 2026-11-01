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
  return (m) => { if (child.stdin.writable) child.stdin.write(`${JSON.stringify(m)}\n`); };
}
const short = (v, n = 160) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const toolLabel = (name, input = {}) => `${name}: ${short(input.command || input.file_path || input.path || input.pattern || input.url || input.description || '', 120)}`;

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
      asks.set(m.request_id, m.request);
      emit({ type: 'ask', askId: m.request_id, kind: question ? 'question' : 'permission',
        title: question ? (input.questions || []).map((q) => q.question).join('\n') : toolLabel(tool, input),
        options: question ? (input.questions?.[0]?.options || []).map((o) => o.label) : null });
    }
    if (m.type === 'result') emit({ type: 'turn', status: m.is_error ? 'error' : 'done', text: m.is_error ? short(m.result, 400) : '' });
  });
  return {
    child,
    send: async (text) => send({ type: 'user', message: { role: 'user', content: text } }),
    answer(askId, { decision, text = '' }) {
      const req = asks.get(askId);
      if (!req) return false;
      asks.delete(askId);
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
function codex({ cwd, resume, model, run, emit }) {
  const win = process.platform === 'win32'; // npm's codex.cmd needs cmd (fixed arguments only)
  const child = run('codex', ['app-server'], { cwd, windowsHide: true, shell: win });
  let next = 0, thread = null, turn = null, files = '';
  const waiting = new Map(), asks = new Map();
  const send = jsonLines(child, (m) => {
    if (m.method === undefined) { const done = waiting.get(m.id); waiting.delete(m.id); done?.(m); return; }
    const p = m.params || {};
    if (m.id !== undefined) { // its request: a permission, or a question
      const question = m.method === 'item/tool/requestUserInput';
      asks.set(String(m.id), m);
      emit({ type: 'ask', askId: String(m.id), kind: question ? 'question' : 'permission',
        title: question ? (p.questions || []).map((q) => q.question).join('\n') : short(p.command || (m.method.includes('fileChange') ? `แก้ไฟล์: ${files}` : p.reason || m.method), 200),
        options: question ? (p.questions?.[0]?.options || []).map((o) => o.label) : null });
      return;
    }
    if (m.method === 'turn/started') turn = p.turn?.id;
    if (m.method === 'item/started' && p.item?.type === 'commandExecution') emit({ type: 'tool', label: `run: ${short(p.item.command, 120)}` });
    if (m.method === 'item/started' && p.item?.type === 'fileChange') { files = short((p.item.changes || []).map((c) => path.win32.basename(c.path)).join(', '), 120); emit({ type: 'tool', label: `edit: ${files}` }); }
    if (m.method === 'item/completed' && p.item?.type === 'agentMessage' && p.item.text) emit({ type: 'text', text: p.item.text });
    if (m.method === 'turn/completed') { turn = null; emit({ type: 'turn', status: p.turn?.status === 'failed' ? 'error' : 'done', text: short(p.turn?.error?.message, 400) }); }
  });
  const call = (method, params) => new Promise((resolve, reject) => {
    const id = ++next;
    waiting.set(id, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result)));
    send({ jsonrpc: '2.0', id, method, params });
  });
  const ready = (async () => {
    await call('initialize', { clientInfo: { name: 'uncle-desktop', title: 'Uncle Desktop', version: '1' }, capabilities: null });
    send({ jsonrpc: '2.0', method: 'initialized' });
    const options = { cwd, approvalPolicy: 'untrusted', sandbox: 'workspace-write', ...(model ? { model } : {}) };
    thread = (await call(resume ? 'thread/resume' : 'thread/start', resume ? { threadId: resume, ...options } : options)).thread.id;
    emit({ type: 'session', resume: thread });
  })();
  ready.catch((err) => emit({ type: 'turn', status: 'error', text: short(err.message, 400) }));
  return {
    child,
    async send(text) {
      await ready;
      const input = [{ type: 'text', text, text_elements: [] }];
      // while it works, what you say joins the turn under way
      return turn ? call('turn/steer', { threadId: thread, expectedTurnId: turn, input }) : call('turn/start', { threadId: thread, input });
    },
    answer(askId, { decision, text = '' }) {
      const req = asks.get(askId);
      if (!req) return false;
      asks.delete(askId);
      const result = req.method === 'item/tool/requestUserInput'
        ? { answers: Object.fromEntries((req.params.questions || []).map((q) => [q.id, { answers: [text || decision] }])) }
        : { decision: decision === 'deny' ? 'decline' : decision === 'always' ? 'acceptForSession' : 'accept' };
      send({ jsonrpc: '2.0', id: req.id, result });
      return true;
    },
    interrupt: () => (turn ? call('turn/interrupt', { threadId: thread, turnId: turn }).catch(() => {}) : undefined),
  };
}

const DRIVERS = { claude, codex };

function createAgents({ onEvent = () => {}, run = spawn, modelFor = () => null, log = () => {} } = {}) {
  const sessions = new Map();

  function start({ agent = 'claude', cwd, resume = null, model = null, title = '' }) {
    const driver = DRIVERS[agent];
    if (!driver) throw new Error(`ไม่รู้จัก Agent: ${agent}`);
    const id = randomUUID().slice(0, 8);
    const s = { id, agent, cwd, title: title || cwd, status: 'starting', resume, asks: new Map(), started: Date.now(), log: [] };
    const emit = (evt) => {
      if (evt.type === 'session') s.resume = evt.resume;
      if (evt.type === 'ask') { s.asks.set(evt.askId, evt); s.status = 'asking'; }
      if (evt.type === 'turn') s.status = 'idle';
      if (evt.type === 'text' || evt.type === 'tool') s.status = s.asks.size ? 'asking' : 'working';
      s.log.push(evt); if (s.log.length > 300) s.log.shift(); // for a window opened later
      onEvent({ id, ...evt });
    };
    s.driver = driver({ cwd, resume, model: model || modelFor(agent), run, emit });
    s.driver.child.on('error', (err) => { log(`[agents] ${agent}: ${err.message}`); emit({ type: 'turn', status: 'error', text: `เรียก ${agent} ไม่ได้: ${err.message}` }); });
    s.driver.child.on('exit', (code) => { sessions.delete(id); onEvent({ id, type: 'closed', code }); });
    s.driver.child.stderr?.on('data', (d) => log(`[agents] ${agent}: ${short(d, 300)}`));
    sessions.set(id, s);
    s.status = 'idle';
    return id;
  }
  const get = (id) => { const s = sessions.get(id); if (!s) throw new Error('ไม่มี session นี้ (อาจปิดไปแล้ว)'); return s; };

  return {
    start,
    async send(id, text) { const s = get(id); s.status = 'working'; await s.driver.send(text); },
    answer(id, askId, value) {
      const s = get(id);
      if (!s.asks.delete(askId)) return false; // answered already (on the other side)
      if (!s.asks.size && s.status === 'asking') s.status = 'working';
      const evt = { type: 'answered', askId, decision: value.decision, text: value.text || '' };
      s.log.push(evt);
      onEvent({ id, ...evt }); // the other side (phone, computer) closes its question
      return s.driver.answer(askId, value);
    },
    history: (id) => [...(sessions.get(id)?.log || [])],
    interrupt(id) { get(id).driver.interrupt(); },
    close(id) { const s = sessions.get(id); if (!s) return false; s.driver.child.stdin.end(); setTimeout(() => s.driver.child.kill(), 3000).unref?.(); return true; },
    closeAll() { for (const id of [...sessions.keys()]) this.close(id); },
    list: () => [...sessions.values()].map(({ id, agent, cwd, title, status, resume, asks, started }) => ({ id, agent, cwd, title, status, resume, asking: [...asks.values()], started })),
  };
}

module.exports = { createAgents, DRIVERS };

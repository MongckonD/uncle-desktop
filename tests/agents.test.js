const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createAgents } = require('../src/main/agents');
const { createAgentPhone } = require('../src/main/agent-phone');

// a pretend agent process: what it's sent is handed to `reply`, which answers with lines on stdout
function fakeRun(reply) {
  const runs = [];
  const run = (file, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => child.emit('exit', null);
    const say = (m) => queueMicrotask(() => child.stdout.write(`${JSON.stringify(m)}\n`));
    let buf = '';
    child.stdin.on('data', (d) => { buf += d; let nl; while ((nl = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1); runs.at(-1).got.push(m); if (m.method === "model/list") say({id:m.id,result:{data:[{id:"test-model",model:"test-model",isDefault:true,hidden:false}]}}); else reply(m, say); } });
    child.stdin.on('finish', () => child.emit('exit', 0));
    runs.push({ file, args, got: [], child, say });
    return child;
  };
  return { run, runs };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

test('agents and Telegram share approval state in both directions', async () => {
  const events = [], messages = [], { run, runs } = fakeRun(() => {});
  let phone;
  const agents = createAgents({ run, onEvent: e => { events.push(e); void phone?.onEvent(e); } });
  const telegram = {
    send: async (chat, text, buttons) => { const message = { chat, text, buttons, id: messages.length + 1 }; messages.push(message); return { message_id: message.id }; },
    edit: async (chat, id, text) => { messages.push({ chat, edit: id, text }); },
  };
  phone = createAgentPhone({ telegram, agents, settings: () => ({ chatId: 1, switches: { approve: true } }), projectDir: p => p });
  const id = agents.start({ agent: 'claude', cwd: '.', title: 'test' });
  await phone.command(1, `/use ${id}`);
  const ask = request_id => runs[0].say({ type: 'control_request', request_id, request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: 'test.txt' } } });
  try {
    ask('desktop'); await tick();
    const first = messages.find(m => m.buttons);
    assert.equal(agents.answer(id, 'desktop', { decision: 'allow' }), true); await tick();
    assert.ok(messages.some(m => m.edit === first.id && m.text.includes('ตอบบนคอมแล้ว')));
    await phone.callback(1, first.buttons[0][0].data);
    assert.equal(runs[0].got.filter(m => m.type === 'control_response').length, 1);
    ask('telegram'); await tick();
    const second = messages.filter(m => m.buttons).at(-1);
    await phone.callback(1, second.buttons[0][0].data); await tick();
    assert.ok(events.some(e => e.type === 'answered' && e.askId === 'telegram' && e.decision === 'allow'));
    assert.equal(agents.answer(id, 'telegram', { decision: 'allow' }), false);
    assert.equal(runs[0].got.filter(m => m.type === 'control_response').length, 2);
  } finally { agents.close(id); }
});

test('agents: Claude Code session — talks, asks for a tool, gets your yes, finishes', async () => {
  const events = [];
  const { run, runs } = fakeRun((m, say) => {
    if (m.type === 'user') {
      say({ type: 'system', subtype: 'init', session_id: 'c-1' });
      say({ type: 'assistant', message: { content: [{ type: 'text', text: 'ok' }, { type: 'tool_use', name: 'Write', input: { file_path: 'a.txt' } }] } });
      say({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: 'a.txt' } } });
    }
    if (m.type === 'control_response') say({ type: 'result', result: 'done' });
  });
  const agents = createAgents({ run, onEvent: (e) => events.push(e) });
  const id = agents.start({ agent: 'claude', cwd: '.', resume: 'c-0' });
  assert.ok(runs[0].args.includes('stdio') && runs[0].args.includes('c-0'));
  await agents.send(id, 'make a.txt'); await tick();
  assert.equal(agents.list()[0].status, 'asking');
  const ask = events.find((e) => e.type === 'ask');
  assert.deepEqual([ask.kind, ask.title], ['permission', 'Write: a.txt']);
  agents.answer(id, ask.askId, { decision: 'allow' }); await tick();
  assert.equal(runs[0].got.at(-1).response.response.behavior, 'allow');
  assert.deepEqual(events.map((e) => e.type), ['session', 'text', 'tool', 'ask', 'answered', 'turn']);
  assert.equal(agents.list()[0].resume, 'c-1');
  agents.close(id); await tick();
  assert.equal(agents.list().length, 0);
});

test('agents: Codex session — thread, turn, an approval declined, steering while it works', async () => {
  const events = [];
  const { run, runs } = fakeRun((m, say) => {
    if (m.method === 'initialize' || m.method === 'thread/start') say({ id: m.id, result: { thread: { id: 't-1' } } });
    if (m.method === 'turn/start') {
      say({ id: m.id, result: {} });
      say({ method: 'turn/started', params: { turn: { id: 'u-1' } } });
      say({ method: 'item/started', params: { item: { type: 'commandExecution', command: 'rm -rf x' } } });
      say({ id: 0, method: 'item/commandExecution/requestApproval', params: { command: 'rm -rf x' } });
    }
    if (m.method === 'turn/steer') say({ id: m.id, result: {} });
    if (m.result?.decision) {
      say({ method: 'item/completed', params: { item: { type: 'agentMessage', text: 'skipped it' } } });
      say({ method: 'turn/completed', params: { turn: { status: 'completed' } } });
    }
  });
  const agents = createAgents({ run, onEvent: (e) => events.push(e) });
  const id = agents.start({ agent: 'codex', cwd: '.' });
  await agents.send(id, 'clean up'); await tick();
  const ask = events.find((e) => e.type === 'ask');
  assert.deepEqual([ask.askId, ask.title], ['0', 'rm -rf x']);
  await agents.send(id, 'keep the logs'); await tick(); // mid-turn: steers
  assert.equal(runs[0].got.find((m) => m.method === 'turn/steer').params.expectedTurnId, 'u-1');
  agents.answer(id, '0', { decision: 'deny' }); await tick();
  assert.deepEqual(runs[0].got.find((m) => m.id === 0).result, { decision: 'decline' });
  assert.deepEqual(events.map((e) => e.type), ['session', 'tool', 'ask', 'answered', 'text', 'turn']);
  assert.equal(agents.list()[0].status, 'idle');
});

test('agents: failed process is removed once and late output cannot revive it', async () => {
  const events = [], { run, runs } = fakeRun(() => {});
  const agents = createAgents({ run, onEvent: e => events.push(e) });
  agents.start({ agent: 'claude', cwd: '.' });
  runs[0].child.emit('error', new Error('ENOENT'));
  runs[0].child.emit('exit', 1);
  runs[0].say({ type: 'system', subtype: 'init', session_id: 'late' });
  await tick();
  assert.deepEqual(agents.list(), []);
  assert.deepEqual(events.map(e => e.type), ['turn', 'closed']);
});

test('agents: turn completion and interrupt expire approvals on both surfaces', async () => {
  const events = [], { run, runs } = fakeRun(() => {});
  const agents = createAgents({ run, onEvent: e => events.push(e) });
  const id = agents.start({ agent: 'claude', cwd: '.' });
  const ask = key => runs[0].say({ type: 'control_request', request_id: key,
    request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: 'x' } } });
  ask('old'); await tick();
  runs[0].say({ type: 'result' }); await tick();
  assert.deepEqual(agents.list()[0].asking, []);
  assert.equal(agents.answer(id, 'old', { decision: 'allow' }), false);
  ask('next'); await tick();
  agents.interrupt(id);
  assert.equal(agents.answer(id, 'next', { decision: 'allow' }), false);
  assert.equal(agents.list()[0].status, 'working');
  ask('late'); await tick();
  assert.equal(agents.answer(id, 'late', { decision: 'allow' }), false);
  await assert.rejects(agents.send(id, 'too soon'), /กำลังหยุด/);
  runs[0].say({ type: 'result' }); await tick();
  assert.equal(agents.list()[0].status, 'idle');
  assert.deepEqual(events.filter(e => e.expired).map(e => e.askId), ['old', 'next']);
  assert.equal(runs[0].got.some(m => m.type === 'control_response'), false);
  agents.close(id);
});

test('agents: closing immediately rejects new work and invalidates pending approval', async () => {
  const events = [], { run, runs } = fakeRun(() => {});
  const agents = createAgents({ run, onEvent: e => events.push(e) });
  const id = agents.start({ agent: 'claude', cwd: '.' });
  runs[0].say({ type: 'control_request', request_id: 'r', request: { subtype: 'can_use_tool', tool_name: 'Write' } });
  await tick();
  assert.equal(agents.close(id), true);
  assert.equal(agents.close(id), false);
  assert.deepEqual(agents.list(), []);
  await assert.rejects(agents.send(id, 'late'), /session/);
  assert.throws(() => agents.answer(id, 'r', { decision: 'allow' }), /session/);
  assert.ok(events.some(e => e.expired && e.askId === 'r'));
  await tick();
  assert.equal(events.filter(e => e.type === 'closed').length, 1);
});

test('agents: Codex initialization timeout rejects waiting send and removes session', async () => {
  const events = [], { run } = fakeRun(() => {});
  const agents = createAgents({ run, requestTimeoutMs: 20, onEvent: e => events.push(e) });
  const id = agents.start({ agent: 'codex', cwd: '.' });
  await assert.rejects(agents.send(id, 'hello'), /initialize/);
  assert.deepEqual(agents.list(), []);
  assert.equal(events.filter(e => e.type === 'closed').length, 1);
});

test('agents: Codex disconnect rejects an in-flight request without waiting for timeout', async () => {
  const { run, runs } = fakeRun((m, say) => {
    if (m.method === 'initialize') say({ id: m.id, result: {} });
    if (m.method === 'thread/start') say({ id: m.id, result: { thread: { id: 't' } } });
  });
  const agents = createAgents({ run });
  const id = agents.start({ agent: 'codex', cwd: '.' });
  const pending = assert.rejects(agents.send(id, 'hello'), /ปิดแล้ว/);
  await tick();
  runs[0].child.emit('exit', 1);
  await pending;
  assert.deepEqual(agents.list(), []);
});

test('agents: interrupt during Codex startup cancels queued prompt without cancelling the next turn', async () => {
  let initialize;
  const { run, runs } = fakeRun((m, say) => {
    if (m.method === 'initialize') initialize = () => say({ id: m.id, result: {} });
    if (m.method === 'thread/start') say({ id: m.id, result: { thread: { id: 't' } } });
    if (m.method === 'turn/start') {
      say({ id: m.id, result: {} });
      say({ method: 'turn/started', params: { turn: { id: 'u' } } });
    }
  });
  const agents = createAgents({ run });
  const id = agents.start({ agent: 'codex', cwd: '.' });
  const cancelled = assert.rejects(agents.send(id, 'cancel this'), /ยกเลิก/);
  agents.interrupt(id); initialize();
  await cancelled;
  assert.equal(runs[0].got.some(m => m.method === 'turn/start'), false);
  await agents.send(id, 'new task'); await tick();
  assert.equal(runs[0].got.filter(m => m.method === 'turn/start').length, 1);
  assert.equal(runs[0].got.some(m => m.method === 'turn/interrupt'), false);
  agents.close(id);
});

test('agents: interrupt before turn-start notification is delivered once the turn exists', async () => {
  const { run, runs } = fakeRun((m, say) => {
    if (m.method === 'initialize') say({ id: m.id, result: {} });
    if (m.method === 'thread/start') say({ id: m.id, result: { thread: { id: 't' } } });
    if (m.method === 'turn/start' || m.method === 'turn/interrupt') say({ id: m.id, result: {} });
  });
  const agents = createAgents({ run });
  const id = agents.start({ agent: 'codex', cwd: '.' });
  await agents.send(id, 'task');
  agents.interrupt(id);
  runs[0].say({ method: 'turn/started', params: { turn: { id: 'u' } } });
  await tick();
  assert.equal(runs[0].got.find(m => m.method === 'turn/interrupt').params.turnId, 'u');
  agents.close(id);
});

test('agents: broken stdin is handled and a failed write never reports approval success', async () => {
  const events = [], { run, runs } = fakeRun(() => {});
  const agents = createAgents({ run, onEvent: e => events.push(e) });
  const id = agents.start({ agent: 'claude', cwd: '.' });
  runs[0].say({ type: 'control_request', request_id: 'r', request: { subtype: 'can_use_tool', tool_name: 'Write' } });
  await tick();
  runs[0].child.stdin.destroy();
  assert.throws(() => agents.answer(id, 'r', { decision: 'allow' }), /ปิดแล้ว/);
  assert.equal(events.some(e => e.type === 'answered' && !e.expired), false);
  assert.ok(events.some(e => e.expired && e.askId === 'r'));
  runs[0].child.stdin.emit('error', new Error('EPIPE'));
  assert.deepEqual(agents.list(), []);
});


test('agents: Codex uses the advertised account default instead of an unsupported CLI config', async () => {
 const events=[],{run,runs}=fakeRun((m,say)=>{if(m.method==='initialize')say({id:m.id,result:{}});if(m.method==='thread/start')say({id:m.id,result:{thread:{id:'t'}}});});
 const agents=createAgents({run,onEvent:e=>events.push(e)});const id=agents.start({agent:'codex',cwd:'.'});
 await tick();
 try { assert.equal(runs[0].got.find(m=>m.method==='thread/start').params.model,'test-model');assert.equal(events.find(e=>e.type==='session').model,'test-model'); }
 finally {agents.close(id);}
});

test('agents: unsupported explicit Codex model is rejected before starting a thread', async () => {
 const events=[],{run,runs}=fakeRun((m,say)=>{if(m.method==='initialize')say({id:m.id,result:{}});if(m.method==='thread/start')say({id:m.id,result:{thread:{id:'t'}}});});
 const agents=createAgents({run,onEvent:e=>events.push(e)});const id=agents.start({agent:'codex',cwd:'.',model:'not-supported'});
 await tick();
 try { assert.equal(runs[0].got.some(m=>m.method==='thread/start'),false);assert.match(events.find(e=>e.fatal).text,/test-model/); }
 finally {agents.close(id);}
});


test('agents: Codex multi-question prompts collect distinct answers before replying',async()=>{
 const events=[],{run,runs}=fakeRun((m,say)=>{
  if(m.method==='initialize')say({id:m.id,result:{}});
  if(m.method==='thread/start')say({id:m.id,result:{thread:{id:'t'}}});
  if(m.method==='turn/start'){say({id:m.id,result:{}});say({id:77,method:'item/tool/requestUserInput',params:{questions:[{id:'color',question:'Color?',options:[{label:'Red'}]},{id:'size',question:'Size?',options:[{label:'Small'}]}]}});}
 });
 const agents=createAgents({run,onEvent:e=>events.push(e)}),id=agents.start({agent:'codex',cwd:'.'});
 await agents.send(id,'ask');await tick();
 try{
  const first=agents.list()[0].asking[0];assert.equal(first.title,'Color?');agents.answer(id,first.askId,{decision:'allow',text:'Red'});
  assert.equal(runs[0].got.some(m=>m.id===77),false);
  const second=agents.list()[0].asking[0];assert.equal(second.title,'Size?');agents.answer(id,second.askId,{decision:'allow',text:'Small'});
  assert.deepEqual(runs[0].got.find(m=>m.id===77).result,{answers:{color:{answers:['Red']},size:{answers:['Small']}}});
 }finally{agents.close(id);}
});

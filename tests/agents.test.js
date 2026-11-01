const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createAgents } = require('../src/main/agents');

// a pretend agent process: what it's sent is handed to `reply`, which answers with lines on stdout
function fakeRun(reply) {
  const runs = [];
  const run = (file, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdin = new PassThrough();
    child.kill = () => child.emit('exit', null);
    const say = (m) => child.stdout.write(`${JSON.stringify(m)}\n`);
    let buf = '';
    child.stdin.on('data', (d) => { buf += d; let nl; while ((nl = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1); runs.at(-1).got.push(m); reply(m, say); } });
    child.stdin.on('finish', () => child.emit('exit', 0));
    runs.push({ file, args, got: [] });
    return child;
  };
  return { run, runs };
}
const tick = () => new Promise((r) => setTimeout(r, 20));

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

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createBridge } = require('../src/main/bridge');
const { HEADER, createToken, readToken, sameToken, tokenFile } = require('../hooks/bridge-token');

async function bridge(t, extra = {}) {
  const events = [];
  const debugCalls = [];
  const server = createBridge({
    port: 0, token: 'secret-token',
    onEvent(evt) { events.push(evt); },
    onDebug: async (route) => { debugCalls.push(route); return { ok: true }; },
    ...extra,
  });
  await once(server, 'listening');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (route, headers = {}) => fetch(base + route, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ hook_event_name: 'Stop', session_id: 's' }),
  });
  return { events, debugCalls, base, post };
}

test('bridge: events and debug calls need the launch token', async (t) => {
  const { events, debugCalls, post } = await bridge(t);
  assert.equal((await post('/event')).status, 401);
  assert.equal((await post('/event', { [HEADER]: 'wrong-token!' })).status, 401);
  assert.equal((await post('/event', { [HEADER]: 'secret' })).status, 401); // a prefix is not the token
  assert.equal((await post('/debug/eval')).status, 401);
  assert.deepEqual(events, []);
  assert.deepEqual(debugCalls, []);

  assert.equal((await post('/event', { [HEADER]: 'secret-token' })).status, 200);
  assert.equal((await post('/debug/eval', { [HEADER]: 'secret-token' })).status, 200);
  assert.equal(events.length, 1);
  assert.deepEqual(debugCalls, ['eval']);
});

test('bridge: health stays open, web pages are still refused, no token means no bridge', async (t) => {
  const { base, post } = await bridge(t);
  assert.equal((await fetch(base + '/health')).status, 200);
  assert.equal((await post('/event', { [HEADER]: 'secret-token', origin: 'https://example.com' })).status, 403);
  assert.throws(() => createBridge({ port: 0, onEvent() {} }), /token/);
});

test('bridge token: written owner-only, replaced each launch, read back by hooks', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'capri-token-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'nested', 'bridge-token');
  assert.equal(readToken(file), ''); // never launched: hooks send nothing useful, bridge refuses
  const first = createToken(file);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(readToken(file), first);
  const second = createToken(file);
  assert.notEqual(second, first);
  assert.equal(readToken(file), second);
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['bridge-token']); // no temp file left behind
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  assert.equal(sameToken(second, second), true);
  assert.equal(sameToken(undefined, second), false);
  assert.equal(sameToken('', ''), false);
});

test('bridge token: hooks find it in the same folder as Capri\'s userData', () => {
  const old = process.env.CAPRI_TOKEN_FILE;
  delete process.env.CAPRI_TOKEN_FILE;
  try {
    assert.equal(path.basename(tokenFile()), 'bridge-token');
    assert.equal(path.basename(path.dirname(tokenFile())), 'capri-desktop');
  } finally {
    if (old !== undefined) process.env.CAPRI_TOKEN_FILE = old;
  }
});

test('hook without a token file stays silent and exits 0, and its event is refused', async (t) => {
  const { events, base } = await bridge(t);
  const missing = path.join(os.tmpdir(), `capri-no-token-${process.pid}`, 'bridge-token');
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'hooks', 'capri-hook.js')], {
    env: { ...process.env, CAPRI_PORT: new URL(base).port, CAPRI_TOKEN_FILE: missing }, windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', (s) => { output += s; });
  child.stderr.on('data', (s) => { output += s; });
  child.stdin.end(JSON.stringify({ hook_event_name: 'Stop', session_id: 's' }));
  const [code] = await once(child, 'close');
  assert.equal(code, 0);
  assert.equal(output, '');
  assert.deepEqual(events, []);
});

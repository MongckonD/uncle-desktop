'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ollama = require('../src/main/ollama');

// A fake Ollama: /api/tags lists the models, /api/chat records the request and streams one answer
function fakeOllama(t, tags) {
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url).endsWith('/api/tags')) return new Response(JSON.stringify({ models: tags }));
    sent.push(JSON.parse(init.body));
    return new Response(`${JSON.stringify({ message: { content: 'สวัสดี' }, done: true })}\n`);
  };
  t.after(() => { globalThis.fetch = realFetch; });
  return sent;
}

test('ollama: a local thinking model answers without thinking, so her reply is not cut off', async (t) => {
  const sent = fakeOllama(t, [
    { name: 'qwen3:8b', capabilities: ['completion', 'thinking'] },
    { name: 'gemma3:4b', capabilities: ['completion', 'vision'] },
    { name: 'beam:cloud', remote_host: 'https://ollama.com', capabilities: ['completion', 'thinking'] },
  ]);
  await ollama.models();
  const ask = (model) => ollama.chat({ model, messages: [{ role: 'user', content: 'hi' }] }, () => {});

  assert.equal(await ask('qwen3:8b'), 'สวัสดี');
  assert.equal(sent[0].think, false);
  assert.equal(sent[0].options.num_predict, 240);

  await ask('gemma3:4b'); // doesn't think: false is ignored by Ollama
  assert.equal(sent[1].think, false);

  await ask('beam:cloud'); // cloud models still think a little, with room for it
  assert.equal(sent[2].think, 'low');
  assert.equal(sent[2].options.num_predict, 1200);
});

test('ollama: a local model the app has not listed yet is still told not to think', async (t) => {
  const sent = fakeOllama(t, []);
  await ollama.chat({ model: 'qwen3:14b', messages: [] }, () => {});
  assert.equal(sent[0].think, false);
});

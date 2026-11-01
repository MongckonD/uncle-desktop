const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentPhone } = require('../src/main/agent-phone');

// a pretend hub: what the phone asks of it, and sessions it lists
function fakeAgents() {
  const calls = [], sessions = [];
  return {
    calls, sessions,
    start: (o) => { calls.push(['start', o.agent, o.title, o.resume]); sessions.push({ id: 's1', agent: o.agent, title: o.title, status: 'idle' }); return 's1'; },
    send: async (id, text) => { calls.push(['send', id, text]); },
    answer: (id, askId, v) => { calls.push(['answer', askId, v.decision, v.text || '']); return true; },
    interrupt: (id) => calls.push(['interrupt', id]),
    close: (id) => { calls.push(['close', id]); return true; },
    list: () => sessions,
  };
}
function fakeTelegram() {
  const out = []; let n = 0;
  return { out, send: async (chat, text, buttons) => { out.push({ id: ++n, text, buttons }); return { message_id: n }; }, edit: async (chat, id, text) => { out.push({ edit: id, text }); } };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('agent phone: start, live message rewritten, permission by button, question typed, done, resume', async () => {
  const tg = fakeTelegram(), agents = fakeAgents(), saved = {};
  const hub = createAgentPhone({ telegram: tg, agents, settings: () => ({ chatId: 1, switches: { approve: true } }), projectDir: (p) => `/w/${p}`,
    getResume: (p, a) => saved[`${p}/${a}`] || null, saveResume: (p, a, id) => { saved[`${p}/${a}`] = id; } });
  assert.equal(await hub.command(1, '/new'), false); // her own /new (a new topic) stays hers
  assert.equal(await hub.command(1, 'hello'), false); // no session yet: her usual chat
  assert.equal(await hub.command(1, '/new claude shop fix the cart'), true);
  assert.deepEqual(agents.calls.slice(0, 2), [['start', 'claude', 'shop', null], ['send', 's1', 'fix the cart']]);
  await hub.onEvent({ id: 's1', type: 'session', resume: 'abc' });
  await hub.onEvent({ id: 's1', type: 'tool', label: 'Read: cart.js' });
  await hub.onEvent({ id: 's1', type: 'text', text: 'Looking' });
  await wait(1600);
  await hub.onEvent({ id: 's1', type: 'tool', label: 'Edit: cart.js' });
  await wait(1600);
  const live = tg.out.find((o) => o.text?.includes('🔧 Read: cart.js'));
  assert.ok(tg.out.some((o) => o.edit === live.id && o.text.includes('Edit: cart.js'))); // one message, rewritten
  await hub.onEvent({ id: 's1', type: 'ask', askId: 'r1', kind: 'permission', title: 'Bash: npm test' });
  const ask = tg.out.at(-1);
  assert.deepEqual(ask.buttons.flat().map((b) => b.data.split(':')[2]), ['a', 's', 'd']);
  assert.equal(await hub.callback(1, ask.buttons[0][1].data), true);
  await hub.onEvent({ id: 's1', type: 'ask', askId: 'q1', kind: 'question', title: 'Which colour?', options: ['red', 'blue'] });
  await hub.command(1, 'green please'); // typed: the answer
  await hub.command(1, 'also add tests'); // then: a message to it
  await hub.onEvent({ id: 's1', type: 'turn', status: 'done' });
  assert.ok(tg.out.at(-1).text.startsWith('✅ claude · shop\nLooking'));
  assert.deepEqual(agents.calls.slice(2), [['answer', 'r1', 'always', ''], ['answer', 'q1', 'allow', 'green please'], ['send', 's1', 'also add tests']]);
  assert.equal(saved['shop/claude'], 'abc');
  await hub.command(1, '/interrupt'); await hub.command(1, '/end');
  await hub.onEvent({ id: 's1', type: 'closed', code: 0 });
  assert.equal(hub.current, null);
  await hub.command(1, '/resume claude shop');
  assert.deepEqual(agents.calls.at(-1), ['start', 'claude', 'shop', 'abc']);
});

test('agent phone: permissions without buttons when approving from the phone is off', async () => {
  const tg = fakeTelegram(), agents = fakeAgents();
  const hub = createAgentPhone({ telegram: tg, agents, settings: () => ({ chatId: 1, switches: { approve: false } }), projectDir: (p) => p });
  await hub.command(1, '/new codex shop');
  await hub.onEvent({ id: 's1', type: 'ask', askId: '0', kind: 'permission', title: 'rm -rf x' });
  assert.ok(tg.out.at(-1).text.includes('ตอบบนคอม') && !tg.out.at(-1).buttons);
});

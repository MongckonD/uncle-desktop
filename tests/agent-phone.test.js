const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentPhone } = require('../src/main/agent-phone');

// a pretend hub: what the phone asks of it, and sessions it lists
function fakeAgents() {
  const calls = [], sessions = [];
  return {
    calls, sessions,
    start: (o) => { calls.push(['start', o.agent, o.title, o.resume]); const id = 's' + (sessions.length + 1); sessions.push({ id, agent: o.agent, title: o.title, status: 'idle' }); return id; },
    send: async (id, text) => { calls.push(['send', id, text]); },
    answer: (id, askId, v) => { calls.push(['answer', askId, v.decision, v.text || '']); return true; },
    interrupt: (id) => calls.push(['interrupt', id]),
    close: (id) => { calls.push(['close', id]); return true; },
    list: () => sessions,
  };
}
function fakeTelegram() {
  const out = []; let n = 0;
  return { out, send: async (chat, text, buttons) => { out.push({ chat, id: ++n, text, buttons }); return { message_id: n }; }, edit: async (chat, id, text) => { out.push({ chat, edit: id, text }); } };
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

test('agent phone: Vibecode /code opens the project live session (picked up again when it can be) and its commands follow', async () => {
  const tg = fakeTelegram(), agents = fakeAgents(), picked = [];
  const hub = createAgentPhone({ telegram: tg, agents, settings: () => ({ chatId: 1, switches: { approve: true } }), projectDir: (p) => p,
    getResume: (p, a) => (p === 'shop' && a === 'codex' ? 'old' : null), agentOf: () => 'codex', setProject: (p) => picked.push(p) });
  await hub.open(1, 'shop');
  assert.deepEqual(agents.calls[0], ['start', 'codex', 'shop', 'old']);
  await hub.open(1, 'shop'); // open already: just picked
  assert.equal(agents.calls.length, 1);
  assert.deepEqual(picked, ['shop', 'shop']);
});

test('agent phone: say() sends to the picked session (a photo\'s words may even start with a slash); busy() by project', async () => {
  const tg = fakeTelegram(), agents = fakeAgents();
  const hub = createAgentPhone({ telegram: tg, agents, settings: () => ({ chatId: 1, switches: {} }), projectDir: (p) => p });
  await hub.command(1, '/new claude shop');
  assert.equal(hub.project, 'shop');
  await hub.say(1, '/look\n(ดูรูปที่ .uncle/inbox/1.jpg)');
  assert.deepEqual(agents.calls.at(-1), ['send', 's1', '/look\n(ดูรูปที่ .uncle/inbox/1.jpg)']);
  agents.sessions[0].status = 'working';
  assert.equal(hub.busy('shop'), true);
  assert.equal(hub.busy('other'), false);
});

test('agent phone: old permission buttons cannot approve after the switch is disabled', async () => {
  const tg = fakeTelegram(), agents = fakeAgents(); let approve = true;
  const hub = createAgentPhone({ telegram: tg, agents, settings: () => ({ chatId: 1, switches: { approve } }), projectDir: p => p });
  await hub.command(1, '/new claude shop');
  await hub.onEvent({ id: 's1', type: 'ask', askId: 'r', kind: 'permission', title: 'Write' });
  const button = tg.out.at(-1).buttons[0][0].data;
  approve = false;
  await hub.callback(1, button);
  assert.equal(agents.calls.some(c => c[0] === 'answer'), false);
  assert.match(tg.out.at(-1).text, /ปิดอยู่/);
});

test('agent phone: a stale core answer never produces a successful approval message', async () => {
  const tg = fakeTelegram(), agents = fakeAgents();
  agents.answer = () => false;
  const hub = createAgentPhone({ telegram: tg, agents, settings: () => ({ chatId: 1, switches: { approve: true } }), projectDir: p => p });
  await hub.command(1, '/new claude shop');
  await hub.onEvent({ id: 's1', type: 'ask', askId: 'r', kind: 'permission', title: 'Write' });
  await hub.callback(1, tg.out.at(-1).buttons[0][0].data);
  assert.match(tg.out.at(-1).text, /หมดอายุ/);
  assert.equal(tg.out.some(o => o.edit && o.text.includes('→ อนุญาตแล้ว')), false);
});

test('agent phone: expired typed questions no longer consume the next task', async () => {
  const tg = fakeTelegram(), agents = fakeAgents();
  const hub = createAgentPhone({ telegram: tg, agents, settings: () => ({ chatId: 1, switches: { approve: true } }), projectDir: p => p });
  await hub.command(1, '/new claude shop');
  await hub.onEvent({ id: 's1', type: 'ask', askId: 'r', kind: 'question', title: 'Which?' });
  await hub.onEvent({ id: 's1', type: 'answered', askId: 'r', decision: 'deny', expired: true });
  assert.match(tg.out.at(-1).text, /หมดอายุ/);
  await hub.command(1, 'new task');
  assert.deepEqual(agents.calls.at(-1), ['send', 's1', 'new task']);
  await hub.onEvent({ id: 's1', type: 'turn', status: 'done' });
});


test('agent phone: two chats keep selected sessions and callbacks separate', async () => {
 const tg=fakeTelegram(), agents=fakeAgents();
 const hub=createAgentPhone({telegram:tg,agents,settings:()=>({chatId:1,switches:{approve:true}}),projectDir:p=>p});
 await hub.command(1,'/new claude alpha'); await hub.command(2,'/new codex beta');
 await hub.command(1,'task alpha'); await hub.command(2,'task beta');
 assert.deepEqual(agents.calls.filter(c=>c[0]==='send'),[['send','s1','task alpha'],['send','s2','task beta']]);
 await hub.onEvent({id:'s2',type:'ask',askId:'r',kind:'permission',title:'Write beta'});
 const ask=tg.out.at(-1); assert.equal(ask.chat,2);
 await hub.callback(1,ask.buttons[0][0].data);
 assert.equal(agents.calls.some(c=>c[0]==='answer'),false);
 await hub.callback(2,ask.buttons[0][0].data);
 assert.equal(agents.calls.filter(c=>c[0]==='answer').length,1);
 await hub.onEvent({id:'s1',type:'turn',status:'done'}); await hub.onEvent({id:'s2',type:'turn',status:'done'});
});

test('agent phone: /chat is handled locally and malformed option cannot approve a permission', async () => {
 const tg=fakeTelegram(),agents=fakeAgents();
 const hub=createAgentPhone({telegram:tg,agents,settings:()=>({chatId:1,switches:{approve:true}}),projectDir:p=>p});
 await hub.command(1,'/new claude alpha');
 await hub.onEvent({id:'s1',type:'ask',askId:'r',kind:'permission',title:'Write'});
 const data=tg.out.at(-1).buttons[0][0].data.replace(/:a$/,':o999');
 await hub.callback(1,data); assert.equal(agents.calls.some(c=>c[0]==='answer'),false);
 assert.equal(await hub.command(1,'/chat'),true);
 assert.equal(await hub.command(1,'normal chat'),false);
});

test('agent phone: interruption is reported as stopped, not failure or success', async () => {
 const tg=fakeTelegram(),agents=fakeAgents();
 const hub=createAgentPhone({telegram:tg,agents,settings:()=>({chatId:1,switches:{}}),projectDir:p=>p});
 await hub.command(1,'/new claude alpha');
 await hub.onEvent({id:'s1',type:'turn',status:'interrupted'});
 assert.match(tg.out.at(-1).text,/หยุดโดยผู้ใช้/);
 assert.ok(!tg.out.at(-1).text.startsWith('✅'));
});


test('agent phone: expiry during delayed status delivery cannot create a late approval button',async()=>{
 const tg=fakeTelegram(),agents=fakeAgents();let release;
 const original=tg.send;
 tg.send=async(chat,text,buttons)=>{if(text.includes('กำลังทำ'))await new Promise(r=>release=r);return original(chat,text,buttons);};
 const hub=createAgentPhone({telegram:tg,agents,settings:()=>({chatId:1,switches:{approve:true}}),projectDir:p=>p});
 await hub.command(1,'/new claude alpha');await hub.onEvent({id:'s1',type:'tool',label:'Read'});
 const pending=hub.onEvent({id:'s1',type:'ask',askId:'r',kind:'permission',title:'Write'});
 await Promise.resolve();await hub.onEvent({id:'s1',type:'answered',askId:'r',expired:true});release();await pending;
 assert.equal(tg.out.some(o=>o.buttons),false);
 await hub.onEvent({id:'s1',type:'turn',status:'done'});
});


test('agent phone: provider without session permission never offers or accepts always',async()=>{
 const tg=fakeTelegram(),agents=fakeAgents();const hub=createAgentPhone({telegram:tg,agents,settings:()=>({chatId:1,switches:{approve:true}}),projectDir:p=>p});
 await hub.command(1,'/new claude alpha');await hub.onEvent({id:'s1',type:'ask',askId:'r',kind:'permission',title:'Write',allowSession:false});
 const buttons=tg.out.at(-1).buttons.flat();assert.equal(buttons.some(b=>b.text.includes('ตลอด')),false);
 await hub.callback(1,buttons[0].data.replace(/:a$/,':s'));assert.equal(agents.calls.some(c=>c[0]==='answer'),false);
 await hub.callback(1,buttons[0].data);assert.equal(agents.calls.filter(c=>c[0]==='answer').length,1);
});


test('agent phone: typing answers the selected session when two sessions ask at once',async()=>{
 const tg=fakeTelegram(),agents=fakeAgents();const hub=createAgentPhone({telegram:tg,agents,settings:()=>({chatId:1,switches:{approve:true}}),projectDir:p=>p});
 await hub.command(1,'/new claude alpha');await hub.command(1,'/new codex beta');
 await hub.onEvent({id:'s1',type:'ask',askId:'a',kind:'question',title:'Alpha?'});await hub.onEvent({id:'s2',type:'ask',askId:'b',kind:'question',title:'Beta?'});
 await hub.command(1,'/use s1');await hub.command(1,'answer alpha');
 assert.deepEqual(agents.calls.at(-1),['answer','a','allow','answer alpha']);
});

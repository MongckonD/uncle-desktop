const test = require('node:test');
const assert = require('node:assert/strict');
const { createPhone } = require('../src/main/phone');

const fakeTelegram = () => {
  const out = [];
  return { out, send: async (chat, text, buttons) => { out.push({ text, buttons }); }, sendFile: async (chat, kind) => { out.push({ file: kind }); }, typing: async () => {}, download: async () => Buffer.from('bytes') };
};
const on = { chat: true, approve: true };

test('natural Thai music voice requests from Telegram execute instead of getting a chat refusal',async()=>{
 const phrases=['เปิดเพลง Paradox ให้หน่อยใน YouTube','เปิดเพลงใน Spotify ให้หน่อย เพลงอะไรก็ได้','ช่วยเปิดเพลงพาราด็อกซ์ให้หน่อย','กรุณาเปิดโปรแกรม Spotify'];
 const tasks=[],tg=fakeTelegram();let heard;
 const phone=createPhone({telegram:tg,settings:()=>({allowedUsers:[11],requirePin:false,switches:{...on,control:true}}),remote:{pc:async task=>{tasks.push(task);return 'เริ่มงานแล้ว';}},transcribe:async()=>heard,media:async()=> 'd2F2',speak:async()=>null,answer:async()=>assert.fail('Explicit music request must not fall through to chat')});
 for(const phrase of phrases){heard=phrase;await phone.onMessage({kind:'voice',chatId:11,userId:11,fileId:'v'});}
 assert.deepEqual(tasks,phrases);
});

test('allowed users in different private chats do not share chat history',async()=>{
 const tg=fakeTelegram(),seen=[];
 const phone=createPhone({telegram:tg,settings:()=>({allowedUsers:[11,22],switches:on,chatId:11}),answer:async r=>{seen.push(r.history.map(h=>h.content));return 'reply';},speak:async()=>null});
 await phone.onMessage({kind:'text',chatId:11,userId:11,text:'owner private'});
 await phone.onMessage({kind:'text',chatId:22,userId:22,text:'other private'});
 await phone.onMessage({kind:'text',chatId:11,userId:11,text:'follow-up'});
 assert.deepEqual(seen[1],[]);assert.deepEqual(seen[2],['owner private','reply']);
});

test('PIN-off still requires an allowed sender and control permission for text and voice',async()=>{
 const tg=fakeTelegram(),tasks=[];let users=[11],control=true;
 const phone=createPhone({telegram:tg,settings:()=>({allowedUsers:users,requirePin:false,switches:{...on,control},chatId:11}),checkPin:()=>assert.fail('PIN disabled'),remote:{pc:async task=>{tasks.push(task);return 'ok';}},answer:async()=>'',transcribe:async()=> 'กดเล่นเพลงให้หน่อย',media:async()=> 'd2F2',speak:async()=>null});
 const text=(id,t)=>phone.onMessage({kind:'text',chatId:-100,userId:id,text:t});const voice=id=>phone.onMessage({kind:'voice',chatId:-100,userId:id,fileId:'v'});
 await text(22,'/pc เปิด Notepad');await voice(22);assert.equal(tasks.length,0);
 await text(11,'/pc เปิด Notepad');await voice(11);assert.deepEqual(tasks,['เปิด Notepad','กดเล่นเพลงให้หน่อย']);
 control=false;await voice(11);await text(11,'/pc เปิด Notepad');assert.equal(tasks.length,2);
 users=[];await voice(11);assert.equal(tasks.length,2);
});

test('a PIN challenge in a group belongs to its requesting user',async()=>{
 const tg=fakeTelegram();let count=0;
 const phone=createPhone({telegram:tg,settings:()=>({allowedUsers:[11,22],switches:{...on,control:true}}),checkPin:p=>p==='9999',remote:{pc:async()=>{count++;return 'ok';}},answer:async()=>'',transcribe:async()=> 'กดเล่นเพลง',media:async()=> 'd2F2',speak:async()=>null});
 await phone.onMessage({kind:'voice',chatId:-100,userId:11,fileId:'v'});
 await phone.onMessage({kind:'text',chatId:-100,userId:22,text:'9999'});assert.equal(count,0);
 await phone.onMessage({kind:'text',chatId:-100,userId:11,text:'9999'});assert.equal(count,1);
});

test('phone voice computer command waits for typed PIN, then executes once without falling back to chat',async()=>{
 const tg=fakeTelegram(),tasks=[];let ai=0;
 const phone=createPhone({telegram:tg,settings:()=>({switches:{...on,control:true},chatId:1}),checkPin:p=>p==='9999',
  remote:{pc:async task=>{tasks.push(task);return 'เริ่มงานแล้ว';}},transcribe:async()=> 'กดเล่นเพลงให้หน่อย',media:async()=> 'd2F2',speak:async()=>null,answer:async()=>{ai++;return 'chat';}});
 await phone.onMessage({kind:'voice',fileId:'v',chatId:1});assert.deepEqual(tasks,[]);assert.equal(ai,0);assert.match(tg.out.at(-1).text,/PIN/);
 await phone.onMessage({kind:'text',text:'1111',chatId:1});assert.deepEqual(tasks,[]);
 await phone.onMessage({kind:'text',text:'9999',chatId:1});assert.deepEqual(tasks,['กดเล่นเพลงให้หน่อย']);
 await phone.onMessage({kind:'text',text:'9999',chatId:1});assert.equal(tasks.length,1);assert.equal(ai,0,'PIN must never reach the chat model');
});

test('phone voice jobs respect disabled control, cancellation, attempt limit, expiry and revocation',async()=>{
 const tg=fakeTelegram();let control=false,executed=0,heard='กดเล่นเพลงให้หน่อย';
 const phone=createPhone({telegram:tg,settings:()=>({switches:{...on,control},chatId:1}),checkPin:p=>p==='9999',remote:{pc:async()=>{executed++;return 'ok';}},transcribe:async()=>heard,media:async()=> 'd2F2',speak:async()=>null,answer:async()=>assert.fail('Control/PIN must not fall through to chat')});
 const voice=()=>phone.onMessage({kind:'voice',fileId:'v',chatId:1}),text=t=>phone.onMessage({kind:'text',text:t,chatId:1});
 await voice();await text('9999');assert.equal(executed,0);
 control=true;await voice();await text('/cancel');await text('9999');assert.equal(executed,0);
 await voice();for(let i=0;i<3;i++)await text('1111');await text('9999');assert.equal(executed,0);
 await voice();control=false;await text('9999');assert.equal(executed,0);
 control=true;await voice();const realNow=Date.now;
 try{const later=realNow()+91000;Date.now=()=>later;await text('9999');assert.match(tg.out.at(-1).text,/หมดเวลา/);}finally{Date.now=realNow;}
 await voice();heard='ยกเลิก';await voice();await text('9999');assert.equal(executed,0);
});

test('phone: text, voice (heard, then answered aloud), photo with its caption', async () => {
  const tg = fakeTelegram(); const asked = [], onPc = [];
  const phone = createPhone({ telegram: tg, settings: () => ({ switches: on, voiceReply: 'voice', chatId: 1 }), onReply: (q, a) => onPc.push(q),
    answer: async ({ text, images }) => { asked.push([text, images.length]); return `ตอบ: ${text}`; },
    transcribe: async () => 'พรุ่งนี้มีนัดไหม', speak: async () => ({ bytes: Buffer.from('a'), ext: 'mp3', mime: 'audio/mpeg' }), media: async () => 'd2F2' });
  await phone.onMessage({ kind: 'text', text: 'สวัสดี', chatId: 1 });
  await phone.onMessage({ kind: 'voice', fileId: 'v', mime: 'audio/ogg', chatId: 1 });
  await phone.onMessage({ kind: 'photo', fileId: 'p', chatId: 1, caption: 'อ่านใบเสร็จ' });
  assert.deepEqual(asked, [['สวัสดี', 0], ['พรุ่งนี้มีนัดไหม', 0], ['อ่านใบเสร็จ', 1]]);
  assert.ok(tg.out.some((o) => o.text === '🎙 ได้ยินว่า: พรุ่งนี้มีนัดไหม'));
  assert.equal(tg.out.filter((o) => o.file === 'audio').length, 1); // only the voice message got a voice reply
  assert.equal(phone.history.length, 6);
  assert.deepEqual(onPc, ['สวัสดี', 'พรุ่งนี้มีนัดไหม', 'อ่านใบเสร็จ']); // each answer offered to the computer too
});

test('phone: approvals with buttons; off when approving from the phone is off', async () => {
  const tg = fakeTelegram(); let s = { switches: on, chatId: 1 };
  const phone = createPhone({ telegram: tg, settings: () => s, answer: async () => '', transcribe: async () => '', speak: async () => null, media: async () => '' });
  const asking = phone.confirm(1, { server: 'gmail', name: 'send_email' }, { to: 'a@b.c' });
  await null;
  const id = /ask:(\w+):yes/.exec(tg.out.at(-1).buttons[0][0].data)[1];
  await phone.onMessage({ kind: 'callback', data: `ask:${id}:yes`, chatId: 1 });
  assert.equal(await asking, true);
  s = { switches: { ...on, approve: false }, chatId: 1 };
  assert.equal(await phone.confirm(1, { server: 'gmail', name: 'send_email' }, {}), false);
});

test('phone: alerts always, only when away, or never', async () => {
  const tg = fakeTelegram(); let s = { switches: on, chatId: 1, notify: 'away' }; let idle = 10;
  const phone = createPhone({ telegram: tg, settings: () => s, idleSeconds: () => idle, answer: async () => '', transcribe: async () => '', speak: async () => null, media: async () => '' });
  await phone.notify({ kind: 'mail', from: 'Boss', subject: 'Q4', link: 'https://mail.google.com/x' });
  assert.equal(tg.out.length, 0);
  idle = 600; await phone.notify({ kind: 'mail', from: 'Boss', subject: 'Q4', link: 'https://mail.google.com/x' });
  assert.equal(tg.out[0].text, '📧 เมลสำคัญจาก Boss\nQ4'); assert.equal(tg.out[0].buttons[0][0].url, 'https://mail.google.com/x');
  s = { ...s, notify: 'off' }; await phone.notify({ kind: 'event', minutes: 5, summary: 'x' });
  assert.equal(tg.out.length, 1);
});

test('phone: the computer from your phone only with its switch on and the PIN; mail quick buttons', async () => {
  const tg = fakeTelegram(); let sw = { ...on, screen: false, control: true, power: false }; const asked = [];
  const remote = { screen: async () => Buffer.from('jpg'), pc: async (task) => `เริ่ม ${task}`, power: async (a) => a };
  const phone = createPhone({ telegram: tg, settings: () => ({ switches: sw, chatId: 1 }), remote, checkPin: (p) => p === '9999',
    answer: async ({ text }) => { asked.push(text); return 'ok'; }, transcribe: async () => '', speak: async () => null, media: async () => '' });
  await phone.onMessage({ kind: 'text', text: '/screen 9999', chatId: 1 });
  assert.match(tg.out.at(-1).text, /ปิดอยู่/);
  await phone.onMessage({ kind: 'text', text: '/pc 1111 เปิด Spotify', chatId: 1 });
  assert.match(tg.out.at(-1).text, /PIN/);
  await phone.onMessage({ kind: 'text', text: '/pc 9999 เปิด Spotify', chatId: 1 });
  assert.equal(tg.out.at(-1).text, 'เริ่ม เปิด Spotify');
  sw = { ...sw, screen: true };
  await phone.onMessage({ kind: 'text', text: '/screen 9999', chatId: 1 });
  assert.equal(tg.out.at(-1).file, 'photo');
  await phone.notify({ kind: 'mail', id: '18c2abcdef', from: 'A', subject: 'B', link: 'https://mail.google.com/x' });
  assert.deepEqual(tg.out.at(-1).buttons[1].map((b) => b.data), ['m:s:18c2abcdef', 'm:r:18c2abcdef', 'm:t:18c2abcdef']);
  await phone.onMessage({ kind: 'callback', data: 'm:s:18c2abcdef', chatId: 1 });
  assert.match(asked.at(-1), /สรุปเมล id 18c2abcdef/);
});

test('phone: a computer job from the phone asks, steps and ends on the phone; /tell, /pcstop, /pc by voice', async () => {
  const tg = fakeTelegram(), calls = [];
  const s = { switches: { ...on, control: true, screen: true }, chatId: 1, pcAsk: true, pcSteps: true, pcShot: true };
  const remote = { pc: async (t) => { calls.push(['pc', t]); return 'เริ่มแล้ว'; }, answer: (v) => { calls.push(['answer', v.yes, v.text, v.approvalId]); return true; },
    tell: (t) => { calls.push(['tell', t]); return true; }, stop: () => { calls.push(['stop']); return true; }, screen: async () => Buffer.from('png') };
  const phone = createPhone({ telegram: tg, settings: () => s, remote, checkPin: (p) => p === '1234', answer: async () => '', transcribe: async () => 'เปิดเพลง', speak: async () => null, media: async () => 'd2F2' });
  await phone.onMessage({ kind: 'text', text: '/pc 1234 เปิด Spotify', chatId: 1 });
  await phone.pcState({ id: 'j', status: 'confirm', approvalId: 'a1', question: 'กดเล่นไหม', steps: [{ label: 'เปิด Spotify' }] });
  assert.ok(tg.out.some((o) => o.text === '🔧 เปิด Spotify') && tg.out.some((o) => o.text === '🖥 กดเล่นไหม'));
  await phone.onMessage({ kind: 'callback', data: 'pc:yes', chatId: 1 });
  await phone.pcState({ id: 'j', status: 'confirm', approvalId: 'a2', question: 'เพลงไหน', answerNeeded: true, steps: [{ label: 'เปิด Spotify' }] });
  await phone.onMessage({ kind: 'text', text: 'เพลงชิล', chatId: 1 });
  await phone.onMessage({ kind: 'text', text: '/tell เบาเสียงด้วย', chatId: 1 });
  await phone.onMessage({ kind: 'text', text: '/pcstop', chatId: 1 });
  await phone.pcState({ id: 'j', status: 'done', message: 'เล่นแล้ว', steps: [] });
  await phone.onMessage({ kind: 'text', text: '/pc 1234', chatId: 1 });
  await phone.onMessage({ kind: 'voice', fileId: 'v', mime: 'audio/ogg', chatId: 1 });
  assert.deepEqual(calls, [['pc', 'เปิด Spotify'], ['answer', true, '', 'a1'], ['answer', true, 'เพลงชิล', 'a2'], ['tell', 'เบาเสียงด้วย'], ['stop'], ['pc', 'เปิดเพลง']]);
  assert.ok(tg.out.some((o) => o.text === '✅ งานบนคอม: เล่นแล้ว') && tg.out.some((o) => o.file === 'photo'));
});

test('phone: /hide and /show put her out of sight on the computer and back', async () => {
  const tg = fakeTelegram(), ghost = [];
  const phone = createPhone({ telegram: tg, settings: () => ({ switches: on, chatId: 1 }), setGhost: (v) => ghost.push(v), answer: async () => '', transcribe: async () => '', speak: async () => null, media: async () => '' });
  await phone.onMessage({ kind: 'text', text: '/hide', chatId: 1 });
  await phone.onMessage({ kind: 'text', text: '/show', chatId: 1 });
  assert.deepEqual(ghost, [true, false]);
});

test('phone: /status, /say and /music (behind the computer switch), text files read out, PDFs refused', async () => {
  const tg = fakeTelegram(), did = [], asked = [];
  let sw = { ...on, control: false };
  const phone = createPhone({ telegram: tg, settings: () => ({ switches: sw, chatId: 1 }), status: async () => '🖥 คอมเปิดอยู่', player: async (a) => did.push(a), say: (t) => did.push(`say:${t}`),
    answer: async ({ text }) => { asked.push(text); return 'ok'; }, transcribe: async () => '', speak: async () => null, media: async () => '' });
  tg.download = async () => Buffer.from('name,qty\negg,2\n');
  await phone.onMessage({ kind: 'text', text: '/status', chatId: 1 });
  assert.equal(tg.out.at(-1).text, '🖥 คอมเปิดอยู่');
  await phone.onMessage({ kind: 'text', text: '/say สวัสดี', chatId: 1 });
  assert.match(tg.out.at(-1).text, /ปิดอยู่/); assert.deepEqual(did, []); // switch off: nothing happens
  sw = { ...on, control: true };
  await phone.onMessage({ kind: 'text', text: '/say สวัสดี', chatId: 1 });
  await phone.onMessage({ kind: 'text', text: '/music prev', chatId: 1 });
  await phone.onMessage({ kind: 'text', text: '/music dance', chatId: 1 });
  assert.deepEqual(did, ['say:สวัสดี', 'previous']);
  assert.match(tg.out.at(-1).text, /ใช้แบบนี้: \/music/);
  await phone.onMessage({ kind: 'file', fileId: 'f', name: 'orders.csv', mime: 'text/csv', size: 20, chatId: 1, caption: 'มีกี่แถว' });
  assert.ok(asked[0].startsWith('มีกี่แถว') && asked[0].includes('--- orders.csv ---') && asked[0].includes('egg,2'));
  await phone.onMessage({ kind: 'file', fileId: 'p', name: 'bill.pdf', mime: 'application/pdf', size: 20, chatId: 1 });
  assert.match(tg.out.at(-1).text, /PDF.*ยังไม่รองรับ/);
  assert.equal(asked.length, 1);
});

test('phone: a photo sent while an agent session is picked is saved in its project and the session told where', async () => {
  const tg = fakeTelegram(), told = [], saved = [];
  const hub = { current: 's1', project: 'shop', say: async (chat, text) => told.push(text), command: async () => false, callback: async () => false, HELP: '' };
  const phone = createPhone({ telegram: tg, settings: () => ({ switches: on, chatId: 1 }), hub, coding: { saveImage: (p, bytes) => { saved.push([p, bytes.length]); return '.uncle/inbox/1.jpg'; } },
    answer: async () => '', transcribe: async () => '', speak: async () => null, media: async () => '' });
  await phone.onMessage({ kind: 'photo', fileId: 'p', chatId: 1, caption: 'ทำให้เหมือนรูปนี้' });
  assert.deepEqual(saved, [['shop', 5]]);
  assert.deepEqual(told, ['ทำให้เหมือนรูปนี้\n(ดูรูปที่ .uncle/inbox/1.jpg)']);
});

test('PIN-armed voice capture remains bound to the sender after merging live Telegram jobs', async () => {
  const tasks = [], tg = fakeTelegram();
  const phone = createPhone({ telegram: tg, settings: () => ({ allowedUsers: [11, 22], switches: { ...on, control: true } }),
    checkPin: p => p === '1234', remote: { pc: async task => { tasks.push(task); return 'ok'; } },
    transcribe: async () => 'open editor', media: async () => 'd2F2', speak: async () => null, answer: async () => 'chat' });
  await phone.onMessage({ kind: 'text', chatId: -100, userId: 11, text: '/pc 1234' });
  await phone.onMessage({ kind: 'voice', chatId: -100, userId: 22, fileId: 'v' });
  assert.deepEqual(tasks, []);
  await phone.onMessage({ kind: 'voice', chatId: -100, userId: 11, fileId: 'v' });
  assert.deepEqual(tasks, ['open editor']);
});

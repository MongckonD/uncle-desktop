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
  const tg = fakeTelegram(); const asked = [];
  const phone = createPhone({ telegram: tg, settings: () => ({ switches: on, voiceReply: 'voice', chatId: 1 }),
    answer: async ({ text, images }) => { asked.push([text, images.length]); return `ตอบ: ${text}`; },
    transcribe: async () => 'พรุ่งนี้มีนัดไหม', speak: async () => ({ bytes: Buffer.from('a'), ext: 'mp3', mime: 'audio/mpeg' }), media: async () => 'd2F2' });
  await phone.onMessage({ kind: 'text', text: 'สวัสดี', chatId: 1 });
  await phone.onMessage({ kind: 'voice', fileId: 'v', mime: 'audio/ogg', chatId: 1 });
  await phone.onMessage({ kind: 'photo', fileId: 'p', chatId: 1, caption: 'อ่านใบเสร็จ' });
  assert.deepEqual(asked, [['สวัสดี', 0], ['พรุ่งนี้มีนัดไหม', 0], ['อ่านใบเสร็จ', 1]]);
  assert.ok(tg.out.some((o) => o.text === '🎙 ได้ยินว่า: พรุ่งนี้มีนัดไหม'));
  assert.equal(tg.out.filter((o) => o.file === 'audio').length, 1); // only the voice message got a voice reply
  assert.equal(phone.history.length, 6);
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

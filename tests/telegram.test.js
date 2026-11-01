const test = require('node:test');
const assert = require('node:assert/strict');
const { createTelegram } = require('../src/main/telegram');

test('telegram authorizes actual sender IDs including callback sender, never the shared chat or bot',async()=>{
 const got=[];let users=[11];const tg=createTelegram({getToken:()=> 'T',getChat:()=>-100,getAllowedUsers:()=>users,setChat(){},onMessage:m=>got.push(m),fetcher:async()=>({json:async()=>({ok:true,result:{}})})});
 const msg=(id,extra={})=>({message:{chat:{id:-100},from:{id},text:'hi',...extra}});
 await tg.handle(msg(22));await tg.handle(msg(11,{from:{id:11,is_bot:true}}));assert.equal(got.length,0);
 await tg.handle(msg(11));assert.equal(got[0].userId,11);
 await tg.handle({callback_query:{id:'c',from:{id:22},data:'approve',message:{chat:{id:-100},from:{id:11}}}});assert.equal(got.length,1);
 await tg.handle({callback_query:{id:'c',from:{id:11},data:'approve',message:{chat:{id:-100},from:{id:999,is_bot:true}}}});assert.equal(got.length,2);
 users=[22];await tg.handle(msg(11));assert.equal(got.length,2);
 await tg.handle({message:{chat:{id:22},from:{id:22},text:'hi'}});assert.equal(got.length,3);
});

test('telegram: only the paired chat is heard; pairing with the code; message kinds', async () => {
  let chat = null; const got = []; const sent = [];
  const fetcher = async (url, init) => { sent.push([url.split('/').pop(), JSON.parse(init.body || '{}')]); return { ok: true, json: async () => ({ ok: true, result: {} }) }; };
  const tg = createTelegram({ getToken: () => 'T', getChat: () => chat, setChat: (c) => { chat = c; }, onMessage: (m) => got.push(m), fetcher });
  await tg.handle({ message: { chat: { id: 7 }, text: 'hi' } });
  assert.equal(got.length, 0); assert.equal(chat, null);
  const code = tg.startPairing();
  await tg.handle({ message: { chat: { id: 9 }, text: '000000' } });
  assert.equal(chat, null);
  await tg.handle({ message: { chat: { id: 9 }, text: `/start ${code}` } });
  assert.equal(chat, 9); assert.equal(sent.at(-1)[0], 'sendMessage');
  await tg.handle({ message: { chat: { id: 9 }, text: 'พรุ่งนี้มีนัดไหม' } });
  await tg.handle({ message: { chat: { id: 9 }, voice: { file_id: 'v1', mime_type: 'audio/ogg' } } });
  await tg.handle({ message: { chat: { id: 9 }, photo: [{ file_id: 's' }, { file_id: 'big' }], caption: 'อ่านใบเสร็จ' } });
  await tg.handle({ message: { chat: { id: 7 }, text: 'แอบสั่ง' } });
  assert.deepEqual(got.map((m) => [m.kind, m.text || m.fileId]), [['text', 'พรุ่งนี้มีนัดไหม'], ['voice', 'v1'], ['photo', 'big']]);
});

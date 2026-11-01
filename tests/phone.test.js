const test = require('node:test');
const assert = require('node:assert/strict');
const { createPhone } = require('../src/main/phone');

const fakeTelegram = () => {
  const out = [];
  return { out, send: async (chat, text, buttons) => { out.push({ text, buttons }); }, sendFile: async (chat, kind) => { out.push({ file: kind }); }, typing: async () => {}, download: async () => Buffer.from('bytes') };
};
const on = { chat: true, approve: true };

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

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
global.matchMedia = () => ({ matches: false, addEventListener() {} });
const commands = import('../src/renderer/js/voice-commands.js');
async function controller() {
  const { Listening } = await import('../src/renderer/js/listening.js');
  const v = Object.create(Listening.prototype);
  Object.assign(v, { serial: 1, settings: { mode: 'wake', followSeconds: 10 }, stream: {}, status: {}, indicator: {}, transcript: {}, sendButton: {}, confirmButtons: {}, speech: { active: false, play: async () => {}, stop() {} }, host: { listeningStop() {} }, releaseMic() {}, hide() {}, onVisibility() {}, chat: {}, responses: [] });
  v.respond = async text => v.responses.push(text);
  return v;
}
test('voice confirmation accepts only clear yes/no, with negative phrases taking precedence', async () => {
  const { confirmationAnswer } = await commands;
  for (const text of ['ใช่ครับ', 'ยืนยัน', 'ได้เลยค่ะ', 'yes']) assert.equal(confirmationAnswer(text), true);
  for (const text of ['ไม่ใช่ครับ', 'ยกเลิก', 'ไม่ต้องทำ', 'no']) assert.equal(confirmationAnswer(text), false);
  for (const text of ['ใช่แต่เปลี่ยนเป็นอีกแอป', 'เปิด Spotify', '']) assert.equal(confirmationAnswer(text), null);
});
test('clear voice commands use the real Chat parser and doNow without an LLM round trip', async () => {
  const { Chat } = await import('../src/renderer/js/chat.js'); const { runVoiceCommand } = await commands;
  const chat = Object.create(Chat.prototype); const calls = [], replies = [];
  Object.assign(chat, { apps: [], brain: { custom: {}, t: { chat: { media: { volup: 'เพิ่มเสียงแล้ว' } } } }, capri: { pulse() {} }, host: { media: async action => { calls.push(action); return true; } } });
  assert.equal(await runVoiceCommand({ chat, text: 'เพิ่มเสียง', respond: text => replies.push(text), ask: () => assert.fail('should not ask') }), true);
  assert.deepEqual(calls, ['volup']); assert.deepEqual(replies, ['เพิ่มเสียงแล้ว']);
});
test('closing an app executes once only after voice yes; no/unknown/timeout/stop cannot close', async () => {
  const { runVoiceCommand } = await commands; const v = await controller(); let closed = 0;
  const chat = { asked: () => null, host: { findApp: async () => ({ name: 'notepad', label: 'Notepad' }), closeApp: async () => { closed++; return { running: false }; } } };
  const ask = () => runVoiceCommand({ chat, text: 'ปิดโปรแกรม Notepad', ask: request => v.requestConfirmation(request), respond: v.respond });
  await ask(); assert.equal(closed, 0);
  await v.answerConfirmation('ใช่ครับ'); await v.answerConfirmation('ใช่'); assert.equal(closed, 1);
  await ask(); await v.answerConfirmation('ไม่ใช่'); assert.equal(closed, 1);
  await ask(); await v.answerConfirmation('ใช่แต่เปลี่ยนแอป'); assert.equal(closed, 1);
  v.confirmation.until = Date.now() - 1; v.expireConfirmation(); await v.answerConfirmation('ใช่'); assert.equal(closed, 1);
  await ask(); v.stop(); await v.answerConfirmation('ใช่'); assert.equal(closed, 1);
});
test('missing reminder time asks for clarification, and unsupported actions never execute', async () => {
  const { runVoiceCommand } = await commands; let request, fallback;
  const chat = { asked: () => ({ kind: 'remind', text: 'พักสายตา' }), doNow: () => assert.fail('missing time cannot execute') };
  await runVoiceCommand({ chat, text: 'เตือนฉันให้พักสายตา', ask: r => { request = r; }, fallback: text => { fallback = text; } });
  await request.clarify('อีก 5 นาที'); assert.match(fallback, /อีก 5 นาที/);
  let response;
  await runVoiceCommand({ chat: { asked: () => assert.fail('not a supported tool') }, text: 'ลบไฟล์ทั้งหมด', respond: text => { response = text; } });
  assert.match(response, /ยังไม่ได้ดำเนินการ/);
});

test('missing app asks through normal chat and speech without opening voice settings',async()=>{
  const {runVoiceCommand}=await commands,v=await controller();const replies=[],spoken=[];let retried,visibility=0;
  v.root={hidden:true};v.onVisibility=()=>visibility++;
  v.chat.voiceResult=line=>replies.push(line);v.speech.play=async line=>spoken.push(line);
  const chat={asked:()=>({kind:'open',text:'missing-app'}),doNow:async()=>null};
  await runVoiceCommand({chat,text:'เปิดโปรแกรม missing-app',ask:r=>v.requestConfirmation(r),fallback:text=>{retried=text;}});
  assert.equal(v.root.hidden,true,'Conversational clarification must not open a settings dialog');
  assert.equal(visibility,0);assert.match(replies[0],/ยังหาโปรแกรม/);assert.deepEqual(spoken,replies);
  await v.answerConfirmation('Notepad');assert.equal(retried,'เปิดโปรแกรม Notepad');
});
test('late confirmation transcription is discarded after expiry instead of becoming a new command', async () => {
  const v = await controller(); v.heard = {}; let sent = 0, resolve;
  v.host.listeningTranscribe = () => new Promise(done => { resolve = done; }); v.submit = async () => { sent++; };
  v.confirmation = { until: Date.now() + 1000, execute: () => { sent++; } };
  const pending = v.process([]); v.confirmation.until = Date.now() - 1; v.expireConfirmation(); resolve({ text: 'ใช่' }); await pending;
  assert.equal(sent, 0); assert.equal(v.confirmation, null);
});
test('follow-up command may include the wake phrase again and confirmations need no wake phrase', async () => {
  const v = await controller(); let submitted;
  v.settings.wakeWords = ['เฮ้ อังเคิล']; v.settings.review = false; v.followUntil = Date.now() + 10000;
  v.host.listeningTranscribe = async () => ({ text: 'เฮ้ อังเคิล เพิ่มเสียง' });
  v.submit = async () => { submitted = v.transcript.value; v.pending = false; };
  await v.process([]); assert.equal(submitted, 'เพิ่มเสียง');
  let confirmed = false; v.confirmation = { question: 'ใช่ไหม', until: Date.now() + 20000, execute: () => { confirmed = true; } };
  v.host.listeningTranscribe = async () => ({ text: 'ใช่ครับ' }); await v.process([]); assert.equal(confirmed, true);
});
test('Thai spoken durations normalize before the existing reminder parser', async () => {
  const { voiceTimeNumbers } = await commands;
  const { parseReminder } = await import('../src/renderer/js/reminders.js');
  assert.equal(voiceTimeNumbers('เตือนอีกยี่สิบเอ็ดนาที'), 'เตือนอีก21นาที');
  const before = Date.now();
  const reminder = parseReminder(voiceTimeNumbers('เตือนฉันให้พักสายตาอีกห้านาที'));
  assert.ok(reminder.at >= before + 299000 && reminder.at <= Date.now() + 301000);
  assert.equal(voiceTimeNumbers('ฉันมีเพื่อนชื่อห้า'), 'ฉันมีเพื่อนชื่อห้า');
});
test('confirmation capture accepts a short yes while normal capture still rejects clicks', async () => {
  const { Utterance } = await import('../src/renderer/js/listening-audio.js');
  const voice = new Float32Array(1600).fill(0.05), silence = new Float32Array(1600);
  const vad = new Utterance(16000, 0.015); vad.minimumSeconds = 0.1;
  vad.push(voice); let result;
  for (let i=0;i<10;i++) result=vad.push(silence)||result;
  assert.ok(result);
  const normal = new Utterance(16000,0.015); normal.push(voice);
  for (let i=0;i<10;i++) assert.equal(normal.push(silence),null);
});

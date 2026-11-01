'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { createListening, listeningSettings, validWav } = require('../src/main/listening');
const audio = import('../src/renderer/js/listening-audio.js');

test('continuous listening survives a failed utterance and accepts the next one without reopening settings',async()=>{
  const {Listening}=await import('../src/renderer/js/listening.js');
  for(const mode of ['wake','always']){
    const v=Object.create(Listening.prototype),stream={};let calls=0,sent=0;
    Object.assign(v,{serial:1,stream,root:{hidden:true},settings:{mode,wakeWords:['ลุงเดฟ'],review:false},followUntil:0,
      status:{},indicator:{},transcript:{},sendButton:{},chat:{},speech:{active:false},onVisibility(){},
      releaseMic(){this.stream=null;},host:{listeningStop(){},listeningTranscribe:async()=>{if(++calls===1)throw Error('temporary transcription failure');return {text:mode==='wake'?'ลุงเดฟ เปิด Notepad':'เปิด Notepad'};}},
      submit:async()=>{sent++;v.pending=false;}});
    await v.process([]).catch(e=>v.error(e));
    assert.equal(v.stream,stream,mode+': one failed utterance must not turn off continuous capture');
    assert.equal(v.root.hidden,true);assert.equal(v.serial,1);assert.equal(v.processing,false);
    await v.process([]);assert.equal(sent,1,mode+': next utterance should still work');
    v.stop();assert.equal(v.stream,null);assert.equal(v.serial,2);
  }
});

test('closing chat keeps wake/always capture active but push-to-talk still stops',async()=>{
  const {Listening}=await import('../src/renderer/js/listening.js');
  for(const mode of ['wake','always','push']){
    const v=Object.create(Listening.prototype);let stopped=0,silenced=0;
    Object.assign(v,{settings:{mode},stream:{},speech:{stop(){silenced++;}},stop(){stopped++;this.stream=null;}});
    v.endConversation();assert.equal(silenced,1);assert.equal(stopped,mode==='push'?1:0);
    assert.equal(!!v.stream,mode!=='push');
  }
});
test('listening settings validate custom wake phrases, consent, devices and limits', () => {
  assert.deepEqual(listeningSettings({ wakeWords: [' ลุงเดฟ ', 'ลุงเดฟ', 'Hey Uncle'] }).wakeWords, ['ลุงเดฟ', 'Hey Uncle']);
  for (const bad of [{ mode: 'always-upload' }, { wakeWords: [] }, { wakeWords: ['x'] }, { followSeconds: 31 }, { review: 'false' }, { threshold: 0 }, { deviceId: {} }]) assert.throws(() => listeningSettings(bad));
});
test('wake phrases accept normalized prefixes and strip only the trigger', async () => {
  const { wakeCommand } = await audio;
  assert.equal(wakeCommand('เฮ้ อังเคิล เปิดโปรแกรม', ['เฮ้อังเคิล']), 'เปิดโปรแกรม');
  assert.equal(wakeCommand('HEY, UNCLE! ตั้งเตือน', ['Hey Uncle']), 'ตั้งเตือน');
  assert.equal(wakeCommand('ลุงเดฟ', ['ลุงเดฟ']), '');
  assert.equal(wakeCommand('ฉันคุยกับลุงเดฟ', ['ลุงเดฟ']), null);
  assert.equal(wakeCommand('อังเคิลเดฟ เปิดเพลง', ['อังเคิล', 'อังเคิลเดฟ']), 'เปิดเพลง');
});
test('VAD rejects silence and clicks, captures speech once and writes valid resampled WAV', async () => {
  const { Utterance, wav16 } = await audio;
  const vad = new Utterance(48000, 0.015), silence = new Float32Array(4800), voice = silence.map((_, i) => Math.sin(i / 6) * 0.2);
  for (let i = 0; i < 30; i++) assert.equal(vad.push(silence), null);
  vad.push(voice); for (let i = 0; i < 12; i++) assert.equal(vad.push(silence), null);
  for (let i = 0; i < 7; i++) assert.equal(vad.push(voice), null);
  let wav; for (let i = 0; i < 10; i++) wav = vad.push(silence) || wav;
  assert.ok(validWav(wav)); assert.equal(vad.push(silence), null);
  assert.equal(validWav(wav16([new Float32Array(48000)], 48000)).length, 32044);
  assert.throws(() => validWav(Buffer.from('not audio')));
});
test('cloud STT gates consent/key, fixes endpoint/language, and sanitizes provider errors', async () => {
  const { wav16 } = await audio, wav = wav16([new Float32Array(16000)], 16000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uncle-stt-test-'));
  let calls = 0;
  const service = createListening({ directory, fetcher: async (url, request) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/audio/transcriptions'); assert.equal(request.body.get('language'), 'th'); assert.equal(request.body.get('file').size, wav.length);
    return { ok: true, json: async () => ({ text: 'เปิดโปรแกรม' }) };
  } });
  try {
    await assert.rejects(service.transcribe(wav, { provider: 'openai' }, 'secret'), /ยินยอม/);
    await assert.rejects(service.transcribe(wav, { provider: 'openai', cloudConsent: true }), /key/);
    assert.equal(calls, 0);
    assert.equal((await service.transcribe(wav, { provider: 'openai', cloudConsent: true }, 'secret')).text, 'เปิดโปรแกรม');
    await assert.rejects(service.transcribe(wav, { provider: 'openai', cloudConsent: true }, 'secret', true), /ดาวน์โหลด/);
    assert.equal(calls, 1, 'wake-only cannot upload to cloud');
    const denied = createListening({ directory, fetcher: async () => ({ ok: false, status: 401 }) });
    await assert.rejects(denied.transcribe(wav, { provider: 'openai', cloudConsent: true }, 'secret'), /key ไม่ถูกต้อง/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('cancel aborts a pending cloud transcription', async () => {
  const { wav16 } = await audio;
  const service = createListening({ directory: os.tmpdir(), fetcher: (_url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })) });
  const pending = service.transcribe(wav16([new Float32Array(16000)], 16000), { provider: 'openai', cloudConsent: true }, 'secret');
  service.stop(); await assert.rejects(pending, /ยกเลิก/);
});
test('model install starts downloading, rejects a bad hash and leaves no partial file', { skip: process.platform !== 'win32' || process.arch !== 'x64' }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uncle-install-test-'));
  const urls = [];
  const service = createListening({ directory, fetcher: async (url) => { urls.push(url); return { ok: true, body: [Buffer.from('not the pinned file')] }; } });
  try {
    await assert.rejects(service.install(() => {}, 'thai-medium'), /SHA256/);
    assert.deepEqual(urls, ['https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip']);
    assert.deepEqual(await fs.readdir(directory), []);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('local STT uses argument array, forces Thai, and deletes temporary recordings', async () => {
  const { wav16 } = await audio;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uncle-local-test-')); let input;
  await fs.mkdir(path.join(directory, 'runtime', 'Release'), { recursive: true });
  await fs.writeFile(path.join(directory, 'ggml-small-q5_1.bin'), 'fixture'); await fs.writeFile(path.join(directory, 'runtime', 'Release', 'whisper-cli.exe'), 'fixture');
  const service = createListening({ directory, executable: path.join(directory, 'runtime', 'Release', 'whisper-cli.exe'), runner: async (_exe, args, options) => {
    assert.equal(options.windowsHide, true); assert.equal(args[args.indexOf('-l') + 1], 'th');
    input = args[args.indexOf('-f') + 1]; assert.ok(await fs.stat(input)); await fs.writeFile(`${args[args.indexOf('-of') + 1]}.txt`, 'ลุงเดฟ เปิดเพลง');
  } });
  try { assert.equal((await service.transcribe(wav16([new Float32Array(16000)], 16000), {})).text, 'ลุงเดฟ เปิดเพลง'); await assert.rejects(fs.stat(input)); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('wake mode ignores ordinary speech, reviews triggered commands and never submits stale results', async () => {
  const { Listening } = await import('../src/renderer/js/listening.js');
  const v = Object.create(Listening.prototype);
  let heard = 'เปิดเพลง', sent = 0, wakeOnly;
  Object.assign(v, { serial: 1, stream: {}, settings: { mode: 'wake', wakeWords: ['ลุงเดฟ'], review: true }, followUntil: 0, transcript: {}, sendButton: {}, status: {}, indicator: {}, host: { listeningTranscribe: async (_bytes, waking) => { wakeOnly = waking; return { text: heard }; } }, show: async () => {}, idle: () => {}, submit: async () => { sent++; } });
  await v.process([]); assert.equal(sent, 0); assert.equal(v.pending, undefined); assert.equal(wakeOnly, true);
  heard = 'ลุงเดฟ เปิดเพลง'; await v.process([]); assert.equal(v.transcript.value, 'เปิดเพลง'); assert.equal(v.pending, true); assert.equal(sent, 0);
  v.pending = false; v.followUntil = 0; v.settings.review = false; await v.process([]); assert.equal(sent, 1);
  v.host.listeningTranscribe = () => new Promise(resolve => { v.resolve = resolve; }); v.followUntil = 0; v.pending = false;
  const pending = v.process([]); v.serial++; v.resolve({ text: 'ลุงเดฟ เปิดโปรแกรม' }); await pending; assert.equal(sent, 1);
});
test('twenty Thai voice command transcripts reach wake matching without losing numbers or app names', async () => {
  const { wakeCommand } = await audio;
  const commands = ['เปิด Notepad', 'เปิดเครื่องคิดเลข', 'เปิด Spotify', 'เปิด Steam', 'เปิดเว็บไซต์ youtube.com', 'เปิดเพลงแจ๊ส', 'หยุดเพลง', 'เพลงถัดไป', 'เพลงก่อนหน้า', 'เพิ่มเสียง', 'ลดเสียง', 'เตือนฉันอีก 5 นาที', 'เตือนดื่มน้ำใน ๑๕ นาที', 'เตือนประชุมพรุ่งนี้ ๐๙:๓๐', 'เรียกฉันว่าปุ๊กกี้', 'จำไว้ว่าฉันชอบแมว', 'ดูหน้าจอของฉัน', 'แคปหน้าจอ', 'วันนี้ทำอะไรดี', 'ปิดโปรแกรม Notepad'];
  for (const command of commands) assert.equal(wakeCommand(`ลุงเดฟ ${command}`, ['ลุงเดฟ']), command);
});
test('Thai wake phrase still works when STT omits a tone mark', async () => {
  const { wakeCommand } = await audio;
  assert.equal(wakeCommand('เฮ อังเคิล เปิด Notepad', ['เฮ้ อังเคิล']), 'เปิด Notepad');
  assert.equal(wakeCommand('เขาคุยกับ เฮ อังเคิล', ['เฮ้ อังเคิล']), null);
});
test('unmatched wake speech stays visible as heard text without enabling a command', async () => {
  const { Listening } = await import('../src/renderer/js/listening.js');
  const v = Object.create(Listening.prototype);
  Object.assign(v, { serial: 1, stream: {}, settings: { mode: 'wake', wakeWords: ['เฮ้ อังเคิล'], review: true }, followUntil: 0, transcript: { value: '' }, heard: { value: '' }, sendButton: { disabled: true }, status: {}, indicator: {}, host: { listeningTranscribe: async () => ({ text: 'เฮ้ อังเกิล เปิดเพลง' }) } });
  await v.process([]);
  assert.equal(v.heard.value, 'เฮ้ อังเกิล เปิดเพลง');
  assert.equal(v.transcript.value, ''); assert.equal(v.sendButton.disabled, true);
  v.idle(); assert.match(v.status.textContent, /ไม่พบคำเรียก/);
});

 test('Thai options validate model, pause and bounded vocabulary', () => {
  assert.equal(listeningSettings({ provider: 'gemini', localModel: 'thai-medium' }).silenceSeconds, 1.3);
  for (const options of [{ localModel: '../model' }, { silenceSeconds: 0 }, { silenceSeconds: 3 }, { vocabulary: 'a'.repeat(601) }]) assert.throws(() => listeningSettings(options));
});
test('Gemini sends WAV with Thai vocabulary, no stored interaction, and never uploads wake audio', async () => {
  const { wav16 } = await audio; const wav = wav16([new Float32Array(16000)], 16000);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uncle-gemini-test-')); let calls = 0;
  const service = createListening({ directory, fetcher: async (url, request) => {
    calls++; assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
    const body = JSON.parse(request.body); assert.equal(body.store, false); assert.equal(body.model, 'gemini-3.5-transcribe');
    assert.deepEqual(Buffer.from(body.input[0].data, 'base64'), Buffer.from(wav));
    assert.deepEqual(body.generation_config.transcription_config.language_codes, ['th-TH', 'en-US']);
    assert.ok(body.generation_config.transcription_config.custom_vocabulary.includes('ลุงเดฟ'));
    return { ok: true, json: async () => ({ status: 'completed', steps: [{ type: 'model_output', content: [{ type: 'text', text: 'เปิด Notepad' }] }] }) };
  } });
  const options = { provider: 'gemini', cloudConsent: true, wakeWords: ['ลุงเดฟ'] };
  try {
    await assert.rejects(service.transcribe(wav, { ...options, cloudConsent: false }, 'secret'), /ยินยอม/);
    await assert.rejects(service.transcribe(wav, options), /key/);
    const result = await service.transcribe(wav, options, 'secret'); assert.equal(result.text, 'เปิด Notepad'); assert.equal(result.provider, 'gemini'); assert.ok(result.elapsedMs >= 0);
    await assert.rejects(service.transcribe(wav, options, 'secret', true), /ดาวน์โหลด/); assert.equal(calls, 1);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('Thai medium is also used for wake-only audio without a network request', async () => {
  const { wav16 } = await audio; const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uncle-thai-test-'));
  await fs.mkdir(path.join(directory, 'runtime', 'Release'), { recursive: true });
  await fs.writeFile(path.join(directory, 'runtime', 'Release', 'whisper-cli.exe'), 'fixture');
  await fs.writeFile(path.join(directory, 'thonburian-medium-q5_0.bin'), 'fixture');
  const service = createListening({ directory, executable: path.join(directory, 'runtime', 'Release', 'whisper-cli.exe'), fetcher: () => assert.fail('wake audio must stay local'), runner: async (_exe, args) => {
    assert.match(args[args.indexOf('-m') + 1], /thonburian-medium/); assert.match(args[args.indexOf('--prompt') + 1], /ลุงเดฟ/);
    await fs.writeFile(args[args.indexOf('-of') + 1] + '.txt', 'ลุงเดฟ');
  } });
  try { assert.equal((await service.transcribe(wav16([new Float32Array(16000)], 16000), { provider: 'gemini', localModel: 'thai-medium', wakeWords: ['ลุงเดฟ'] }, '', true)).text, 'ลุงเดฟ'); }
  finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('longer pause keeps Thai speech in one utterance', async () => {
  const { Utterance } = await audio; const vad = new Utterance(16000, 0.01, 1.3);
  const voice = new Float32Array(1600).fill(0.2), quiet = new Float32Array(1600);
  for (let i = 0; i < 5; i++) vad.push(voice);
  for (let i = 0; i < 10; i++) assert.equal(vad.push(quiet), null);
  for (let i = 0; i < 5; i++) assert.equal(vad.push(voice), null);
  let result; for (let i = 0; i < 14; i++) result = vad.push(quiet) || result;
  assert.ok(validWav(result));
});
test('test mode shows results and diagnostics but never executes a push command', async () => {
  const { Listening } = await import('../src/renderer/js/listening.js'); const v = Object.create(Listening.prototype);
  Object.assign(v, { serial: 1, stream: {}, settings: { mode: 'push' }, testing: true, heard: {}, diagnostics: {}, status: {}, indicator: {}, host: { listeningTranscribe: async () => ({ text: 'ปิด Notepad', model: 'thai-medium', provider: 'local', elapsedMs: 1500 }) }, releaseMic() { this.stream = null; }, submit() { assert.fail('test must not execute'); } });
  await v.process([]); assert.equal(v.heard.value, 'ปิด Notepad'); assert.match(v.diagnostics.textContent, /1.5/); assert.equal(v.stream, null);
});

test('wake plus command uses selected cloud transcriber only after local wake match', async () => {
  const { Listening } = await import('../src/renderer/js/listening.js'); const v = Object.create(Listening.prototype); const calls = []; let sent;
  Object.assign(v, { serial: 1, stream: {}, settings: { provider:'gemini', mode:'wake', wakeWords:['ลุงเดฟ'], review:false }, followUntil:0, transcript:{}, heard:{}, diagnostics:{}, sendButton:{}, status:{}, indicator:{}, host:{listeningTranscribe:async (_bytes,waking)=>{calls.push(waking);return {text:waking?'ลุงเดฟ เปิดเครื่องคิดเล็ก':'ลุงเดฟ เปิดเครื่องคิดเลข',provider:'gemini',model:'fixture',elapsedMs:100}}}, submit:async()=>{sent=v.transcript.value}, idle:()=>{} });
  await v.process([]); assert.deepEqual(calls,[true,false]);assert.equal(sent,'เปิดเครื่องคิดเลข');
  calls.length=0;v.followUntil=0;v.pending=false;v.host.listeningTranscribe=async(_bytes,waking)=>{calls.push(waking);return {text:'เสียงที่ไม่เรียก'}};
  await v.process([]);assert.deepEqual(calls,[true]);
});

test('on macOS the model install downloads only the model (whisper-cli comes from Homebrew)', { skip: process.platform !== 'darwin' }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'uncle-install-mac-'));
  const urls = [];
  const service = createListening({ directory, executable: path.join(directory, 'whisper-cli'), fetcher: async (url) => { urls.push(url); return { ok: true, body: [Buffer.from('not the pinned file')] }; } });
  await fs.writeFile(path.join(directory, 'whisper-cli'), 'fixture');
  try {
    await assert.rejects(service.install(() => {}, 'small'), /SHA256/);
    assert.deepEqual(urls, ['https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin']);
    assert.deepEqual(await fs.readdir(directory), ['whisper-cli']);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('always-listening mode sends any real command without a wake word, and ignores noise', async () => {
  const { Listening } = await import('../src/renderer/js/listening.js');
  const v = Object.create(Listening.prototype);
  let heard = 'ขอบคุณที่รับชม', sent = [], wakeOnly;
  Object.assign(v, { serial: 1, stream: {}, settings: { mode: 'always', wakeWords: ['ลุงเดฟ'], review: false }, followUntil: 0, transcript: {}, sendButton: {}, status: {}, indicator: {}, host: { listeningTranscribe: async (_bytes, waking) => { wakeOnly = waking; return { text: heard }; } }, show: async () => {}, idle: () => {}, submit: async () => { sent.push(v.transcript.value); v.pending = false; } });
  await v.process([]); assert.deepEqual(sent, []); assert.equal(wakeOnly, false);
  heard = 'อืม'; await v.process([]); assert.deepEqual(sent, []);
  heard = 'เปิดเพลงแจ๊สหน่อย'; await v.process([]); assert.deepEqual(sent, ['เปิดเพลงแจ๊สหน่อย']);
});

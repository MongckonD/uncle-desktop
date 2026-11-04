'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
const { spawn, execFile } = require('node:child_process');
const run = require('node:util').promisify(execFile);
const { Worker } = require('node:worker_threads');

const CLOUD_VOICES = ['coral', 'alloy', 'nova', 'onyx'];
const EDGE_VOICES = [{ id: 'th-TH-PremwadeeNeural', name: 'เปรมวดี — หญิง', lang: 'th-TH' }, { id: 'th-TH-NiwatNeural', name: 'นิวัฒน์ — ชาย', lang: 'th-TH' },
  // English, for "always answer in English"
  { id: 'en-US-AnaNeural', name: 'Ana — เด็กหญิง (อังกฤษ US)', lang: 'en-US' }, { id: 'en-GB-MaisieNeural', name: 'Maisie — เด็กหญิง (อังกฤษ UK)', lang: 'en-GB' },
  { id: 'en-US-AvaNeural', name: 'Ava — หญิง (อังกฤษ US)', lang: 'en-US' }, { id: 'en-US-AndrewNeural', name: 'Andrew — ชาย (อังกฤษ US)', lang: 'en-US' }];
// Kokoro: a free voice model that runs on this computer (English, Japanese, Chinese, Spanish, French,
// Hindi, Italian, Portuguese; Thai through thai-g2p.js, with an accent). Downloaded once (~90 MB) on first use.
const { thaiRuns, THAI } = require('./thai-g2p');
const KOKORO_VOICES = [['af_heart', 'Heart — หญิง US'], ['af_bella', 'Bella — หญิง US'], ['af_nicole', 'Nicole — หญิง US'], ['am_michael', 'Michael — ชาย US'], ['am_fenrir', 'Fenrir — ชาย US'], ['bf_emma', 'Emma — หญิง UK'], ['bm_george', 'George — ชาย UK'], ['jf_alpha', 'Alpha — หญิง ญี่ปุ่น'], ['zf_xiaoxiao', 'Xiaoxiao — หญิง จีน'], ['zf_xiaobei', 'Xiaobei — หญิง จีน']].map(([id, name]) => ({ id, name, lang: id[0] === 'j' ? 'ja' : id[0] === 'z' ? 'zh' : 'en' }));
const PROVIDERS = ['windows', 'edge', 'openai', 'elevenlabs', 'fish', 'kokoro', 'custom'];
// on this computer: nothing leaves it, no consent to ask for
const local = (s) => s.provider === 'windows' || s.provider === 'kokoro' || (s.provider === 'custom' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//i.test(s.customUrl));
const DEFAULT_SPEECH = { provider: 'windows', voice: '', volume: 0.7, rate: 1, auto: false, cloudConsent: false, customUrl: '', customModel: '', pitch: 0, robot: 0, glitch: 0, layers: false };
function speechSettings(value = {}) {
  if (!value || typeof value !== 'object' || !PROVIDERS.includes(value.provider ?? 'windows') || typeof (value.voice ?? '') !== 'string' || (value.voice || '').length > 300) throw new Error('การตั้งค่าเสียงไม่ถูกต้อง');
  const settings = { ...DEFAULT_SPEECH, ...Object.fromEntries(Object.keys(DEFAULT_SPEECH).filter((key) => key in value).map((key) => [key, value[key]])) };
  if (!Number.isFinite(settings.volume) || settings.volume < 0 || settings.volume > 1 || !Number.isFinite(settings.rate) || settings.rate < 0.5 || settings.rate > 2 || typeof settings.auto !== 'boolean' || typeof settings.cloudConsent !== 'boolean') throw new Error('การตั้งค่าเสียงไม่ถูกต้อง');
  if (typeof settings.customUrl !== 'string' || settings.customUrl.length > 500 || (settings.customUrl && !/^https?:\/\/[^\s]+$/i.test(settings.customUrl)) || typeof settings.customModel !== 'string' || settings.customModel.length > 100) throw new Error('ที่อยู่หรือชื่อโมเดลเสียงไม่ถูกต้อง');
  if (!Number.isFinite(settings.pitch) || Math.abs(settings.pitch) > 12 || ![settings.robot, settings.glitch].every((v) => Number.isFinite(v) && v >= 0 && v <= 1) || typeof settings.layers !== 'boolean') throw new Error('ค่าปรับเสียงไม่ถูกต้อง');
  return settings;
}
// Kokoro in a worker of its own, kept warm between lines (the model takes a few seconds to load)
let kokoroWorker = null;
function kokoroSynthesize(text, voice, rate, signal, cacheDir) {
  if (!kokoroWorker) {
    kokoroWorker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      let tts = null;
      // Thai comes as phonemes (thai-g2p.js): read out piece by piece, Kokoro takes ~500 at a time
      const say = async (run, voice, speed) => {
        if (!('thai' in run)) return (await english(run.text, voice, speed)).audio;
        const parts = [], pieces = run.thai.match(/.{1,380}(?:,\s|$)|.{1,380}/g) || [];
        for (const ph of pieces) parts.push((await tts.generate_from_ids(tts.tokenizer(ph, { truncation: true }).input_ids, { voice, speed: speed * 0.9 })).audio);
        return joined(parts);
      };
      // kokoro-js only lets its English voices read text; the Japanese and Chinese ones get the
      // same English phonemes straight (otherwise: "Voice jf_alpha not found")
      const english = async (text, voice, speed) => {
        if (tts.voices[voice]) return tts.generate(text, { voice, speed });
        const ph = (await require(workerData.phonemizer).phonemize(text, 'en-us')).join(' ');
        return tts.generate_from_ids(tts.tokenizer(ph, { truncation: true }).input_ids, { voice, speed });
      };
      const joined = (parts) => { const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0)); let at = 0; for (const p of parts) { all.set(p, at); at += p.length; } return all; };
      parentPort.on('message', async ({ id, text, runs, voice, speed }) => {
        try {
          if (!tts) {
            const { env } = require(workerData.transformers); env.cacheDir = workerData.cacheDir;
            const { KokoroTTS } = require(workerData.kokoro);
            tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
          }
          let audio;
          if (!runs) audio = await english(text, voice, speed);
          else {
            const parts = [];
            for (const run of runs) parts.push(await say(run, voice, speed));
            const { RawAudio } = require(workerData.transformers);
            audio = new RawAudio(joined(parts), 24000);
          }
          parentPort.postMessage({ id, audio: Buffer.from(audio.toWav()).toString('base64') });
        } catch (error) { parentPort.postMessage({ id, error: String(error.message || error) }); }
      });
    `, { eval: true, workerData: { cacheDir, kokoro: require.resolve('kokoro-js'), phonemizer: require.resolve('phonemizer'), transformers: require.resolve('@huggingface/transformers') } });
    kokoroWorker.on('error', () => { kokoroWorker = null; });
    kokoroWorker.on('exit', () => { kokoroWorker = null; warmed = false; });
    kokoroWorker.unref();
  }
  const worker = kokoroWorker, id = Math.random().toString(36).slice(2);
  return new Promise((resolve, reject) => {
    // the worker dying (an error, out of memory) ends this line too, instead of 3 minutes of silence
    const dead = () => { worker.off('message', done); signal.removeEventListener('abort', abort); reject(new Error('Kokoro หยุดทำงาน ลองอีกครั้ง')); };
    worker.once('exit', dead);
    const done = (msg) => { if (msg.id !== id) return; worker.off('message', done); worker.off('exit', dead); signal.removeEventListener('abort', abort); msg.error ? reject(new Error(`Kokoro สร้างเสียงไม่สำเร็จ: ${msg.error.slice(0, 120)}`)) : resolve({ audio: msg.audio }); };
    const abort = () => { worker.off('message', done); worker.off('exit', dead); reject(new Error('หยุดเสียงแล้ว')); };
    worker.on('message', done); signal.addEventListener('abort', abort, { once: true });
    // Chinese voices also get each Thai syllable's tone
    worker.postMessage({ id, text, runs: THAI.test(text) ? thaiRuns(text, { tones: voice[0] === 'z' }) : null, voice, speed: rate });
  });
}
// a voice service's answer, as audio bytes for the renderer
async function audioFrom(response, name) {
  if (!response.ok) throw new Error([401, 403].includes(response.status) ? `${name}: API key ไม่ถูกต้องหรือไม่มีสิทธิ์` : response.status === 429 ? `${name}: โควตาหรือเครดิตไม่พอ` : `${name} สร้างเสียงไม่สำเร็จ (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw new Error(`${name} ไม่ได้ส่งเสียงกลับมา`);
  return { audio: bytes.toString('base64') };
}
function edgeSynthesize(text, voice, rate, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('หยุดเสียงแล้ว'));
    // A worker can be terminated on Stop, closing its WebSocket and pending audio request.
    const worker = new Worker(`
      const { parentPort, workerData } = require('node:worker_threads');
      const { EdgeTTS } = require(workerData.module);
      const keepAlive = setInterval(() => {}, 1000);
      (async () => {
        const percent = Math.round((workerData.rate - 1) * 100);
        const tts = new EdgeTTS({ voice: workerData.voice, lang: workerData.voice.slice(0, 5), rate: (percent >= 0 ? '+' : '') + percent + '%', timeout: 15000 });
        const chunks = []; let size = 0;
        for await (const chunk of tts.streamAudio(workerData.text)) {
          if (!Buffer.isBuffer(chunk)) continue;
          size += chunk.length; if (size > 16 * 1024 * 1024) throw Error('Audio too large'); chunks.push(chunk);
        }
        const bytes = Buffer.concat(chunks);
        if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw Error('Invalid audio');
        parentPort.postMessage({ audio: bytes.toString('base64'), format: 'mp3' });
      })().catch(() => parentPort.postMessage({ error: true })).finally(() => clearInterval(keepAlive));
    `, { eval: true, workerData: { module: require.resolve('node-edge-tts'), text, voice, rate } });
    let settled = false;
    const abort = () => finish(new Error('หยุดเสียงแล้ว'));
    const finish = (error, value) => { if (settled) return; settled = true; signal.removeEventListener('abort', abort); worker.terminate().catch(() => {}); error ? reject(error) : resolve(value); };
    signal.addEventListener('abort', abort, { once: true });
    worker.on('message', value => value.error ? finish(new Error('บริการเสียงไทย Edge ไม่พร้อม กรุณาตรวจอินเทอร์เน็ตหรือลองเลือก OpenAI')) : finish(null, value));
    worker.on('error', () => finish(new Error('เริ่มบริการเสียงไทย Edge ไม่สำเร็จ')));
    worker.on('exit', () => { if (!settled) finish(new Error('บริการเสียงไทย Edge หยุดทำงาน')); });
  });
}
// `say -v ?` lines, "Kanya   th_TH    # สวัสดี", as the voices speech.ps1 lists on Windows
function parseSayVoices(out) {
  return out.split('\n').map((l) => l.match(/^(.+?)\s+([a-z]{2,3}_[A-Za-z0-9]+)\s+#/)).filter(Boolean)
    .map(([, name, lang]) => ({ id: name.trim(), name: name.trim(), lang: lang.replace('_', '-') }));
}
// macOS's own voices through `say`, in the shape speech.ps1 answers with
async function mac(action, payload, signal) {
  if (action === 'voices') return parseSayVoices((await run('say', ['-v', '?'], { signal, timeout: 15000 })).stdout);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'uncle-say-')), file = path.join(dir, 'speech.wav');
  try {
    await run('say', ['-v', payload.voice, '-r', String(Math.round(175 * payload.rate)), '--file-format=WAVE', '--data-format=LEI16@22050', '-o', file, '--', payload.text], { signal, timeout: 60000 })
      .catch(() => { throw new Error(signal?.aborted ? 'หยุดเสียงแล้ว' : 'macOS สร้างเสียงไม่สำเร็จ กรุณาตรวจเสียงที่ติดตั้ง'); });
    return { audio: (await fs.readFile(file)).toString('base64') };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
let warmed = false; // the Kokoro worker is up (or on its way)
function createSpeech({ script = path.join(__dirname, 'speech.ps1'), fetcher = fetch, edge = edgeSynthesize, kokoro = kokoroSynthesize, kokoroDir = () => path.join(os.tmpdir(), 'uncle-kokoro') } = {}) {
  let running = null;
  let cachedVoices = null;
  function stop() { running?.abort(); running = null; }
  function windows(action, payload, signal) {
    if (process.platform === 'darwin') return mac(action, payload, signal);
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Action', action], { windowsHide: true, signal });
      let out = '', settled = false;
      const timer = setTimeout(() => { child.kill(); finish(new Error('ระบบเสียงใช้เวลานานเกินไป')); }, 60000);
      const finish = (err, result) => { if (settled) return; settled = true; clearTimeout(timer); err ? reject(err) : resolve(result); };
      child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => { out += chunk; if (out.length > 16 * 1024 * 1024) { child.kill(); finish(new Error('เสียงตอบยาวเกินไป')); } });
      child.stderr.resume();
      child.on('error', (err) => finish(err));
      child.on('close', (code) => {
        if (code !== 0) return finish(new Error(signal?.aborted ? 'หยุดเสียงแล้ว' : 'Windows สร้างเสียงไม่สำเร็จ กรุณาตรวจเสียงที่ติดตั้ง'));
        try { finish(null, JSON.parse(out.replace(/^\uFEFF/, '').trim() || '[]')); } catch { finish(new Error('อ่านข้อมูลเสียง Windows ไม่สำเร็จ')); }
      });
      child.stdin.on('error', () => {});
      child.stdin.end(payload ? JSON.stringify(payload) : '');
    });
  }
  async function voices(refresh = false) {
    if (!['win32', 'darwin'].includes(process.platform)) return [];
    if (!cachedVoices || refresh) {
      const list = await windows('voices');
      cachedVoices = Array.isArray(list) ? list : [list];
    }
    return cachedVoices;
  }
  // key: the chosen service's own (OpenAI, ElevenLabs, Fish, or your server's)
  async function speak(text, options, key) {
    if (typeof text !== 'string' || !text.trim() || text.length > 2000) throw new Error('ข้อความเสียงต้องมี 1–2000 ตัวอักษร');
    const settings = speechSettings(options);
    stop();
    const controller = new AbortController(); running = controller;
    const timeout = setTimeout(() => controller.abort(), settings.provider === 'edge' ? 20000 : settings.provider === 'kokoro' ? 180000 : 90000);
    try {
      if (settings.provider === 'windows') {
        const list = await voices();
        if (controller.signal.aborted) throw new Error('หยุดเสียงแล้ว');
        const selected = list.find((v) => v.id === settings.voice) || (!settings.voice ? list.find((v) => /^th/i.test(v.lang)) : null);
        if (!selected) throw new Error('ไม่พบเสียงที่เลือก กรุณาติดตั้งเสียงภาษาไทยในเครื่อง (Windows หรือ macOS) แล้วกดรีเฟรช');
        if (/[\u0e00-\u0e7f]/.test(text) && !/^th/i.test(selected.lang)) throw new Error('เสียงที่เลือกไม่รองรับภาษาไทย กรุณาติดตั้งเสียงไทยหรือเลือกเสียง AI ออนไลน์');
        return await windows('speak', { text, voice: selected.id, rate: settings.rate }, controller.signal);
      }
      if (!local(settings) && !settings.cloudConsent) throw new Error('กรุณายินยอมส่งข้อความไปบริการเสียงออนไลน์ในหน้าเสียงพูดก่อน');
      if (settings.provider === 'kokoro') return await kokoro(text, KOKORO_VOICES.some((v) => v.id === settings.voice) ? settings.voice : 'af_heart', settings.rate, controller.signal, kokoroDir());
      if (settings.provider === 'elevenlabs') {
        if (!key) throw new Error('กรุณาใส่ ElevenLabs API key ในหน้าเสียงพูด');
        const voice = /^[A-Za-z0-9]{10,40}$/.test(settings.voice) ? settings.voice : 'JBFqnCBsd6RMkjVDRZzb';
        return await audioFrom(await fetcher(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, { method: 'POST', signal: controller.signal, headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: 'eleven_v3', voice_settings: { speed: Math.min(1.2, Math.max(0.7, settings.rate)) } }) }), 'ElevenLabs');
      }
      if (settings.provider === 'fish') {
        if (!key) throw new Error('กรุณาใส่ Fish Audio API key ในหน้าเสียงพูด');
        return await audioFrom(await fetcher('https://api.fish.audio/v1/tts', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: 's1' }, body: JSON.stringify({ text, format: 'mp3', ...(settings.voice && { reference_id: settings.voice }), prosody: { speed: settings.rate } }) }), 'Fish Audio');
      }
      if (settings.provider === 'custom') { // any OpenAI-compatible speech server: Kokoro-FastAPI, your own model, a cloud one
        if (!settings.customUrl) throw new Error('กรุณาใส่ที่อยู่เซิร์ฟเวอร์เสียงของคุณ');
        const url = settings.customUrl.replace(/\/+$/, '').replace(/\/v1$/, '') + '/v1/audio/speech';
        return await audioFrom(await fetcher(url, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', ...(key && { Authorization: `Bearer ${key}` }) }, body: JSON.stringify({ model: settings.customModel || 'tts-1', voice: settings.voice || 'alloy', input: text, response_format: 'mp3', speed: settings.rate }) }), 'เซิร์ฟเวอร์เสียง');
      }
      if (settings.provider === 'edge') {
        if (!settings.cloudConsent) throw new Error('กรุณายินยอมส่งข้อความไป Microsoft Edge TTS ในหน้าเสียงพูดก่อน');
        if (!EDGE_VOICES.some(v => v.id === settings.voice)) throw new Error('กรุณาเลือกเสียง Edge');
        return await edge(text, settings.voice, settings.rate, controller.signal);
      }
      if (!settings.cloudConsent) throw new Error('กรุณายินยอมส่งข้อความไป OpenAI ก่อนใช้เสียงออนไลน์');
      if (!key) throw new Error('กรุณาใส่ OpenAI API key ในหน้าตั้งค่าเสียง');
      if (!CLOUD_VOICES.includes(settings.voice)) throw new Error('กรุณาเลือกเสียงออนไลน์');
      const response = await fetcher('https://api.openai.com/v1/audio/speech', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: settings.voice, input: text, response_format: 'wav', speed: settings.rate }),
      });
      if (!response.ok) throw new Error(response.status === 401 ? 'OpenAI API key ไม่ถูกต้อง' : response.status === 429 ? 'โควตาหรือเครดิต OpenAI ไม่เพียงพอ กรุณาตรวจบัญชี' : `บริการเสียงออนไลน์ขัดข้อง (${response.status})`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 16 * 1024 * 1024 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') throw new Error('บริการไม่ได้ส่งเสียง WAV ที่รองรับกลับมา');
      return { audio: bytes.toString('base64') };
    } finally { clearTimeout(timeout); if (running === controller) running = null; }
  }
  // Kokoro loaded ahead (its model takes seconds to start): one tiny line, so the first real one is quick
  function warm(options) {
    const settings = speechSettings(options);
    if (settings.provider !== 'kokoro' || warmed) return;
    warmed = true;
    kokoro('hi', KOKORO_VOICES.some((v) => v.id === settings.voice) ? settings.voice : 'af_heart', 1, AbortSignal.timeout(180000), kokoroDir()).catch(() => { warmed = false; });
  }
  return { voices, speak, stop, warm };
}
module.exports = { createSpeech, parseSayVoices, KOKORO_VOICES, PROVIDERS, speechSettings, DEFAULT_SPEECH, CLOUD_VOICES, EDGE_VOICES };

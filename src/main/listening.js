'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const DEFAULT_LISTENING = { provider: 'local', localModel: 'small', silenceSeconds: 1.3, vocabulary: 'Rocky, ร็อคกี้, Notepad, Spotify, Chrome, YouTube', mode: 'push', deviceId: '', wakeWords: ['เฮ้ ร็อคกี้'], followSeconds: 10, review: false, cloudConsent: false, threshold: 0.015 };
function listeningSettings(value = {}) {
  if (!value || typeof value !== 'object') throw new Error('การตั้งค่าไมค์ไม่ถูกต้อง');
  const s = { ...DEFAULT_LISTENING, ...Object.fromEntries(Object.keys(DEFAULT_LISTENING).filter(k => k in value).map(k => [k, value[k]])) };
  if (!['local', 'openai', 'gemini'].includes(s.provider) || !['push', 'wake', 'always'].includes(s.mode) || typeof s.deviceId !== 'string' || s.deviceId.length > 500 || !Array.isArray(s.wakeWords) || !s.wakeWords.length || s.wakeWords.length > 5 || s.wakeWords.some(w => typeof w !== 'string' || w.trim().length < 2 || w.length > 60) || typeof s.review !== 'boolean' || typeof s.cloudConsent !== 'boolean' || !Number.isFinite(s.followSeconds) || s.followSeconds < 0 || s.followSeconds > 30 || !Number.isFinite(s.threshold) || s.threshold < 0.005 || s.threshold > 0.1) throw new Error('การตั้งค่าไมค์ไม่ถูกต้อง');
  if (!['small', 'thai-medium'].includes(s.localModel) || !Number.isFinite(s.silenceSeconds) || s.silenceSeconds < 0.6 || s.silenceSeconds > 2.5 || typeof s.vocabulary !== 'string' || s.vocabulary.length > 600) throw new Error('โมเดลหรือการตั้งค่าภาษาไทยไม่ถูกต้อง');
  s.wakeWords = [...new Set(s.wakeWords.map(w => w.trim()))];
  return s;
}
function validWav(input) {
  const b = Buffer.from(input || []);
  if (b.length < 3244 || b.length > 16000 * 2 * 30 + 44 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 16) !== 'WAVEfmt ' || b.readUInt32LE(16) !== 16 || b.readUInt16LE(20) !== 1 || b.readUInt16LE(22) !== 1 || b.readUInt32LE(24) !== 16000 || b.readUInt16LE(34) !== 16 || b.toString('ascii', 36, 40) !== 'data' || b.readUInt32LE(40) !== b.length - 44) throw new Error('รองรับเสียง WAV mono 16 kHz ไม่เกิน 30 วินาที');
  return b;
}
// Fixed upstream artifacts; verify both before running any downloaded executable.
const ARTIFACTS = [
  ['runtime.zip', 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip', '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a', 100 * 1024 * 1024],
  ['ggml-small-q5_1.bin', 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin', 'ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb', 200 * 1024 * 1024],
];
const THAI_MODEL = ['thonburian-medium-q5_0.bin', 'https://huggingface.co/suebphatt/thonburian-whisper-ggml/resolve/d271c27020490ac297fceba344c8e97b0200255f/thonburian-medium-q5_0.bin', '25fe6beb59477b2f161371fb206e898843058f22ac13036159f83eba0a92336d', 550 * 1024 * 1024];
// macOS: whisper.cpp from Homebrew (`brew install whisper-cpp`), which runs on the GPU (Metal) there
const MAC = process.platform === 'darwin';
const BREW = ['/opt/homebrew/bin', '/usr/local/bin'];
const onBrew = name => BREW.map(dir => path.join(dir, name)).find(f => require('node:fs').existsSync(f));
function createListening({ directory, fetcher = fetch, runner = run, executable: fixed }) {
  let active = null, installing = null;
  const modelPath = name => path.join(directory, name === 'thai-medium' ? THAI_MODEL[0] : ARTIFACTS[1][0]);
  const exe = () => fixed || (MAC ? onBrew('whisper-cli') || path.join(BREW[0], 'whisper-cli') : path.join(directory, 'runtime', 'Release', 'whisper-cli.exe'));
  const stop = () => { active?.abort(); active = null; };
  async function info(name = 'small') {
    const runtime = Boolean(await fs.stat(exe()).catch(() => null));
    const models = Object.fromEntries(await Promise.all(['small', 'thai-medium'].map(async id => [id, runtime && Boolean(await fs.stat(modelPath(id)).catch(() => null))])));
    return { ready: Boolean(models[name]), models, installing: Boolean(installing) };
  }
  async function install(progress = () => {}, name = 'small') {
    if (!['small', 'thai-medium'].includes(name)) throw new Error('โมเดลไม่ถูกต้อง');
    if (installing) return installing;
    installing = (async () => {
      if (!MAC && (process.platform !== 'win32' || process.arch !== 'x64')) throw new Error('ตัวติดตั้งโมเดลรองรับ Windows x64 และ macOS');
      await fs.mkdir(directory, { recursive: true });
      if (MAC && !(await fs.stat(exe()).catch(() => null))) {
        const brew = onBrew('brew');
        if (!brew) throw new Error('บน Mac ต้องมี Homebrew ก่อน ติดตั้งจาก brew.sh แล้วกดดาวน์โหลดอีกครั้ง');
        progress('กำลังติดตั้ง whisper-cpp ผ่าน Homebrew…');
        await runner(brew, ['install', 'whisper-cpp'], { timeout: 15 * 60000 }).catch(() => { throw new Error('ติดตั้ง whisper-cpp ไม่สำเร็จ ลองพิมพ์ brew install whisper-cpp ใน Terminal'); });
      }
      const model = name === 'thai-medium' ? THAI_MODEL : ARTIFACTS[1];
      for (const [artifact, url, hash, max] of MAC ? [model] : [ARTIFACTS[0], model]) {
        const target = path.join(directory, artifact), partial = `${target}.part`;
        if (await fs.readFile(target).then(b => createHash('sha256').update(b).digest('hex') === hash).catch(() => false)) continue;
        progress(`ดาวน์โหลด ${artifact}…`);
        const response = await fetcher(url, { signal: AbortSignal.timeout(600000) });
        if (!response.ok) throw new Error(`ดาวน์โหลดไม่สำเร็จ (${response.status})`);
        const file = await fs.open(partial, 'w'); let size = 0; const digest = createHash('sha256');
        try {
          for await (const chunk of response.body) { size += chunk.length; if (size > max) throw new Error('ไฟล์ดาวน์โหลดใหญ่เกินกำหนด'); digest.update(chunk); await file.write(chunk); }
          if (digest.digest('hex') !== hash) throw new Error('ไฟล์โมเดลไม่ผ่าน SHA256 กรุณาลองใหม่');
        } catch (error) { await file.close(); await fs.rm(partial, { force: true }); throw error; }
        await file.close(); await fs.rename(partial, target);
      }
      if (MAC) { if (!(await info(name)).ready) throw new Error('ไม่พบ whisper-cli หลังติดตั้ง'); return { ready: true }; }
      progress('กำลังติดตั้งตัวรับเสียง…');
      await fs.mkdir(path.join(directory, 'runtime'), { recursive: true });
      // Archive is hash pinned. Pass paths as arguments, never concatenate user-controlled shell code.
      // Windows' own tar: a GNU tar earlier on PATH (Git) reads 'C:' as a remote host.
      await runner(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'),['-xf', path.join(directory, 'runtime.zip'), '-C', path.join(directory, 'runtime')], { windowsHide: true, timeout: 60000 });
      if (!(await info(name)).ready) throw new Error('ไม่พบ whisper-cli.exe หลังติดตั้ง');
      return { ready: true };
    })().finally(() => { installing = null; });
    return installing;
  }
  async function transcribe(input, options, key, wakeOnly = false) {
    const bytes = validWav(input), s = listeningSettings(options), started = Date.now();
    const vocabulary = [...new Set([...s.wakeWords, ...s.vocabulary.split(/[,\n]/)].map(w => w.trim()).filter(Boolean))];
    const resultText = text => ({ text: text.trim().slice(0, 4000), provider: wakeOnly ? 'local' : s.provider, model: wakeOnly || s.provider === 'local' ? s.localModel : s.provider === 'gemini' ? 'gemini-3.5-transcribe' : 'gpt-4o-mini-transcribe', elapsedMs: Date.now() - started });
    stop(); const controller = new AbortController(); active = controller;
    const timer = setTimeout(() => controller.abort(), 120000);
    let temp;
    try {
      if (wakeOnly || s.provider === 'local') {
        if (!(await info(s.localModel)).ready) throw new Error('กรุณาดาวน์โหลดโมเดลรับเสียงในเครื่องก่อน');
        if (controller.signal.aborted) throw new Error('ยกเลิกการฟังแล้ว');
        temp = await fs.mkdtemp(path.join(os.tmpdir(), 'uncle-voice-'));
        const wav = path.join(temp, 'input.wav'), out = path.join(temp, 'transcript');
        await fs.writeFile(wav, bytes);
        await runner(exe(), ['-m', modelPath(s.localModel), '-f', wav, '-l', 'th', '-otxt', '-of', out, '-nt', ...(MAC ? [] : ['-ng']), '-t', '4', '--prompt', vocabulary.join(', ')], { windowsHide: true, signal: controller.signal, timeout: 120000, maxBuffer: 1024 * 1024 });
        const text = (await fs.readFile(`${out}.txt`, 'utf8')).trim().slice(0, 4000);
        return resultText(text);
      }
      if (s.provider === 'gemini') {
        if (!s.cloudConsent) throw new Error('กรุณายินยอมส่งเสียงคำสั่งไป Gemini ก่อน');
        if (!key) throw new Error('กรุณาบันทึก Gemini API key ในหน้าสั่งงานด้วยเสียงก่อน');
        const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST', signal: controller.signal, headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gemini-3.5-transcribe', store: false, input: [{ type: 'audio', mime_type: 'audio/wav', data: bytes.toString('base64') }], generation_config: { transcription_config: { language_codes: ['th-TH', 'en-US'], custom_vocabulary: vocabulary, mode: { type: 'verbatim' } } } }),
        });
        if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'Gemini API key หรือสิทธิ์ใช้งานไม่ถูกต้อง' : response.status === 429 ? 'โควตา Gemini ไม่เพียงพอ' : `Gemini ถอดเสียงไม่สำเร็จ (${response.status})`);
        const result = await response.json();
        if (result.status !== 'completed') throw new Error('Gemini ยังถอดเสียงไม่สำเร็จ กรุณาลองใหม่');
        const blocks = result.steps?.filter(step => step.type === 'model_output').flatMap(step => step.content || []) || result.outputs || [];
        const text = blocks.filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('');
        return resultText(text);
      }
      if (!s.cloudConsent) throw new Error('กรุณายินยอมส่งเสียงคำสั่งไป OpenAI ก่อน');
      if (!key) throw new Error('กรุณาบันทึก OpenAI API key ในหน้าเสียงพูดก่อน');
      const form = new FormData(); form.set('file', new Blob([bytes], { type: 'audio/wav' }), 'speech.wav');
      form.set('model', 'gpt-4o-mini-transcribe'); form.set('language', 'th'); form.set('prompt', vocabulary.join(', '));
      const response = await fetcher('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${key}` }, body: form });
      if (!response.ok) throw new Error(response.status === 401 ? 'OpenAI API key ไม่ถูกต้อง' : response.status === 429 ? 'โควตา OpenAI ไม่เพียงพอ' : `บริการถอดเสียงขัดข้อง (${response.status})`);
      const result = await response.json();
      if (typeof result.text !== 'string') throw new Error('บริการไม่ได้ส่งข้อความกลับมา');
      return resultText(result.text);
    } catch (error) { if (controller.signal.aborted) throw new Error('ยกเลิกหรือหมดเวลาถอดเสียง'); throw new Error(error.message?.startsWith('Command failed') ? 'โมเดลรับเสียงทำงานไม่สำเร็จ กรุณาลองใหม่' : error.message); }
    finally { clearTimeout(timer); if (active === controller) active = null; if (temp) await fs.rm(temp, { recursive: true, force: true }); }
  }
  return { info, install, stop, transcribe };
}
module.exports = { createListening, listeningSettings, DEFAULT_LISTENING, validWav };

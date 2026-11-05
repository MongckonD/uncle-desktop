export function speechText(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, '').replace(/[*#`_>|]/g, '')
    // emoji, said aloud as their names ("smiling face with heart eyes"): only shown in her bubble
    .replace(/\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[‍️⃣]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

// Her answer as it arrives, said piece by piece: the next piece of `text` worth saying after the
// first `spoken` characters: up to a sentence end (. ! ? or a new line; a full stop only counts with a
// space after it, so 3.5 stays whole), or at a space once it runs long. An unfinished code block waits.
// `final`: all that's left. Returns { chunk, end } or null.
const SENTENCE = /[.!?…]+["'”’)\]]*\s+|[。！？]+|\n+/g;
export function nextSpeakable(text, spoken, final = false) {
  const open = (n) => (text.slice(0, n).match(/```/g) || []).length % 2 === 1; // inside a code block at n
  const limit = !final && open(text.length) ? text.lastIndexOf('```') : text.length;
  const rest = text.slice(spoken, limit);
  SENTENCE.lastIndex = 0;
  for (let m; (m = SENTENCE.exec(rest));) {
    const end = m.index + m[0].length;
    if (!open(spoken + m.index) && rest.slice(0, end).trim().length >= 12) return { chunk: rest.slice(0, end), end: spoken + end };
  }
  if (final) return rest.trim() ? { chunk: rest, end: limit } : null;
  const space = rest.length > 140 ? rest.lastIndexOf(' ', 140) : -1;
  return space > 12 && !open(spoken + space) ? { chunk: rest.slice(0, space), end: spoken + space } : null;
}

// How loud her voice is, MOUTH_RATE times a second, 0 to 1: RMS per step, cut at the 35/70/97% quantiles of the
// voiced steps so a quiet voice moves as much as a loud one (after lachydotmcg's Voice.Mouths).
const MOUTH_RATE = 12;
export function mouthLevels(samples, rate, perSecond = MOUTH_RATE) {
  const step = Math.max(1, Math.floor(rate / perSecond));
  const levels = [];
  for (let i = 0; i + step <= samples.length; i += step) {
    let sum = 0;
    for (let j = i; j < i + step; j++) sum += samples[j] * samples[j];
    levels.push(Math.sqrt(sum / step));
  }
  const quiet = Math.max(0.004, Math.max(0, ...levels) * 0.08);
  const voiced = levels.filter((level) => level > quiet).sort((a, b) => a - b);
  const cut = (q) => voiced[Math.min(voiced.length - 1, Math.floor(q * voiced.length))] ?? 1;
  const [low, mid, high] = [cut(0.35), cut(0.7), cut(0.97)];
  return levels.map((level) => (level <= quiet ? 0 : level < low ? 0.35 : level < mid ? 0.6 : level < high ? 0.85 : 1));
}

const node = (tag, text = '') => { const el = document.createElement(tag); el.textContent = text; return el; };
export class Speech {
  constructor({ host, root, stopButton, onVisibility, lastReply }) {
    Object.assign(this, { host, root, stopButton, onVisibility, lastReply });
    this.settings = { provider: 'windows', voice: '', volume: 0.7, rate: 1, auto: false, cloudConsent: false, customUrl: '', customModel: '', pitch: 0, robot: 0, glitch: 0, layers: false };
    this.serial = 0;
    root.className = 'character-picker'; root.hidden = true;
    const box = node('div'); box.className = 'character-picker__box speech-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'speech-title');
    const title = node('h1', 'เสียงพูดภาษาไทย'); title.id = 'speech-title';
    const close = node('button', '✕'); close.type = 'button'; close.className = 'speech-close'; close.setAttribute('aria-label', 'ปิดหน้าตั้งค่าเสียง'); close.onclick = () => this.hide();
    const providerLabel = node('label', 'เลือกบริการเสียง');
    this.provider = node('select'); this.provider.id = 'speech-provider'; providerLabel.htmlFor = this.provider.id;
    for (const [id, label] of [['edge', 'เสียงไทย Edge — ออนไลน์ ไม่ต้องใส่คีย์'], ['windows', 'เสียงของเครื่อง (Windows / macOS) — อ่านในเครื่อง'], ['kokoro', 'Kokoro — เสียง AI ฟรีในเครื่อง (ไทยแบบทดลอง)'], ['openai', 'OpenAI — เสียง AI ออนไลน์'], ['elevenlabs', 'ElevenLabs — เสียง AI ออนไลน์ รองรับไทย'], ['fish', 'Fish Audio — เสียง AI ออนไลน์ / เสียงที่โคลนไว้'], ['custom', 'เซิร์ฟเวอร์หรือโมเดลเสียงของคุณ (OpenAI-compatible)']]) { const option = node('option', label); option.value = id; this.provider.append(option); }
    this.voice = node('select'); this.voice.id = 'speech-voice';
    const voiceLabel = node('label', 'เสียงที่ใช้'); voiceLabel.htmlFor = this.voice.id;
    this.note = node('p');
    this.local = node('div');
    const install = node('button', 'เปิดการตั้งค่าเสียง Windows'); install.onclick = () => host.speechWindowsSettings();
    const refresh = node('button', 'รีเฟรชรายชื่อเสียง'); refresh.onclick = () => this.load(true);
    this.local.append(install, refresh);
    this.cloud = node('div');
    this.key = node('input'); this.key.type = 'password'; this.key.id = 'speech-key'; this.key.autocomplete = 'off'; this.key.placeholder = 'เว้นว่างถ้ามีคีย์บันทึกไว้แล้ว'; this.key.maxLength = 512;
    const keyLabel = node('label', 'OpenAI API key (เก็บแบบเข้ารหัสในเครื่อง)'); keyLabel.htmlFor = this.key.id;
    this.keyLabel = keyLabel;
    this.consent = node('input'); this.consent.type = 'checkbox'; this.consent.id = 'speech-consent';
    this.consentCaption = document.createTextNode(' ยินยอมส่งข้อความที่อ่านไป OpenAI และรับทราบว่าอาจมีค่าบริการ API');
    const consentLabel = node('label'); consentLabel.htmlFor = this.consent.id; consentLabel.append(this.consent, this.consentCaption);
    this.cloudNote = node('p');
    // ElevenLabs, Fish and your own server: a voice ID you paste; your server: its address and model
    this.voiceId = node('input'); this.voiceId.id = 'speech-voice-id'; this.voiceId.maxLength = 300;
    this.voiceIdLabel = node('label', 'Voice ID'); this.voiceIdLabel.htmlFor = this.voiceId.id;
    this.customUrl = node('input'); this.customUrl.id = 'speech-custom-url'; this.customUrl.maxLength = 500; this.customUrl.placeholder = 'เช่น http://localhost:8880 (Kokoro-FastAPI) หรือ https://…';
    this.customModel = node('input'); this.customModel.id = 'speech-custom-model'; this.customModel.maxLength = 100; this.customModel.placeholder = 'ชื่อโมเดล เช่น kokoro หรือ tts-1';
    this.custom = node('div');
    const urlLabel = node('label', 'ที่อยู่เซิร์ฟเวอร์เสียง'); urlLabel.htmlFor = this.customUrl.id;
    const modelLabel = node('label', 'ชื่อโมเดล'); modelLabel.htmlFor = this.customModel.id;
    this.custom.append(urlLabel, this.customUrl, modelLabel, this.customModel);
    this.cloud.append(this.voiceIdLabel, this.voiceId, this.custom, keyLabel, this.key, consentLabel, this.cloudNote);
    // her voice, tuned: pitch, robot, glitch, and two more copies of it, one higher and one lower
    this.effects = node('details'); this.effects.append(node('summary', 'ปรับเสียง — pitch, robot, glitch, ซ้อนเสียง'));
    const slider = (id, label, min, max, step) => { const input = node('input'); input.type = 'range'; input.id = `speech-${id}`; Object.assign(input, { min, max, step }); const l = node('label', label); l.htmlFor = input.id; this.effects.append(l, input); return input; };
    this.pitch = slider('pitch', 'Pitch (สูง–ต่ำ)', -12, 12, 1);
    this.robot = slider('robot', 'Robot', 0, 1, 0.05);
    this.glitch = slider('glitch', 'Glitch', 0, 1, 0.05);
    this.layers = node('input'); this.layers.type = 'checkbox'; this.layers.id = 'speech-layers';
    const layersLabel = node('label'); layersLabel.htmlFor = this.layers.id; layersLabel.append(this.layers, document.createTextNode(' ซ้อนเสียง — เพิ่มเสียงตัวเองอีกสองชั้น สูงหนึ่ง ต่ำหนึ่ง'));
    this.effects.append(layersLabel);
    this.volume = node('input'); this.volume.id = 'speech-volume'; this.volume.type = 'range'; this.volume.min = 0; this.volume.max = 1; this.volume.step = 0.05;
    const volumeLabel = node('label', 'ระดับเสียงพูด'); volumeLabel.htmlFor = this.volume.id;
    this.volume.oninput = () => { if (this.gain) this.gain.gain.value = Number(this.volume.value); };
    this.rate = node('select'); this.rate.id = 'speech-rate';
    for (const [value, label] of [[0.75, 'ช้า'], [1, 'ปกติ'], [1.25, 'เร็ว'], [1.5, 'เร็วมาก']]) { const option = node('option', label); option.value = value; this.rate.append(option); }
    const rateLabel = node('label', 'ความเร็ว'); rateLabel.htmlFor = this.rate.id;
    this.auto = node('input'); this.auto.type = 'checkbox'; this.auto.id = 'speech-auto';
    const autoLabel = node('label'); autoLabel.htmlFor = this.auto.id; autoLabel.append(this.auto, document.createTextNode(' อ่านคำตอบแชตอัตโนมัติ (อ่านสูงสุด 2,000 ตัวอักษรต่อคำตอบ)'));
    this.sample = node('textarea'); this.sample.id = 'speech-sample'; this.sample.rows = 2; this.sample.maxLength = 2000; this.sample.value = 'สวัสดีค่ะ ฉันเป็นเพื่อน AI ของคุณ วันนี้มีอะไรให้ช่วยไหมคะ';
    const sampleLabel = node('label', 'ข้อความทดสอบ — แก้ไขได้'); sampleLabel.htmlFor = this.sample.id;
    this.status = node('p'); this.status.className = 'speech-status'; this.status.setAttribute('role', 'status');
    const actions = node('div'); actions.className = 'speech-actions';
    this.test = node('button', '▶ ทดสอบเสียง'); this.test.onclick = () => this.tryPlay(this.sample.value);
    const read = node('button', 'อ่านข้อความตอบล่าสุด'); read.onclick = () => this.tryPlay(this.lastReply());
    const stop = node('button', '■ หยุดเสียง'); stop.onclick = () => this.stop();
    const save = node('button', 'บันทึก'); save.className = 'character-picker__apply'; save.onclick = async () => { try { await this.save(); this.status.textContent = 'บันทึกการตั้งค่าแล้ว'; } catch (error) { this.error(error); } };
    actions.append(this.test, read, stop, save);
    this.voiceLabel = voiceLabel;
    box.append(title, close, providerLabel, this.provider, voiceLabel, this.voice, this.note, this.local, this.cloud, volumeLabel, this.volume, rateLabel, this.rate, this.effects, autoLabel, sampleLabel, this.sample, this.status, actions);
    root.replaceChildren(box);
    this.provider.onchange = () => { this.stop(); this.key.value = ''; this.consent.checked = false; this.renderVoices(); };
    for (const event of ['mousedown', 'mouseup', 'click']) root.addEventListener(event, (e) => e.stopPropagation());
    root.addEventListener('click', (e) => { if (e.target === root) this.hide(); });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
      if (e.key === 'Tab') {
        const fields = [...root.querySelectorAll('button,input,select,textarea')].filter((el) => !el.disabled && el.getClientRects().length);
        if (e.shiftKey && document.activeElement === fields[0]) { e.preventDefault(); fields.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === fields.at(-1)) { e.preventDefault(); fields[0].focus(); }
      }
    });
    stopButton.onclick = () => { const failed = this.lastError; this.stop(); if (failed) this.show(); };
    for (const event of ['mousedown', 'mouseup', 'click']) stopButton.addEventListener(event, (e) => e.stopPropagation());
  }
  get open() { return !this.root.hidden; }
  get active() { return !this.stopButton.hidden && !this.lastError; }
  configure(config) {
    const settings = config.speech || this.settings;
    if (JSON.stringify(settings) !== JSON.stringify(this.settings) || config.muted || this.characterId && this.characterId !== config.characterId) this.stop();
    this.settings = settings; this.muted = config.muted; this.characterId = config.characterId;
  }
  async load(refresh = false) {
    try {
      this.info = await this.host.speechInfo(refresh); this.settings = this.info.settings;
      this.provider.value = this.settings.provider; this.volume.value = this.settings.volume; this.rate.value = this.settings.rate;
      this.auto.checked = this.settings.auto; this.consent.checked = this.settings.cloudConsent; this.key.value = '';
      this.customUrl.value = this.settings.customUrl || ''; this.customModel.value = this.settings.customModel || ''; this.voiceId.value = ['elevenlabs', 'fish', 'custom'].includes(this.settings.provider) ? this.settings.voice : '';
      this.pitch.value = this.settings.pitch || 0; this.robot.value = this.settings.robot || 0; this.glitch.value = this.settings.glitch || 0; this.layers.checked = Boolean(this.settings.layers);
      this.renderVoices();
    } catch (error) { this.error(error); }
  }
  renderVoices() {
    if (!this.info) return;
    const p = this.provider.value, local = p === 'windows', edge = p === 'edge', kokoro = p === 'kokoro', typed = ['elevenlabs', 'fish', 'custom'].includes(p);
    const NAME = { openai: 'OpenAI', elevenlabs: 'ElevenLabs', fish: 'Fish Audio', custom: 'เซิร์ฟเวอร์เสียงของคุณ' }[p];
    this.local.hidden = !local; this.cloud.hidden = local || kokoro;
    this.voice.hidden = typed; this.voiceLabel.hidden = typed; this.voiceId.hidden = !typed; this.voiceIdLabel.hidden = !typed; this.custom.hidden = p !== 'custom';
    this.key.hidden = edge; this.keyLabel.hidden = edge;
    this.keyLabel.textContent = `${NAME || ''} API key (เก็บแบบเข้ารหัสในเครื่อง)${p === 'custom' ? ' — ถ้าเซิร์ฟเวอร์ต้องใช้' : ''}`;
    this.voiceIdLabel.textContent = p === 'elevenlabs' ? 'ElevenLabs Voice ID (ว่าง = George)' : p === 'fish' ? 'Fish Audio model ID ของเสียง (ว่าง = เสียงเริ่มต้น)' : 'ชื่อเสียงบนเซิร์ฟเวอร์ (เช่น af_heart, alloy)';
    this.consentCaption.textContent = edge ? ' ยินยอมส่งข้อความที่อ่านไป Microsoft Edge TTS เพื่อสร้างเสียงไทยออนไลน์' : ` ยินยอมส่งข้อความที่อ่านไป ${NAME} และรับทราบว่าอาจมีค่าบริการ`;
    this.cloudNote.textContent = edge ? 'มีเสียงไทยชายและหญิงให้เลือกทันที ไม่ต้องติดตั้งเสียงหรือใส่คีย์ ต้องใช้อินเทอร์เน็ต' : p === 'custom' ? 'ส่งข้อความไปที่ /v1/audio/speech ของเซิร์ฟเวอร์ที่ใส่ไว้ ถ้าเป็น localhost ไม่ต้องยินยอม เพราะไม่ออกจากเครื่อง' : 'เสียงสร้างโดย AI ใช้เฉพาะข้อความที่สั่งให้อ่าน ไม่ส่งเสียงไมค์หรือภาพหน้าจอ';
    this.voice.replaceChildren();
    const voices = local ? this.info.voices : edge ? this.info.edgeVoices : kokoro ? this.info.kokoroVoices || [] : typed ? [] : this.info.cloudVoices.map((id) => ({ id, name: id, lang: 'ไทยและภาษาอื่น' }));
    for (const v of voices) { const option = node('option', `${v.name} · ${v.lang}`); option.value = v.id; this.voice.append(option); }
    if (voices.some((v) => v.id === this.settings.voice)) this.voice.value = this.settings.voice;
    else this.voice.value = voices.find((v) => /^th/i.test(v.lang))?.id || voices[0]?.id || '';
    const keyNote = this.info.hasKeys?.[p] ? ' · มีคีย์บันทึกไว้แล้ว' : p === 'custom' ? '' : ' · ยังไม่มีคีย์';
    this.note.textContent = local ? (voices.some((v) => /^th/i.test(v.lang)) ? 'พบเสียงภาษาไทย อ่านได้โดยไม่ส่งข้อความออกจากเครื่อง' : 'ยังไม่พบเสียงภาษาไทย ติดตั้งเสียงไทยในเครื่อง หรือเลือกเสียงไทย Edge ที่ใช้ได้ทันทีผ่านอินเทอร์เน็ต')
      : edge ? 'เสียงไทยพร้อมใช้ผ่าน Microsoft Edge TTS · ต้องใช้อินเทอร์เน็ต · ไม่ต้องใส่ API key'
        : kokoro ? 'ทำงานในเครื่อง ไม่ส่งข้อความออกไป ครั้งแรกดาวน์โหลดโมเดลประมาณ 90 MB · อ่านภาษาอังกฤษ ญี่ปุ่น จีน และอีกบางภาษา · ภาษาไทยแบบทดลอง: ฟังรู้เรื่องแต่สำเนียงต่างชาติ เสียงจีนมีวรรณยุกต์ใกล้ไทยกว่า'
          : `ส่งข้อความไป ${NAME} เพื่อสร้างเสียง${keyNote}`;
  }
  async show() { this.root.hidden = false; this.status.textContent = ''; this.onVisibility(true); await this.load(); this.provider.focus(); }
  hide() { this.root.hidden = true; this.key.value = ''; this.onVisibility(false); }
  async save() {
    const p = this.provider.value, typed = ['elevenlabs', 'fish', 'custom'].includes(p);
    const settings = { provider: p, voice: typed ? this.voiceId.value.trim() : this.voice.value, volume: Number(this.volume.value), rate: Number(this.rate.value), auto: this.auto.checked, cloudConsent: this.consent.checked,
      customUrl: this.customUrl.value.trim(), customModel: this.customModel.value.trim(), pitch: Number(this.pitch.value), robot: Number(this.robot.value), glitch: Number(this.glitch.value), layers: this.layers.checked };
    const local = p === 'windows' || p === 'kokoro' || (p === 'custom' && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//i.test(settings.customUrl));
    if (!local && !settings.cloudConsent) throw new Error('กรุณายินยอมส่งข้อความไปบริการเสียงออนไลน์ก่อน');
    this.settings = await this.host.speechSave(settings, ['openai', 'elevenlabs', 'fish', 'custom'].includes(p) ? this.key.value.trim() : ''); this.key.value = ''; return this.settings;
  }
  error(error) { this.status.textContent = String(error.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); }
  async tryPlay(text) { try { await this.save(); await this.play(text); } catch (error) { this.error(error); } }
  async play(text) {
    text = speechText(text);
    if (!text) throw new Error('ยังไม่มีข้อความให้อ่าน');
    if (this.muted) throw new Error('แอปปิดเสียงอยู่ กรุณาเปิดเสียงในเมนูคลิกขวาก่อน');
    this.stop(); const serial = this.serial;
    this.stopButton.textContent = '■ หยุดเสียงพูด';
    this.stopButton.hidden = false; this.status.textContent = 'กำลังสร้างเสียง…';
    try {
      const buffer = await this.fetchAudio(text);
      if (serial !== this.serial) return;
      this.playBuffer(buffer, serial);
    } catch (error) { if (serial === this.serial) { this.stopButton.hidden = true; throw error; } }
  }
  // the voice service's audio for `text`, decoded
  async fetchAudio(text) {
    this.context ||= new AudioContext(); await this.context.resume();
    const result = await this.host.speechSpeak(text);
    return this.context.decodeAudioData(Uint8Array.from(atob(result.audio), (c) => c.charCodeAt(0)).buffer);
  }
  // plays one piece through her effects; resolves when it ends (or is stopped). `last`: nothing follows it
  playBuffer(buffer, serial, { last = true } = {}) {
    return new Promise((done) => {
      this.finishPlay = done;
      const ctx = this.context, fx = this.settings, cents = (fx.pitch || 0) * 100;
      this.gain = ctx.createGain(); this.gain.gain.value = fx.volume; this.gain.connect(ctx.destination);
      // robot: her voice rung against a low hum, mixed in by how much
      const into = ctx.createGain();
      if (fx.robot > 0) {
        const dry = ctx.createGain(), wet = ctx.createGain(), depth = ctx.createGain();
        dry.gain.value = 1 - fx.robot * 0.7; wet.gain.value = 0; depth.gain.value = fx.robot;
        this.osc = ctx.createOscillator(); this.osc.frequency.value = 55; this.osc.connect(depth).connect(wet.gain); this.osc.start();
        into.connect(dry).connect(this.gain); into.connect(wet).connect(this.gain);
      } else into.connect(this.gain);
      // pitch moves the whole voice (and its speed a little); layers: one copy higher, one lower, quieter
      this.sources = [[cents, 1], ...(fx.layers ? [[cents + 500, 0.3], [cents - 500, 0.3]] : [])].map(([detune, level]) => {
        const source = ctx.createBufferSource(), g = ctx.createGain(); source.buffer = buffer; source.detune.value = detune; g.gain.value = level;
        source.connect(g).connect(into); return source;
      });
      this.source = this.sources[0]; this.speed = 2 ** (cents / 1200);
      // glitch: now and then her voice drops out for a few hundredths of a second
      if (fx.glitch > 0) this.glitchTimer = setInterval(() => { if (Math.random() < fx.glitch * 0.35) { const t = ctx.currentTime; this.gain.gain.setValueAtTime(0, t); this.gain.gain.setValueAtTime(fx.volume, t + 0.03 + Math.random() * 0.06); } }, 120);
      this.source.onended = () => {
        if (serial === this.serial) { if (last) { this.stopButton.hidden = true; this.status.textContent = 'อ่านจบแล้ว'; } this.release(); }
        done();
      };
      this.mouths = mouthLevels(buffer.getChannelData(0), buffer.sampleRate);
      for (const source of this.sources) source.start(); this.startedAt = ctx.currentTime; this.status.textContent = 'กำลังอ่าน…';
    });
  }
  // her voice's loudness right now, 0 to 1, for her mouth
  level() { return this.source && this.mouths ? this.mouths[Math.floor((this.context.currentTime - this.startedAt) * (this.speed || 1) * MOUTH_RATE)] ?? 0 : 0; }
  // the voice's nodes and timers, let go
  release() { this.finishPlay?.(); this.finishPlay = null; clearInterval(this.glitchTimer); this.osc?.stop(); this.osc = null; for (const s of this.sources || []) { s.onended = null; try { s.stop(); } catch {} } this.sources = []; this.source = null; }
  stop() { const active = this.source || !this.stopButton.hidden; if (this.stream) { this.stream.cancelled = true; this.stream.wake?.(); } this.serial++; this.lastError = false; this.host.speechStop(); if (this.source) this.release(); this.stopButton.hidden = true; if (active) this.status.textContent = 'หยุดเสียงแล้ว'; }
  // the voice failed on her reply: said in the dialog, or on the stop button when it's closed
  failed(error) { this.error(error); if (!this.open) { this.lastError = true; this.stopButton.textContent = 'เสียงพูดไม่พร้อม — เปิดตั้งค่า'; this.stopButton.hidden = false; } }
  // her answer as it comes in (chat.js), turn `id`: said sentence by sentence, the next made while the last plays
  feed(id, text) {
    if (!this.settings.auto || this.muted) return;
    if (this.stream?.id !== id) { this.stop(); this.stream = { id, serial: this.serial, spoken: 0, chunks: [], tail: Promise.resolve() }; this.drain(this.stream); }
    this.pump(this.stream, text, false);
  }
  pump(s, text, final) {
    if (s.cancelled) return;
    for (let next; (next = nextSpeakable(text, s.spoken, final));) {
      s.spoken = next.end;
      const piece = speechText(next.chunk);
      if (!piece) continue;
      this.stopButton.textContent = '■ หยุดเสียงพูด'; this.stopButton.hidden = false;
      // one at a time to the voice service (a new request stops the one before), each started when the last has come back
      s.tail = s.tail.then(() => (s.cancelled ? null : this.fetchAudio(piece))).catch((error) => ({ error }));
      s.chunks.push(s.tail);
    }
    if (final) s.ended = true;
    s.wake?.();
  }
  async drain(s) {
    try {
      for (let i = 0; ; i++) {
        while (i >= s.chunks.length) {
          if (s.ended) { if (!s.cancelled && s.serial === this.serial) { this.stopButton.hidden = true; this.status.textContent = 'อ่านจบแล้ว'; } return; }
          await new Promise((resolve) => { s.wake = resolve; });
          if (s.cancelled) return;
        }
        const got = await s.chunks[i];
        if (s.cancelled || s.serial !== this.serial || !got) return;
        if (got.error) throw got.error;
        await this.playBuffer(got, s.serial, { last: false });
      }
    } catch (error) { if (!s.cancelled) { s.cancelled = true; this.stopButton.hidden = true; this.failed(error); } }
  }
  // her whole answer: the rest of it said (or, with no stream, all of it)
  // a short line she says out loud as well as in her bubble (her hello, a job's result): only with
  // read-aloud on, never over something she's already saying, and quietly if the voice isn't there
  announce(text) {
    if (!this.settings.auto || this.muted || this.active || !speechText(text)) return;
    if (/[฀-๿]/.test(text) && !/^th/i.test(this.settings.voice || '')) return; // an English voice doesn't read Thai
    this.play(text).catch(() => {});
  }
  reply(text) {
    const s = this.stream;
    if (s && !s.ended) { if (s.cancelled) s.ended = true; else this.pump(s, text, true); return; } // stopped mid-answer: the rest isn't read
    if (this.settings.auto) this.play(text).catch((error) => this.failed(error));
  }
}

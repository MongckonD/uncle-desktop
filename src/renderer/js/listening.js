import { computerTask } from './computer-intent.js';
import { Utterance, wakeCommand } from './listening-audio.js';

const NOISE = /^(ขอบคุณ(ที่รับชม|ครับ|ค่ะ)?|thank you( for watching)?|thanks|ค่ะ|ครับ|อืม+|เอ่อ+|โอเค|ok|you|\.+)[.!?\s]*$/i;
export const isNoise = (text) => text.replace(/[\s.,!?]/g, '').length < 3 || NOISE.test(text.trim());
import { confirmationAnswer, runVoiceCommand } from './voice-commands.js';
const el = (tag, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
export class Listening {
  constructor({ host, root, indicator, speech, chat, onVisibility, onWake }) {
    Object.assign(this, { host, root, indicator, speech, chat, onVisibility, onWake });
    this.serial = 0; this.followUntil = 0; this.pending = false; this.processing = false;
    root.className = 'character-picker';
    const box = el('div'); box.className = 'character-picker__box speech-box'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'สั่งงานด้วยเสียง');
    const close = el('button', '✕'); close.className = 'speech-close'; close.setAttribute('aria-label', 'ปิดหน้าต่าง'); close.onclick = () => this.hide();
    box.append(el('h1', 'สั่งงานด้วยเสียง'), close, el('p', 'Ctrl+Alt+V กดเริ่ม/หยุดพูด · Ctrl+Alt+M ปิดไมค์ทันที (เปลี่ยนได้ใน ตั้งค่าทั้งหมด) · เปิดไมค์ใหม่เองทุกครั้งหลังเริ่มโปรแกรม'));
    const field = (label, node) => { const wrap = el('label', label); wrap.append(node); box.append(wrap); return node; };
    const select = (options) => { const n = el('select'); for (const [value, label] of options) { const o = el('option', label); o.value = value; n.append(o); } return n; };
    this.mode = field('วิธีฟัง', select([['push', 'กดพูด — กดเริ่ม / หยุด'], ['wake', 'รอคำเรียก — ตรวจคำเรียกในเครื่อง'], ['always', 'ฟังตลอด — พูดเมื่อไหร่ก็สั่งได้ ไม่ต้องเรียกชื่อ']]));
    this.provider = field('บริการถอดคำสั่งภาษาไทย', select([['local', 'Local AI — ถอดเสียงในเครื่อง'], ['gemini', 'Gemini — ถอดเสียงออนไลน์'], ['openai', 'OpenAI — ถอดเสียงออนไลน์']]));
    this.localModel = field('โมเดล Local — ใช้ตรวจคำเรียกด้วย', select([['small', 'Whisper small — เบา (~190 MB)'], ['thai-medium', 'Thonburian Thai medium — ฝึกภาษาไทย (~539 MB)']]));
    this.silence = field('เว้นจังหวะก่อนจบประโยค (วินาที)', el('input')); this.silence.type = 'number'; this.silence.min = 0.6; this.silence.max = 2.5; this.silence.step = 0.1;
    this.vocabulary = field('ศัพท์เฉพาะ / ชื่อแอป — คั่นด้วยจุลภาค', el('textarea')); this.vocabulary.rows = 2; this.vocabulary.maxLength = 600;
    this.key = field('API key ของบริการที่เลือก — เว้นว่างเพื่อใช้คีย์เดิม', el('input')); this.key.type = 'password'; this.key.autocomplete = 'off'; this.key.maxLength = 512;
    this.provider.onchange = () => { this.key.value = ''; this.consent.checked = false; this.key.parentElement.hidden = this.provider.value === 'local'; };
    this.mic = field('ไมโครโฟน', select([['', 'ไมค์เริ่มต้นของเครื่อง']]));
    const refresh = el('button', 'อนุญาตไมค์และรีเฟรชรายชื่อ'); refresh.onclick = () => this.devices(); box.append(refresh);
    this.words = field('คำเรียก — หนึ่งคำเรียกต่อบรรทัด สูงสุด 5 คำ', el('textarea')); this.words.rows = 2; this.words.maxLength = 304;
    const reset = el('button', 'คืนคำเรียกเริ่มต้น'); reset.onclick = () => { this.words.value = 'เฮ้ อังเคิล'; }; box.append(reset);
    this.follow = field('รอฟังต่อหลังตอบ (วินาที; 0 = เรียกใหม่ทุกครั้ง)', el('input')); this.follow.type = 'number'; this.follow.min = 0; this.follow.max = 30;
    this.threshold = field('ความไวไมค์ — ค่าต่ำรับเสียงเบาได้มากขึ้น', el('input')); this.threshold.type = 'range'; this.threshold.min = 0.005; this.threshold.max = 0.1; this.threshold.step = 0.005;
    this.review = el('input'); this.review.type = 'checkbox'; const review = el('label'); review.append(this.review, document.createTextNode(' ตรวจข้อความก่อนส่ง (ปิดเพื่อส่งอัตโนมัติแบบสนทนา)')); box.append(review);
    this.consent = el('input'); this.consent.type = 'checkbox'; const consent = el('label'); consent.append(this.consent, document.createTextNode(' ยินยอมส่งเสียงคำสั่งไปบริการที่เลือก (Gemini / OpenAI) และรับทราบค่าบริการ — เสียงรอคำเรียกอยู่ในเครื่อง')); box.append(consent);
    this.modelStatus = el('p'); const install = el('button', 'ดาวน์โหลดโมเดล Local ที่เลือก');
    install.onclick = async () => { install.disabled = true; try { const model = this.localModel.value; await host.listeningInstall(model); await this.save(); await this.load(); this.setStatus('ติดตั้งพร้อมใช้งานแล้ว'); } catch (e) { this.error(e); } finally { install.disabled = false; } };
    box.append(this.modelStatus, install, el('p', 'โหมดรอคำเรียกต้องใช้โมเดลในเครื่องเสมอ การตรวจคำเรียกใช้การถอดเสียงไทย จึงอาจช้าหรือคลาดเคลื่อน แนะนำคำหลายพยางค์ที่ไม่พูดบ่อย เสียง local ใช้ไฟล์ชั่วคราวและลบทิ้งหลังถอดเสียง'));
    const actions = el('div'); actions.className = 'speech-actions';
    this.startButton = el('button', '🎤 เริ่มฟัง'); this.startButton.onclick = () => this.toggle();
    const stop = el('button', '■ ปิดไมค์ / ยกเลิก'); stop.onclick = () => this.stop();
    const save = el('button', 'บันทึก'); save.onclick = async () => { try { await this.save(); this.setStatus('บันทึกแล้ว'); } catch (e) { this.error(e); } };
    this.testing = false; const test = this.testButton = el('button', 'ทดสอบเสียง / คำเรียก (ไม่ส่งคำสั่ง)'); test.onclick = async () => { try { await this.begin(true); } catch (e) { this.error(e); } };
    actions.append(this.startButton, stop, test, save); box.append(actions);
    this.level = el('meter'); this.level.min = 0; this.level.max = 0.1; this.level.setAttribute('aria-label', 'ระดับเสียงไมค์'); box.append(this.level);
    this.status = el('p', 'ไมค์ปิดอยู่'); this.status.className = 'speech-status'; this.status.setAttribute('role', 'status'); box.append(this.status);
    this.confirmButtons = el('div'); this.confirmButtons.className = 'speech-actions'; this.confirmButtons.hidden = true;
    const yes = el('button', 'ใช่ — ยืนยัน'); yes.onclick = () => this.answerConfirmation('ใช่').catch(e => this.error(e,{recoverable:true}));
    this.confirmYes = yes;
    const no = el('button', 'ไม่ใช่ / ยกเลิก'); no.onclick = () => this.answerConfirmation('ยกเลิก').catch(e => this.error(e,{recoverable:true}));
    this.confirmButtons.append(yes, no);
    this.diagnostics = el('p', 'ผลทดสอบจะแสดงชื่อโมเดลและเวลาถอดเสียง'); box.append(this.diagnostics);
    this.heard = field('เสียงที่ถอดได้ล่าสุด — แสดงแม้ไม่ตรงคำเรียก', el('textarea')); this.heard.rows = 2; this.heard.readOnly = true; this.heard.placeholder = 'เมื่อถอดเสียงสำเร็จ ข้อความจะปรากฏที่นี่';
    this.transcript = field('คำสั่งที่จะส่ง — แก้ไขก่อนส่งได้', el('textarea')); this.transcript.rows = 3; this.transcript.maxLength = 4000;
    this.sendButton = el('button', 'ส่งข้อความนี้'); this.sendButton.disabled = true; this.sendButton.onclick = () => this.submit().catch(e => this.error(e,{recoverable:true}));
    const discard = el('button', 'ล้างข้อความ / กลับไปรอเรียก'); discard.onclick = () => { this.clearConfirmation(); this.pending = false; this.transcript.value = ''; this.sendButton.disabled = true; this.followUntil = 0; this.lastResultStatus = ''; this.idle(); };
    box.append(this.sendButton, discard);
    const controls = document.createDocumentFragment(); controls.append(actions, this.level, this.status, this.confirmButtons, this.diagnostics, this.heard.parentElement, this.transcript.parentElement, this.sendButton, discard);
    box.insertBefore(controls, box.children[3]); root.replaceChildren(box);
    for (const event of ['mousedown', 'mouseup', 'click']) { root.addEventListener(event, e => e.stopPropagation()); indicator.addEventListener(event, e => e.stopPropagation()); }
    root.addEventListener('keydown', e => {
      if (e.key === 'Escape') { this.stop(); this.hide(); }
      if (e.key === 'Tab') { const nodes = [...root.querySelectorAll('button,input,textarea,select')].filter(n => !n.disabled && n.getClientRects().length); if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1).focus(); } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus(); } }
    });
    indicator.onclick = () => this.stop();
    host.onListeningProgress(text => { this.modelStatus.textContent = text; });
    navigator.mediaDevices?.addEventListener('devicechange', () => { if (this.stream && this.stream.getTracks().some(t => t.readyState === 'ended')) this.stop(); });
    window.addEventListener('beforeunload', () => this.stop());
    this.clock = setInterval(() => {
      this.expireConfirmation();
      if (!this.stream || this.testing || this.pending || this.processing || this.submitting) return;
      if (this.speech.active || this.chat.turn) this.setStatus('พักไมค์ระหว่างตอบ…');
      else this.idle();
    }, 500);
  }
  get open() { return !this.root.hidden; }
  configure(config) { if (this.characterId && config.characterId !== this.characterId || config.visible === false) this.stop(); this.characterId = config.characterId; }
  setStatus(text) { this.status.textContent = text; if (this.stream) this.indicator.textContent = this.indicator.title = `■ ปิดไมค์ · ${text}`;
    // which step a command is at, for the small icon: waiting, turning speech into text, doing it
    if (this.indicator.dataset) this.indicator.dataset.state = this.submitting ? 'work' : this.processing ? 'hear' : 'listen'; }
  error(error,{recoverable=false}={}) {
    const message=String(error.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
    if(recoverable && this.stream && ['wake','always'].includes(this.settings?.mode)) {
      this.pending=false;this.utterance?.reset();this.suppressUntil=Date.now()+1500;
      this.lastResultStatus=`คำสั่งนี้ไม่สำเร็จ: ${message} · ยังเปิดไมค์รอฟังต่ออยู่`;
      this.setStatus(this.lastResultStatus);this.chat.voiceResult?.(this.lastResultStatus);return;
    }
    this.stop(); this.root.hidden = false; this.onVisibility(true); this.setStatus(message);
  }
  endConversation() {
    this.speech.stop();
    if(!['wake','always'].includes(this.settings?.mode))this.stop();
  }
  async load() {
    const info = await this.host.listeningInfo(); this.settings = info.settings;await this.realtime?.load();
    for (const key of ['mode', 'provider', 'localModel']) this[key].value = this.settings[key];
    this.silence.value = this.settings.silenceSeconds; this.vocabulary.value = this.settings.vocabulary; this.key.value = ''; this.key.parentElement.hidden = this.settings.provider === 'local';
    this.follow.value = this.settings.followSeconds; this.threshold.value = this.settings.threshold;
    this.words.value = this.settings.wakeWords.join('\n'); this.review.checked = this.settings.review; this.consent.checked = this.settings.cloudConsent;
    const modelStatus = () => { this.modelStatus.textContent = info.models?.[this.localModel.value] ? '✓ โมเดลที่เลือกพร้อม · ตรวจคำเรียกในเครื่อง' : 'ยังไม่มีโมเดลที่เลือก — กดดาวน์โหลดก่อนใช้งาน'; }; this.localModel.onchange = modelStatus; modelStatus();
    await this.devices(false); this.mic.value = this.settings.deviceId;this.realtime?.refresh();
  }
  async devices(ask = true) {
    let stream; try {
      if (ask) stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const list = await navigator.mediaDevices.enumerateDevices(), previous = this.mic.value;
      this.mic.replaceChildren(); const def = el('option', 'ไมค์เริ่มต้น'); def.value = ''; this.mic.append(def);
      for (const mic of list.filter(d => d.kind === 'audioinput' && d.deviceId !== 'default')) { const option = el('option', mic.label || 'ไมโครโฟน'); option.value = mic.deviceId; this.mic.append(option); }
      this.mic.value = previous;
    } catch (e) { this.setStatus('เปิดไมค์ไม่สำเร็จ ตรวจสิทธิ์ไมโครโฟนใน Windows'); } finally { stream?.getTracks().forEach(t => t.stop()); }
  }
  async show() { this.root.hidden = false; this.onVisibility(true); try { if (!this.stream) await this.load(); } catch (e) { this.error(e); } this.mode.focus(); }
  hide() { this.root.hidden = true; this.onVisibility(false); }
  clearConfirmation() { this.confirmation = null; if (this.confirmButtons) this.confirmButtons.hidden = true; }
  async speakFeedback(text) {
    try { await this.speech.play(text); this.voiceUnavailable = false; }
    catch { this.voiceUnavailable = true; if (this.confirmation) this.setStatus(`${this.confirmation.question} (เสียงพูดยังไม่พร้อม — ตอบด้วยเสียงหรือปุ่มได้)`); }
  }
  async respond(text) {
    if (!text) return;
    this.lastResultStatus = text; this.setStatus(text); this.transcript.value = text;
    this.chat.voiceResult?.(text);
    await this.speakFeedback(text);
  }
  requestConfirmation(request) {
    this.clearConfirmation(); this.pending = false; this.sendButton.disabled = true;
    const confirmation = { ...request, until: Infinity }; this.confirmation = confirmation;
    if (this.confirmButtons) this.confirmButtons.hidden = false;
    if (this.confirmYes) this.confirmYes.hidden = Boolean(request.clarify);
    this.setStatus(request.question);
    this.chat.voiceResult?.(request.question);
    if (!this.stream && this.root) this.capture().catch(error => this.error(error));
    const serial = this.serial;
    this.speakFeedback(request.question).then(async () => {
      while (serial === this.serial && this.confirmation === confirmation && this.speech.active) await new Promise(r => setTimeout(r, 100));
      if (serial === this.serial && this.confirmation === confirmation) { confirmation.until = Date.now() + 20000; this.setStatus(request.question + ' (รอคำตอบ 20 วินาที)'); }
    });
  }
  expireConfirmation() {
    if (!this.confirmation || Date.now() < this.confirmation.until) return;
    const expired=this.confirmation;this.clearConfirmation();expired?.cancel?.(); this.host.listeningStop(); this.followUntil = 0; this.lastResultStatus = 'ยกเลิกคำสั่งแล้ว เพราะไม่ได้รับคำยืนยันภายในเวลา'; this.setStatus(this.lastResultStatus);
    if (this.settings?.mode === 'push') this.releaseMic();
  }
  async answerConfirmation(text) {
    if(this.realtime?.active&&this.realtime.pending)return this.realtime.answer(text);
    const request = this.confirmation; if (!request) return;
    if (Date.now() >= request.until) { this.expireConfirmation(); return; }
    const answer = confirmationAnswer(text);
    if (answer === null && !request.clarify) { this.setStatus('ยังไม่ได้ทำคำสั่ง กรุณาตอบ “ใช่” หรือ “ยกเลิก”'); await this.speakFeedback('กรุณาตอบใช่ หรือยกเลิกค่ะ'); return; }
    if (request.clarify && answer === true && !request.acceptYes) { await this.speakFeedback(request.question); return; }
    this.clearConfirmation(); this.hide(); this.speech.stop();
    const serial = this.serial;
    this.submitting = true;
    try {
      if (answer === false) {await request.cancel?.();await this.respond('ยกเลิกคำสั่งแล้วค่ะ');}
      else if (request.clarify) await request.clarify(text);
      else { const result = await request.execute(); if (serial === this.serial && typeof result === 'string') await this.respond(result); }
      if (serial === this.serial) this.followUntil = Date.now() + this.settings.followSeconds * 1000;
    } finally {
      if (serial === this.serial) { this.submitting = false; if (this.settings.mode === 'push' && !this.confirmation && !this.externalJob) this.releaseMic(); }
    }
  }
  async execute(text, screenConfirmed = false) {
    const job=computerTask(text);
    if(job&&this.chat.onComputer){await this.chat.onComputer(job,{voice:true});return;}
    const serial = this.serial;
    const handled = !screenConfirmed && await runVoiceCommand({ chat: this.chat, text,
      ask: request => { if (serial === this.serial) this.requestConfirmation(request); },
      respond: line => serial === this.serial && this.respond(line),
      fallback: (next, confirmed) => this.execute(next, confirmed), active: () => serial === this.serial,
    });
    if (handled || serial !== this.serial) return;
    await this.chat.start();
    if (serial !== this.serial) return;
    if (!this.chat.open) throw new Error('ตั้งค่า AI แชตก่อน แล้วลองพูดอีกครั้ง');
    await this.chat.send(text);
  }
  async save() {
    if(this.realtime)await this.realtime.save();
    const settings = { provider: this.provider.value, localModel: this.localModel.value, silenceSeconds: Number(this.silence.value), vocabulary: this.vocabulary.value, mode: this.mode.value, deviceId: this.mic.value, wakeWords: this.words.value.split('\n').map(s => s.trim()).filter(Boolean), followSeconds: Number(this.follow.value), threshold: Number(this.threshold.value), review: this.review.checked, cloudConsent: this.consent.checked };
    this.stop(); this.settings = await this.host.listeningSave(settings, this.key.value); this.key.value = ''; return this.settings;
  }
  async toggle() { try { if(this.realtime?.active){this.stop();return;} if (this.stream) { if (this.settings.mode === 'push' && !this.processing) { const bytes = this.utterance.finish(); if (bytes) await this.process(bytes); else this.stop(); } else this.stop(); } else await this.begin(); } catch (e) { this.error(e); } }
  async begin(test = false) {
    if (!this.settings) await this.load(); await this.save(); this.testing = test;
    const s = this.settings, info = await this.host.listeningInfo();
    if(this.realtime?.selected&&!test&&s.mode==='push'){await this.realtime.start();return;}
    if ((s.mode === 'wake' || s.provider === 'local') && !info.ready) throw new Error('กรุณาดาวน์โหลดโมเดลในเครื่องก่อน');
    if (!this.realtime?.selected && s.provider !== 'local' && (!s.cloudConsent || !(s.provider === 'gemini' ? info.hasGeminiKey : info.hasKey))) throw new Error('กรุณายินยอมส่งเสียงและบันทึก API key ของบริการที่เลือกก่อน');
    this.speech.stop(); const serial = this.serial;
    await this.capture(serial);
  }
  async capture(serial = this.serial) {
    const s = this.settings;
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: s.deviceId ? { exact: s.deviceId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
    catch { if (serial !== this.serial) return; throw new Error('เปิดไมค์ไม่ได้ ตรวจสิทธิ์ Windows หรือเลือกไมค์ใหม่'); }
    if (serial !== this.serial) { stream.getTracks().forEach(t => t.stop()); return; }
    this.stream = stream; this.context = new AudioContext(); await this.context.resume();
    if (serial !== this.serial) return;
    this.input = this.context.createMediaStreamSource(stream);
    // ScriptProcessor remains supported by Electron. A single capture graph is shared by both modes.
    this.processor = this.context.createScriptProcessor(4096, 1, 1); this.silent = this.context.createGain(); this.silent.gain.value = 0;
    this.input.connect(this.processor); this.processor.connect(this.silent).connect(this.context.destination);
    this.utterance = new Utterance(this.context.sampleRate, s.threshold, s.silenceSeconds);
    this.stream.getTracks().forEach(t => { t.onended = () => this.error(new Error('ไมโครโฟนถูกตัดการเชื่อมต่อ')); });
    this.processor.onaudioprocess = event => {
      if (serial !== this.serial) return;
      if (this.processing || this.pending || this.speech.active || this.chat.turn || this.submitting || Date.now() < this.suppressUntil) { this.utterance.reset(); return; }
      const samples = event.inputBuffer.getChannelData(0);
      this.utterance.minimumSeconds = this.confirmation ? 0.1 : 0.25;
      this.level.value = Math.sqrt(samples.reduce((n, v) => n + v * v, 0) / samples.length);
      const bytes = this.utterance.push(samples);
      if (bytes) this.process(bytes).catch(e => this.error(e));
    };
    this.indicator.hidden = false; this.startButton.textContent = s.mode === 'push' ? 'หยุดพูดและถอดเสียง' : s.mode === 'always' ? 'ปิดการฟัง' : 'ปิดการรอเรียก'; this.idle();
  }
  idle() { this.setStatus(this.confirmation?.question || this.lastResultStatus || (this.testing ? 'ทดสอบอยู่ — ลองพูดประโยคหรือคำเรียก ไม่มีการส่งคำสั่ง' : this.settings?.mode === 'wake' ? Date.now() < this.followUntil ? 'ฟังคำสั่งต่อ…' : `รอคำเรียก “${this.settings.wakeWords.join('” หรือ “')}”…` : this.settings?.mode === 'always' ? 'ฟังตลอด — พูดได้เลย' : 'ฟังอยู่ — หยุดพูดเพื่อถอดเสียง')); }
  async process(bytes) {
    if (this.processing || this.pending || !this.stream) return;
    const confirmation = this.confirmation;
    this.processing = true; const serial = this.serial;
    const waking = !this.confirmation && !this.externalJob && this.settings.mode === 'wake' && Date.now() >= this.followUntil;
    this.setStatus(waking ? 'ตรวจคำเรียกในเครื่อง…' : 'กำลังถอดเสียง…');
    try {
      const result = await this.host.listeningTranscribe(bytes, waking);
      if (serial !== this.serial) return;
      if (confirmation && this.confirmation !== confirmation) return;
      let text = result.text;
      if (this.heard) this.heard.value = text || '(ไม่พบข้อความจากเสียง ลองพูดใกล้ไมค์หรือปรับความไว)';
      if (this.diagnostics) this.diagnostics.textContent = `${result.provider || ''} · ${result.model || ''} · ${((result.elapsedMs || 0) / 1000).toFixed(1)} วินาที`;
      this.lastResultStatus = '';
      if (this.testing) {
        const match = waking ? wakeCommand(text, this.settings.wakeWords) : null;
        this.lastResultStatus = waking ? match === null ? 'ทดสอบ: ไม่พบคำเรียก — ไม่มีการส่งคำสั่ง' : 'ทดสอบ: พบคำเรียก — ไม่มีการส่งคำสั่ง' : 'ทดสอบเสร็จ — ไม่มีการส่งคำสั่ง';
        this.setStatus(this.lastResultStatus); if (this.settings.mode === 'push') this.releaseMic(); return;
      }
      if(this.realtime?.selected&&!this.realtime.active&&!this.testing&&waking){const command=wakeCommand(text,this.settings.wakeWords);if(command===null){this.lastResultStatus='ยังไม่พบคำเรียก';return;}this.releaseMic();await this.realtime.start(command);return;}
      if (this.externalJob && !this.confirmation) {await this.onJobControl?.(wakeCommand(text,this.settings.wakeWords)??text);return;}
      if (this.confirmation) { await this.answerConfirmation(wakeCommand(text, this.settings.wakeWords) ?? text); return; }
      if (waking) {
        const command = wakeCommand(text, this.settings.wakeWords);
        this.setStatus(`ได้ยิน: ${text || '(ไม่มีข้อความ)'} · ${command === null ? 'ไม่พบคำเรียก' : '✓ เรียกสำเร็จ'}`);
        if (command === null) { this.lastResultStatus = `ไม่พบคำเรียก “${this.settings.wakeWords.join('” หรือ “')}” — ตรวจเสียงที่ถอดได้ล่าสุด แล้วเพิ่มคำเรียกสำรองได้`; this.setStatus(this.lastResultStatus); }
        if (this.testing || command === null) return;
        this.onWake?.(); this.suppressUntil = Date.now() + 400;
        if (this.context) {
          const tone = this.context.createOscillator(), volume = this.context.createGain();
          tone.frequency.value = 660; volume.gain.value = 0.025; tone.connect(volume).connect(this.context.destination);
          tone.start(); tone.stop(this.context.currentTime + 0.1); tone.onended = () => { tone.disconnect(); volume.disconnect(); };
        }
        this.followUntil = Date.now() + 10000;
        if (!command) { this.setStatus('✓ ตื่นแล้ว — พูดคำสั่งได้เลย'); return; }
        text = command;
        if (['gemini', 'openai'].includes(this.settings.provider)) {
          this.setStatus('ตื่นแล้ว — ถอดคำสั่งด้วยบริการที่เลือก…');
          const precise = await this.host.listeningTranscribe(bytes, false);
          if (serial !== this.serial) return;
          if (this.heard) this.heard.value = precise.text;
          if (this.diagnostics) this.diagnostics.textContent = `${precise.provider} · ${precise.model} · ${(precise.elapsedMs / 1000).toFixed(1)} วินาที`;
          const clean = wakeCommand(precise.text, this.settings.wakeWords);
          if (clean === null || !clean.trim()) { this.lastResultStatus = 'ตื่นแล้ว — กรุณาพูดคำสั่งอีกครั้งโดยไม่ต้องเรียกชื่อ'; this.setStatus(this.lastResultStatus); this.followUntil = Date.now() + 10000; return; }
          text = clean;
        }
      }
      else if (this.settings.mode === 'wake') {
        const command = wakeCommand(text, this.settings.wakeWords);
        if (command !== null) { text = command; if (!text) { this.followUntil = Date.now() + 10000; return; } }
      }
      // listening all the time hears everything: a word or two, or what speech-to-text makes up
      // from noise (ขอบคุณที่รับชม…), is not a command
      if (this.settings.mode === 'always' && !confirmation && !this.externalJob && isNoise(text)) { this.lastResultStatus = ''; return; }
      if (!text.trim()) return;
      this.transcript.value = text; this.sendButton.disabled = false; this.pending = true;
      if (this.settings.review) { this.setStatus('ตรวจข้อความแล้วกดส่ง หรือยกเลิก'); await this.show(); }
      else await this.submit();
      if (this.settings.mode === 'push' && serial === this.serial && !this.confirmation && !this.externalJob) this.releaseMic();
    } catch (error) { if (serial === this.serial && (!confirmation || this.confirmation === confirmation)) this.error(error,{recoverable:true}); }
    finally { if (serial === this.serial) { this.processing = false; if (!this.pending && this.stream && !waking) this.idle(); } }
  }
  async submit() {
    const text = this.transcript.value.trim(); if (!text || this.submitting || this.chat.turn) return;
    const serial = this.serial; this.submitting = true; this.pending = false; this.sendButton.disabled = true;
    this.hide(); this.setStatus('กำลังตอบ…');
    try {
      await this.execute(text);
      while (serial === this.serial && this.speech.active) await new Promise(r => setTimeout(r, 100));
      if (serial === this.serial) { this.followUntil = Date.now() + this.settings.followSeconds * 1000; if (!this.confirmation) this.transcript.value = ''; if (this.stream) this.idle(); }
    } finally { if (serial === this.serial) this.submitting = false; }
  }
  releaseMic() {
    if (this.processor) { this.processor.onaudioprocess = null; this.processor.disconnect(); this.processor = null; }
    this.input?.disconnect(); this.input = null;
    this.stream?.getTracks().forEach(t => { t.onended = null; t.stop(); }); this.stream = null;
    this.context?.close().catch(() => {}); this.context = null; this.utterance?.reset(); this.level.value = 0;
    this.indicator.hidden = true; this.startButton.textContent = '🎤 เริ่มฟัง';
  }
  stop() { this.realtime?.stop();const pending=this.confirmation;this.serial++;pending?.cancel?.(); this.clearConfirmation(); this.releaseMic(); this.host.listeningStop(); this.processing = false; this.pending = false; this.followUntil = 0; this.submitting = false; this.lastResultStatus = ''; if (this.sendButton) this.sendButton.disabled = true; this.setStatus('ไมค์ปิดอยู่'); }
}

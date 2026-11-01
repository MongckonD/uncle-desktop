// Her setup as numbered steps: pick her, connect a chat AI, her voice, your mic, a coding AI, then
// try it. Each step reuses the existing settings calls; the detailed panels stay one click away.
const el = (tag, text = '', cls = '') => { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; };
const label = (text, input) => { const l = el('label', text); l.htmlFor = input.id; return l; };
const button = (text, onclick, cls = '') => { const b = el('button', text, cls); b.type = 'button'; b.onclick = onclick; return b; };

const KEYS = { Space: 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
// A key press as an Electron accelerator ('Control+Alt+V'), or null without a modifier and a key.
// By e.code, so a Thai keyboard layout gives the same keys as an English one.
export function accelerator(e) {
  const mods = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
  const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : /^F\d{1,2}$/.test(e.code) ? e.code : KEYS[e.code];
  return mods.length && key ? [...mods, key].join('+') : null;
}
const shown = (keys) => (keys ? keys.replace('Control', 'Ctrl').replace('Super', 'Win') : 'ปิดอยู่');

export const STEPS = [
  ['character', 'เลือกตัวละคร'], ['ai', 'เชื่อม AI แชต'], ['speech', 'เสียงพูด'],
  ['mic', 'ไมค์และคำเรียก'], ['coding', 'Coding AI'], ['finish', 'ทดสอบและเสร็จ'],
];
const OPTIONAL = new Set(['speech', 'mic', 'coding']);
// The step to open on: the first required one not done yet, else the last.
export function firstOpenStep(done) {
  const i = STEPS.findIndex(([id]) => id !== 'finish' && !OPTIONAL.has(id) && !done[id]);
  return i < 0 ? STEPS.length - 1 : i;
}

const HOTKEYS = [['stopJob', 'หยุดงานควบคุมเครื่อง'], ['toggle', 'ซ่อน / เรียกตัวละคร'], ['ghost', 'ซ่อนแบบทำงานเบื้องหลัง'], ['voice', 'เริ่ม / หยุดพูด'], ['mute', 'ปิดไมค์ทันที']];
const PROVIDERS = { ollama: 'Ollama ในเครื่อง', openai: 'OpenAI', gemini: 'Gemini', groq: 'Groq', openrouter: 'OpenRouter', mistral: 'Mistral', deepseek: 'DeepSeek', pollinations: 'ใช้ฟรีออนไลน์', claude: 'Claude Code', custom: 'เซิร์ฟเวอร์ที่ตั้งเอง' };
const SAMPLE = 'สวัสดีค่ะ ฉันพร้อมช่วยคุณแล้ว';

export class Settings {
  // portrait(character): its picture URL · runAI(choice): her guided chat setup ('local' | 'key' | 'free')
  // · onOpen(id): a detailed panel · onTalk(): open her chat
  constructor({ host, root, onOpen, onVisibility, portrait, runAI, onTalk }) {
    Object.assign(this, { host, root, onOpen, onVisibility, portrait, runAI, onTalk });
    this.step = 0; this.done = {};
    root.className = 'character-picker'; root.hidden = true;
    const box = el('div', '', 'character-picker__box speech-box settings-box'); box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-labelledby', 'settings-title');
    const close = button('✕', () => this.hide(), 'speech-close'); close.setAttribute('aria-label', 'ปิดหน้าตั้งค่า');
    this.nav = el('nav', '', 'wizard-steps'); this.nav.setAttribute('aria-label', 'ขั้นตอนตั้งค่า');
    this.body = el('div', '', 'wizard-body');
    this.status = el('p', '', 'speech-status'); this.status.setAttribute('role', 'status');
    this.layout = el('div', '', 'wizard'); this.layout.append(this.nav, this.body);
    this.tabs = el('nav', '', 'settings-tabs'); this.tabs.setAttribute('aria-label', 'หมวดการตั้งค่า');
    this.panel = el('div', '', 'settings-panel');
    box.append(close, this.tabs, this.layout, this.panel, this.status);
    root.replaceChildren(box);
    host.onListeningProgress?.((text) => { if (this.progress) this.progress.textContent = text; });

    for (const event of ['mousedown', 'mouseup', 'click']) root.addEventListener(event, (e) => e.stopPropagation());
    root.addEventListener('click', (e) => { if (e.target === root) this.hide(); });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); }
      if (e.key === 'Tab') {
        const fields = [...root.querySelectorAll('button,input,select')].filter((n) => !n.disabled && n.getClientRects().length);
        if (e.shiftKey && document.activeElement === fields[0]) { e.preventDefault(); fields.at(-1).focus(); }
        else if (!e.shiftKey && document.activeElement === fields.at(-1)) { e.preventDefault(); fields[0].focus(); }
      }
    });
  }
  get open() { return !this.root.hidden; }

  // step: a wizard step id, or a tab ('appearance', 'chat', 'voice', 'behavior', 'agents', 'system');
  // none or 'start' opens the wizard at the first required step not done yet
  async show(step) {
    this.root.hidden = false; this.status.textContent = ''; this.onVisibility(true);
    await this.check();
    const index = STEPS.findIndex(([id]) => id === step);
    if (step && step !== 'start' && index < 0) return this.tab(step);
    this.tab('start');
    this.go(index < 0 ? firstOpenStep(this.done) : index);
  }

  // the tab bar; 'start' is the wizard, the others are her settings (main.js settingsGroups)
  async tab(id) {
    this.groups = await this.host.menuGroups();
    const tabs = [['start', 'เริ่มต้นใช้งาน'], ...this.groups.map((g) => [g.id, g.title])];
    this.tabs.replaceChildren(...tabs.map(([tab, title]) => {
      const b = button(title, () => (tab === 'start' ? this.show('start') : this.tab(tab)), 'settings-tab');
      if (tab === id) b.setAttribute('aria-current', 'page');
      return b;
    }));
    this.layout.hidden = id !== 'start'; this.panel.hidden = id === 'start';
    if (id === 'start') return;
    this.current = id; this.status.textContent = '';
    const group = this.groups.find((g) => g.id === id) || this.groups[0];
    const h = el('h1', group.title); h.id = 'settings-title';
    this.panel.replaceChildren(h);
    if (id === 'appearance') { this.cfg = await this.host.getConfig(); this.panel.append(this.characterGrid(() => this.tab(id))); }
    this.items(group.items, this.panel);
    if (id === 'system') this.more();
    this.tabs.querySelector('[aria-current]')?.focus();
  }

  // menu items as controls: a checkbox is a switch, a set of radios a dropdown, an action a button
  items(list, parent, caption = '') {
    const click = async (id, checked) => {
      try { await this.host.menuClick(id, checked); setTimeout(() => this.open && this.current && this.tab(this.current), 250); }
      catch (e) { this.error(e); }
    };
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      if (it.type === 'radio') {
        const run = []; while (list[i]?.type === 'radio') run.push(list[i++]); i--;
        const select = el('select'); select.id = `settings-${run[0].id}`;
        for (const r of run) { const o = el('option', r.label); o.value = r.id; o.selected = r.checked; o.disabled = !r.enabled; select.append(o); }
        select.onchange = () => click(Number(select.value), true);
        parent.append(label(caption || 'เลือก', select), select);
        caption = '';
      } else if (it.type === 'checkbox') {
        const input = el('input'); input.type = 'checkbox'; input.id = `settings-${it.id}`; input.checked = it.checked; input.disabled = !it.enabled;
        input.onchange = () => click(it.id, input.checked);
        const row = el('label', '', 'settings-switch'); row.htmlFor = input.id; row.append(input, el('span', it.label));
        parent.append(row);
      } else if (it.type === 'submenu') {
        const allRadio = it.submenu.filter((c) => c.type !== 'separator').every((c) => c.type === 'radio');
        if (allRadio) this.items(it.submenu.filter((c) => c.type !== 'separator'), parent, it.label);
        else { const card = el('section', '', 'settings-card'); card.append(el('h2', it.label)); this.items(it.submenu, card, it.label); parent.append(card); }
      } else if (it.type === 'separator') {
        caption = '';
      } else if (it.id !== undefined && it.enabled) {
        parent.append(button(it.label, () => { if (it.label.endsWith('…')) this.hide(); click(it.id); }, 'settings-action'));
      } else if (it.label && list[i + 1]?.type === 'radio') {
        caption = it.label; // a heading for the dropdown below it
      } else if (it.label) {
        parent.append(el('p', it.label, 'settings-note'));
      }
    }
  }
  hide() { if (this.root.hidden) return; this.root.hidden = true; this.onVisibility(false); }

  // what's ready, for the ticks beside each step
  async check() {
    const [cfg, chat, speech, mic, hooks] = await Promise.all([
      this.host.getConfig(), this.host.chatStatus().catch(() => ({ ok: false })), this.host.speechInfo(false).catch(() => null),
      this.host.listeningInfo().catch(() => null), this.host.hooksStatus().catch(() => null),
    ]);
    Object.assign(this, { cfg, chatInfo: chat, speechInfo: speech, micInfo: mic, hooks });
    this.done = { character: Boolean(cfg.welcomed), ai: chat.ok, speech: Boolean(cfg.speech), mic: Boolean(mic?.ready), coding: Boolean(hooks?.installed) };
  }

  go(index) {
    this.step = index; this.status.textContent = ''; this.progress = null;
    this.nav.replaceChildren(...STEPS.map(([id, label], i) => {
      const item = button(`${this.done[id] ? '✓' : i + 1}  ${label}${OPTIONAL.has(id) ? ' · ไม่บังคับ' : ''}`, () => this.go(i), 'wizard-step');
      if (i === index) item.setAttribute('aria-current', 'step');
      if (this.done[id]) item.classList.add('is-done');
      return item;
    }));
    const id = STEPS[index][0];
    this.body.replaceChildren();
    this[id]();
    this.body.querySelector('button,input,select')?.focus();
  }

  page(title, hint) {
    this.body.append(el('p', `ขั้นที่ ${this.step + 1} จาก ${STEPS.length}`, 'wizard-count'));
    const h = el('h1', title); h.id = 'settings-title';
    this.body.append(h, el('p', hint));
  }
  // Back, skip, and the main action that moves on once it works
  footer(primary, onPrimary) {
    const row = el('div', '', 'speech-actions wizard-footer');
    const next = () => this.go(Math.min(this.step + 1, STEPS.length - 1));
    row.append(button(primary, async () => { try { if (await onPrimary?.() !== false) { await this.check(); next(); } } catch (e) { this.error(e); } }));
    if (this.step > 0) row.append(button('ย้อนกลับ', () => this.go(this.step - 1)));
    if (this.step < STEPS.length - 1) row.append(button('ข้ามขั้นนี้', next));
    this.body.append(row);
  }
  choice(title, detail, onclick, recommended = false) {
    const card = button('', onclick, `wizard-choice${recommended ? ' is-recommended' : ''}`);
    card.append(el('b', title), recommended ? el('span', 'แนะนำ', 'wizard-badge') : '', el('small', detail));
    return card;
  }
  state(ok, text) { const p = el('p', `${ok ? '✓' : '!'} ${text}`, `wizard-state ${ok ? 'is-ok' : 'is-todo'}`); this.body.append(p); return p; }

  character() {
    this.page('เลือกตัวละครของคุณ', 'คลิกตัวที่ชอบ เปลี่ยนได้ทุกเมื่อจากเมนูคลิกขวา');
    this.body.append(this.characterGrid(() => this.go(this.step)));
    const view = el('div', '', 'wizard-row');
    for (const [framing, label] of [['full', 'เต็มตัว'], ['bust', 'ครึ่งตัว · เห็นหน้าชัด']]) {
      const b = button(label, async () => { this.cfg = await this.host.setConfig({ characterFraming: framing }); this.go(this.step); });
      if ((this.cfg.characterFraming || 'full') === framing) b.setAttribute('aria-pressed', 'true');
      view.append(b);
    }
    this.body.append(view, button('นำเข้าตัวละครของคุณเอง…', () => { this.hide(); this.onOpen('characters'); }, 'wizard-link'));
    this.footer('ใช้ตัวนี้ ไปต่อ');
  }

  // her characters as picture cards; picking one saves it, then calls then()
  characterGrid(then) {
    const grid = el('div', '', 'wizard-characters');
    for (const c of this.cfg.characters || []) {
      const card = button('', async () => { this.cfg = await this.host.setConfig({ characterId: c.id }); then(); }, 'wizard-character');
      if (c.id === this.cfg.characterId) card.setAttribute('aria-pressed', 'true');
      const img = el('img'); img.src = this.portrait(c); img.alt = '';
      card.append(img, el('span', c.nameTh || c.name));
      grid.append(card);
    }
    return grid;
  }

  ai() {
    this.page('จะให้คุยผ่าน AI ตัวไหน', 'เลือกหนึ่งแบบ ระบบจะพาตั้งค่าทีละขั้นจนพร้อมคุย เปลี่ยนทีหลังได้เสมอ');
    const pick = (choice) => async () => { this.hide(); await this.runAI(choice); await this.show('ai'); };
    this.body.append(
      this.choice('ในเครื่องนี้ (Ollama)', 'ฟรี เป็นส่วนตัว ติดตั้งและโหลดโมเดลให้อัตโนมัติ ต้องใช้ RAM 8 GB ขึ้นไป', pick('local'), true),
      this.choice('ใช้ API key', 'Gemini, Groq, OpenAI และอื่นๆ ตอบเร็ว ต้องต่อเน็ต', pick('key')),
      this.choice('ลองใช้ฟรีก่อน', 'ไม่ต้องสมัคร เริ่มคุยได้ทันที ความเร็วขึ้นกับบริการฟรี', pick('free')),
    );
    const c = this.chatInfo;
    this.state(c.ok, c.ok ? `พร้อมคุย · ${PROVIDERS[c.provider] || c.provider} · ${c.model}` : 'ยังคุยไม่ได้ เลือกหนึ่งแบบด้านบน');
    this.footer('ตรวจอีกครั้งแล้วไปต่อ', async () => { await this.check(); if (!this.chatInfo.ok) { this.go(this.step); this.status.textContent = 'ยังเชื่อม AI ไม่ได้ ลองเลือกแบบอื่น หรือกดข้ามไปก่อน'; return false; } });
  }

  speech() {
    this.page('เสียงพูด', 'ให้ตัวละครอ่านคำตอบออกเสียง เลือกเสียงแล้วกดฟังตัวอย่าง');
    const info = this.speechInfo || { settings: { provider: 'edge' }, voices: [], edgeVoices: [] };
    const settings = { ...info.settings };
    if (!this.cfg.speech) settings.provider = 'edge';
    const provider = el('select'); provider.id = 'wizard-speech-provider';
    for (const [id, label] of [['edge', 'เสียงไทย Edge — ฟรี ไม่ต้องใส่คีย์ (แนะนำ)'], ['windows', 'เสียง Windows — ใช้ได้ออฟไลน์']]) { const o = el('option', label); o.value = id; provider.append(o); }
    provider.value = settings.provider === 'openai' ? 'edge' : settings.provider;
    const voice = el('select'); voice.id = 'wizard-speech-voice';
    const fill = () => {
      const list = provider.value === 'edge' ? info.edgeVoices : info.voices.filter((v) => /^th/i.test(v.lang));
      voice.replaceChildren(...list.map((v) => { const o = el('option', v.name); o.value = v.id; return o; }));
      if (!list.length) voice.append(el('option', 'ไม่พบเสียงไทยใน Windows — เลือก Edge แทน'));
      if (list.some((v) => v.id === settings.voice)) voice.value = settings.voice;
    };
    provider.onchange = fill; fill();
    const auto = el('input'); auto.type = 'checkbox'; auto.id = 'wizard-speech-auto'; auto.checked = this.cfg.speech ? settings.auto : true;
    const autoLabel = el('label'); autoLabel.htmlFor = auto.id; autoLabel.append(auto, document.createTextNode(' อ่านทุกคำตอบอัตโนมัติ'));
    const save = () => this.host.speechSave({ ...settings, provider: provider.value, voice: voice.value || '', auto: auto.checked }, '');
    this.body.append(label('บริการเสียง', provider), provider, label('เสียง', voice), voice, autoLabel,
      button('▶ ฟังตัวอย่าง', async () => { try { await save(); this.status.textContent = 'กำลังพูด…'; await this.host.speechSpeak(SAMPLE); this.status.textContent = 'ได้ยินไหม ถ้าได้ยินกดไปต่อได้เลย'; } catch (e) { this.error(e); } }),
      button('OpenAI และปรับความเร็ว ระดับเสียง…', () => { this.hide(); this.onOpen('speech'); }, 'wizard-link'));
    this.footer('บันทึกแล้วไปต่อ', save);
  }

  mic() {
    this.page('ไมค์และคำเรียก', 'สั่งงานด้วยเสียงภาษาไทย ถอดเสียงในเครื่องได้ฟรี ต้องดาวน์โหลดโมเดลครั้งเดียว');
    const info = this.micInfo;
    if (!info) { this.state(false, 'อ่านสถานะไมค์ไม่ได้'); this.footer('ไปต่อ'); return; }
    const settings = { ...info.settings };
    const model = el('select'); model.id = 'wizard-mic-model';
    for (const [id, label] of [['thai-medium', 'Thonburian ภาษาไทย — แม่นกว่า ขนาด 550 MB (แนะนำ)'], ['small', 'Whisper small — เล็กกว่า ขนาด 200 MB']]) { const o = el('option', label + (info.models?.[id] ? ' ✓ มีแล้ว' : '')); o.value = id; model.append(o); }
    model.value = settings.localModel;
    const mode = el('select'); mode.id = 'wizard-mic-mode';
    for (const [id, label] of [['push', 'กดพูด — กด Ctrl+Alt+V แล้วพูด'], ['wake', 'รอคำเรียก — เรียกชื่อแล้วสั่งได้เลย'], ['always', 'ฟังตลอด — พูดเมื่อไหร่ก็สั่งได้']]) { const o = el('option', label); o.value = id; mode.append(o); }
    mode.value = settings.mode;
    const download = button('ดาวน์โหลดโมเดลที่เลือก', async () => {
      download.disabled = true;
      try { this.progress.textContent = 'กำลังเริ่มดาวน์โหลด…'; await this.host.listeningInstall(model.value); await save(); await this.check(); this.go(this.step); this.status.textContent = 'ติดตั้งโมเดลแล้ว'; }
      catch (e) { this.error(e); } finally { download.disabled = false; }
    });
    const save = () => this.host.listeningSave({ ...settings, provider: 'local', localModel: model.value, mode: mode.value }, '');
    this.body.append(label('โมเดลถอดเสียง', model), model, download);
    this.progress = el('p', '', 'wizard-progress'); this.body.append(this.progress);
    const ready = el('p'); this.body.append(ready);
    const modelState = () => { const ok = Boolean(info.models?.[model.value]); ready.textContent = ok ? '✓ โมเดลพร้อมใช้งาน' : '! ยังไม่มีโมเดลนี้ กดดาวน์โหลดก่อน'; ready.className = `wizard-state ${ok ? 'is-ok' : 'is-todo'}`; };
    model.onchange = modelState; modelState();
    this.body.append(label('วิธีสั่งงาน', mode), mode,
      button('เลือกไมค์ ตั้งคำเรียก ทดสอบเสียง และ ElevenLabs…', async () => { await save().catch(() => {}); this.hide(); this.onOpen('listening'); }, 'wizard-link'));
    this.footer('บันทึกแล้วไปต่อ', async () => { await save(); });
  }

  coding() {
    const name = { claude: 'Claude Code', codex: 'Codex', agy: 'Antigravity' }[this.cfg.assistant] || this.cfg.assistant;
    this.page('ติดตามงาน Coding AI', `ให้ตัวละครบอกว่า ${name} กำลังทำอะไร แจ้งเตือนเมื่อรออนุมัติ และฉลองเมื่องานเสร็จ ข้ามได้ถ้าไม่ได้ใช้`);
    const installed = Boolean(this.hooks?.installed);
    this.state(installed, installed ? `เชื่อมกับ ${name} แล้ว` : `ยังไม่ได้เชื่อมกับ ${name}`);
    if (!installed) this.body.append(button(`เชื่อมกับ ${name}`, async () => { try { const r = await this.host.installHooks(); if (r && r.ok === false) throw new Error(r.error); await this.check(); this.go(this.step); this.status.textContent = 'เชื่อมแล้ว เปิด session ใหม่ของ AI เพื่อเริ่มใช้'; } catch (e) { this.error(e); } }));
    this.body.append(el('p', 'ใช้ Codex หรือ Antigravity? เปลี่ยนได้จากเมนูคลิกขวา → AI ที่ติดตาม'));
    this.footer('ไปต่อ');
  }

  finish() {
    this.page('พร้อมแล้ว', 'ตรวจว่าแต่ละส่วนพร้อมไหม แล้วลองคุยกันได้เลย');
    for (const [id, label] of STEPS.slice(0, -1)) {
      const row = this.state(this.done[id], `${label}${this.done[id] ? '' : OPTIONAL.has(id) ? ' — ข้ามไว้' : ' — ยังไม่เสร็จ'}`);
      if (!this.done[id]) row.append(' ', button('ไปตั้งค่า', () => this.go(STEPS.findIndex(([s]) => s === id)), 'wizard-link'));
    }
    const row = el('div', '', 'speech-actions wizard-footer');
    row.append(button('เริ่มคุยเลย', async () => { await this.host.setConfig({ welcomed: true }); this.hide(); if (this.chatInfo.ok) this.onTalk(); }), button('ย้อนกลับ', () => this.go(this.step - 1)));
    this.body.append(row);
  }

  // shortcuts, her personality and memory, and the panels that aren't a first-run step
  // the System tab's own part: shortcuts, her personality and memory, and reset
  more() {
    this.panel.append(el('h2', 'คีย์ลัด'), el('p', 'คลิกช่องแล้วกดปุ่มที่ต้องการ ต้องมี Ctrl, Alt, Shift หรือ Win ร่วมด้วย · Backspace เพื่อปิดคีย์ลัดนั้น'));
    const hotkeys = this.cfg.hotkeys || {};
    this.keys = {};
    for (const [id, label] of HOTKEYS) {
      const input = el('input'); input.id = `hotkey-${id}`; input.readOnly = true; input.dataset.keys = hotkeys[id] || ''; input.value = shown(hotkeys[id]);
      const caption = el('label', label); caption.htmlFor = input.id;
      input.onkeydown = (e) => {
        if (e.key === 'Tab' || e.key === 'Escape') return;
        e.preventDefault();
        if (e.key === 'Backspace' || e.key === 'Delete') input.dataset.keys = '';
        else input.dataset.keys = accelerator(e) ?? input.dataset.keys;
        input.value = shown(input.dataset.keys);
      };
      this.keys[id] = input;
      this.panel.append(caption, input);
    }
    const keyActions = el('div', '', 'speech-actions');
    keyActions.append(button('บันทึกคีย์ลัด', () => this.saveKeys()), button('คืนค่าเริ่มต้น', () => this.saveKeys({ stopJob: 'Control+Alt+X', toggle: 'Control+Alt+C', voice: 'Control+Alt+V', mute: 'Control+Alt+M' })));
    this.panel.append(keyActions);

    this.panel.append(el('h2', 'บุคลิกและความจำระยะยาว'), el('p', 'สองไฟล์นี้ส่งให้ AI ทุกครั้งที่คุย เปิดแก้ใน Notepad บันทึกแล้วมีผลตอนเปิดแชตครั้งถัดไป'));
    const notes = el('div', '', 'wizard-row');
    notes.append(button('แก้ไข personality.md', () => this.openNotes('personality')), button('แก้ไข me.md', () => this.openNotes('me')));
    const learn = el('input'); learn.type = 'checkbox'; learn.id = 'settings-learn'; learn.checked = this.cfg.learn !== false;
    learn.onchange = () => this.host.setConfig({ learn: learn.checked });
    const learnLabel = el('label'); learnLabel.htmlFor = learn.id;
    learnLabel.append(learn, document.createTextNode(' ให้จดสิ่งที่เรียนรู้ลง me.md เองทุก 5 รอบที่คุย (ใช้ AI ตัวเดียวกับแชต ไม่ทำกับ Claude Code)'));
    this.panel.append(notes, learnLabel);

    this.panel.append(el('h2', 'ความสามารถอื่น'));
    const more = el('div', '', 'wizard-row');
    more.append(button('ควบคุมเครื่อง…', () => { this.hide(); this.onOpen('computer'); }), button('ชื่อเล่นและความจำสั้น…', () => { this.hide(); this.onOpen('customize'); }));
    this.panel.append(more);

    const updateNote = el('p', 'ตรวจอัตโนมัติทุก 6 ชั่วโมง เจอแล้วโหลดให้เอง แล้วตัวละครจะบอกคุณ');
    const check = button('เช็คอัปเดตตอนนี้', async () => {
      check.disabled = true; updateNote.textContent = 'กำลังเช็ค…';
      try {
        const { version, latest, manual } = await this.host.checkUpdate();
        updateNote.textContent = !latest ? `เวอร์ชัน ${version} · เช็คได้เฉพาะตัวที่ติดตั้งจาก installer`
          : latest === version ? `เวอร์ชัน ${version} · ล่าสุดแล้ว` : manual ? `เวอร์ชัน ${version} · มี ${latest} แล้ว ตัวละครจะพาไปหน้าดาวน์โหลด` : `เวอร์ชัน ${version} · เจอ ${latest} กำลังดาวน์โหลด เสร็จแล้วตัวละครจะบอก`;
      } catch (err) { updateNote.textContent = `เช็คไม่สำเร็จ: ${err.message}`; }
      check.disabled = false;
    });
    this.panel.append(el('h2', 'อัปเดต'), updateNote, check);
    this.panel.append(el('h2', 'ล้างการตั้งค่าทั้งหมด'), el('p', 'คืนทุกอย่างเป็นค่าเริ่มต้นและลบ API key ที่บันทึกไว้ แล้วเริ่มตั้งค่าทีละขั้นใหม่ ไม่ลบโมเดลเสียงที่ดาวน์โหลดแล้ว ตัวละครที่นำเข้า ประวัติสนทนา และไฟล์ personality.md / me.md'));
    const reset = button('ล้างการตั้งค่าทั้งหมด…', () => {
      if (reset.dataset.armed) return this.host.resetConfig().catch((e) => this.error(e));
      reset.dataset.armed = '1'; reset.textContent = 'กดอีกครั้งเพื่อยืนยันการล้าง'; reset.classList.add('wizard-danger');
      this.status.textContent = 'ยังไม่ได้ล้าง — กดปุ่มเดิมอีกครั้งเพื่อยืนยัน หรือปิดหน้านี้เพื่อยกเลิก';
    });
    this.panel.append(reset);
  }

  async saveKeys(keys = Object.fromEntries(HOTKEYS.map(([id]) => [id, this.keys[id].dataset.keys]))) {
    try {
      const result = await this.host.saveHotkeys(keys);
      for (const [id] of HOTKEYS) { this.keys[id].dataset.keys = result.hotkeys[id] || ''; this.keys[id].value = shown(result.hotkeys[id]); }
      this.status.textContent = result.taken.length
        ? `โปรแกรมอื่นใช้ ${result.taken.map((id) => shown(keys[id])).join(', ')} อยู่ จึงคงคีย์เดิมไว้`
        : 'บันทึกคีย์ลัดแล้ว';
    } catch (error) { this.error(error); }
  }

  async openNotes(id) {
    const failed = await this.host.openNotes(id).catch((error) => error.message);
    this.status.textContent = failed ? `เปิดไฟล์ไม่ได้: ${failed}` : 'เปิดใน Notepad แล้ว บันทึกไฟล์แล้วเปิดแชตใหม่';
  }

  error(error) { this.status.textContent = String(error.message || error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); }
}

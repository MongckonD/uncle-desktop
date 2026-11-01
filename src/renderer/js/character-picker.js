import { CharacterImport } from './character-import.js';
import { createCharacterRenderer } from './character-renderer.js';
import { loadCharacterSource, assetURL } from './character-assets.js';
const COPY = {
  th: { title: 'เลือกเพื่อนบนเดสก์ท็อป', subtitle: 'ดูหน้าตาก่อนเลือก เปลี่ยนตัวได้ทุกเมื่อ', original: 'ตัวละครต้นฉบับ', game: 'ตัวละครจากเกมของคุณ', active: 'กำลังใช้งาน', select: 'ใช้ตัวละครนี้', current: 'กำลังใช้ตัวนี้อยู่', close: 'ปิด', loading: 'กำลังเปลี่ยน…', failed: 'เปลี่ยนไม่สำเร็จ ลองอีกครั้ง' },
  en: { title: 'Choose your desktop companion', subtitle: 'Preview a character before choosing. Switch anytime.', original: 'Original character', game: 'Your game character', active: 'Currently active', select: 'Use this character', current: 'Already active', close: 'Close', loading: 'Switching…', failed: 'Could not switch. Please try again.' },
};

export class CharacterPicker {
  constructor({ root, characters, currentId, lang, host, onChoose, onVisibility, scale = 0.6, framing = 'full' }) {
    this.root = root;
    this.characters = characters;
    this.currentId = this.pendingId = currentId;
    this.lang = lang;
    this.host = host;
    this.t = COPY[lang] || COPY.en;
    this.onChoose = onChoose;
    this.onVisibility = onVisibility;
    this.cards = new Map();
    this.currentScale = this.pendingScale = scale;
    this.currentFraming = this.pendingFraming = framing || 'full';
    this.previewState = 'idle';
    this.previewRequest = 0;
    const box = document.createElement('div');
    box.className = 'character-picker__box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-labelledby', 'character-picker-title');
    const header = document.createElement('header');
    const eyebrow = document.createElement('span');
    eyebrow.className = 'character-picker__eyebrow';
    eyebrow.textContent = lang === 'th' ? 'ตัวละครของคุณ' : 'DESKTOP COMPANIONS';
    const title = document.createElement('h1');
    title.id = 'character-picker-title';
    title.textContent = this.t.title;
    const subtitle = document.createElement('p');
    subtitle.textContent = this.t.subtitle;
    const close = document.createElement('button');
    close.className = 'character-picker__close';
    close.type = 'button';
    close.textContent = '✕';
    close.setAttribute('aria-label', this.t.close);
    close.onclick = () => this.hide();
    header.append(eyebrow, title, subtitle, close);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'character-picker__add';
    add.textContent = lang === 'th' ? '＋ เพิ่มตัวละครของฉัน' : '＋ Add my character';
    add.onclick = () => this.showImport();
    header.append(add);
    const grid = document.createElement('div');
    grid.className = 'character-picker__grid';
    this.grid = grid;
    // Original first, followed by the user's characters.
    for (const character of [...characters].sort((a, b) => Number(b.renderer === 'capri') - Number(a.renderer === 'capri'))) this.appendCard(character);
    const content = document.createElement('div');
    content.className = 'character-picker__content';
    this.content = content;
    const studio = document.createElement('section');
    studio.className = 'character-picker__studio';
    this.previewName = document.createElement('strong');
    this.previewCanvas = document.createElement('canvas');
    this.previewCanvas.setAttribute('aria-label', lang === 'th' ? 'ตัวอย่างตัวละครเคลื่อนไหว' : 'Animated character preview');
    const stage = document.createElement('div');
    stage.className = 'character-picker__stage';
    stage.append(this.previewCanvas);
    const views = document.createElement('div');
    views.className = 'character-picker__views';
    this.viewButtons = new Map();
    for (const [value, th, en] of [['full', 'เต็มตัว', 'Full body'], ['bust', 'ครึ่งตัว', 'Upper body']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = lang === 'th' ? th : en;
      button.dataset.framing = value;
      button.onclick = () => { this.pendingFraming = value; this.previewRenderer?.setFraming?.(value); this.update(); };
      this.viewButtons.set(value, button); views.append(button);
    }
    const sizeLabel = document.createElement('label');
    sizeLabel.textContent = lang === 'th' ? 'ขนาดบนเดสก์ท็อป ' : 'Desktop size ';
    this.sizeValue = document.createElement('output');
    this.sizeInput = document.createElement('input');
    this.sizeInput.type = 'range'; this.sizeInput.min = '0.45'; this.sizeInput.max = '1.6'; this.sizeInput.step = '0.05';
    this.sizeInput.setAttribute('aria-label', lang === 'th' ? 'ขนาดตัวละคร' : 'Character size');
    this.sizeInput.oninput = () => { this.pendingScale = Number(this.sizeInput.value); this.update(); };
    sizeLabel.append(this.sizeValue, this.sizeInput);
    const states = document.createElement('div');
    states.className = 'character-picker__states';
    for (const [value, th, en] of [['idle', 'ทักทาย', 'Idle'], ['thinking', 'คิด', 'Think'], ['attention', 'พูด', 'Talk'], ['success', 'ดีใจ', 'Happy'], ['error', 'กังวล', 'Concern'], ['sleep', 'ง่วง', 'Sleep']]) {
      const button = document.createElement('button');
      button.type = 'button'; button.textContent = lang === 'th' ? th : en; button.dataset.previewState = value;
      button.onclick = () => {
        this.previewState = value;
        for (const b of states.children) b.setAttribute('aria-pressed', String(b === button));
      };
      button.setAttribute('aria-pressed', String(value === 'idle')); states.append(button);
    }
    const hint = document.createElement('small');
    hint.textContent = lang === 'th' ? 'ลองสีหน้าและท่าทางก่อนกดใช้ · ขนาดจริงปรับตามพื้นที่หน้าจอ' : 'Try expressions before applying · Size fits your screen';
    studio.append(this.previewName, stage, views, sizeLabel, states, hint);
    content.append(studio, grid);
    const footer = document.createElement('footer');
    this.footer = footer;
    this.addButton = add;
    this.status = document.createElement('p');
    this.status.setAttribute('role', 'status');
    this.apply = document.createElement('button');
    this.apply.type = 'button';
    this.apply.className = 'character-picker__apply';
    this.apply.onclick = async () => {
      this.apply.disabled = true;
      this.apply.textContent = this.t.loading;
      try {
        await this.onChoose(this.pendingId, { scale: this.pendingScale, characterFraming: this.pendingFraming });
        this.hide();
      } catch {
        this.status.textContent = this.t.failed;
      } finally {
        this.update();
      }
    };
    this.remove = document.createElement('button');
    this.remove.type = 'button';
    this.remove.className = 'character-picker__remove';
    this.remove.textContent = lang === 'th' ? 'ลบตัวละครนี้' : 'Delete character';
    this.remove.onclick = async () => {
      if (this.confirmDelete !== this.pendingId) {
        this.confirmDelete = this.pendingId;
        this.status.textContent = lang === 'th' ? 'กดลบอีกครั้งเพื่อยืนยัน ประวัติแชตยังอยู่' : 'Click delete again to confirm. Chat history is kept.';
        return;
      }
      this.remove.disabled = true;
      try {
        const cfg = await host.removeCharacter(this.pendingId);
        this.pendingId = this.currentId = cfg.characterId;
        this.setCharacters(cfg.characters);
        this.status.textContent = '';
      } catch (error) { this.status.textContent = error.message; }
      finally { this.remove.disabled = false; this.confirmDelete = null; this.update(); }
    };
    footer.append(this.remove, this.status, this.apply);
    this.importer = new CharacterImport({ host, lang,
      onBack: () => this.closeImport(),
      onAdded: async (character) => {
        const cfg = await host.getConfig();
        this.setCharacters(cfg.characters);
        await this.onChoose(character.id);
        this.importer.setBusy(false);
        this.closeImport();
        this.hide();
      },
    });
    box.append(header, content, this.importer.root, footer);
    root.replaceChildren(box);
    for (const event of ['mousedown', 'mouseup', 'click']) root.addEventListener(event, (e) => e.stopPropagation());
    root.addEventListener('click', (e) => { if (e.target === root) this.hide(); });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); if (this.importer.busy) return; this.importer.root.hidden ? this.hide() : this.closeImport(); }
      if (e.key === 'Tab') {
        const buttons = [...root.querySelectorAll('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary')].filter((e) => e.getClientRects().length);
        const first = buttons[0], last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    this.update();
  }

  async preview(character) {
    // Gallery thumbnails never decode all characters' animation pages.
    if(character.thumbnail || character.spriteManifest) return assetURL(character,character.thumbnail || character.portrait);
    const image = new Image();
    image.src = character.custom ? character.atlas : `../../assets/characters/${character.atlas}`;
    await image.decode();
    if (character.renderer === 'capri') return image.src;
    const canvas = document.createElement('canvas');
    canvas.width = character.frameWidth;
    canvas.height = character.frameHeight;
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL();
  }

  get open() { return !this.root.hidden; }

  setDisplay(scale, framing) {
    this.currentScale = scale;
    this.currentFraming = framing || 'full';
    if (!this.open) { this.pendingScale = scale; this.pendingFraming = this.currentFraming; }
    this.update();
  }

  async loadPreview() {
    const request = ++this.previewRequest;
    const character = this.characters.find(c => c.id === this.pendingId);
    this.previewName.textContent = character?.name || '';
    this.previewRenderer?.dispose?.();
    this.previewRenderer = null;
    this.previewCanvas.getContext('2d').clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
    if (!character) return;
    try {
      const image = await loadCharacterSource(character);
      if (request !== this.previewRequest || !this.open) return;
      if (character.renderer === 'capri') {
        // Capri's shader needs the live actor pose. Use its original artwork
        // here instead of creating a second actor just for a gallery preview.
        this.previewCanvas.width = 320; this.previewCanvas.height = 420;
        this.previewCanvas.style.width = '230px'; this.previewCanvas.style.height = '302px';
        this.previewRenderer = { draw: () => {
          const ctx = this.previewCanvas.getContext('2d');
          ctx.clearRect(0, 0, 320, 420);
          const scale = Math.min(320 / image.width, 420 / image.height);
          ctx.drawImage(image, (320 - image.width * scale) / 2, 0, image.width * scale, image.height * scale);
        } };
        return;
      }
      this.previewRenderer = createCharacterRenderer(this.previewCanvas, image, character);
      this.previewRenderer.setFraming?.(this.pendingFraming);
      this.previewRenderer.resize(Math.min(0.72, 300/532, (this.previewCanvas.parentElement.clientWidth || 265)/432));
    } catch { if (request === this.previewRequest) this.status.textContent = this.t.failed; }
  }

  animatePreview() {
    cancelAnimationFrame(this.previewAnimation);
    if (!this.open) return;
    const draw = () => {
      if (!this.open) return;
      if(this.previewRenderer?.resize && this.previewDpr !== window.devicePixelRatio){
        this.previewDpr=window.devicePixelRatio;
        this.previewRenderer.resize(Math.min(0.72,300/532,(this.previewCanvas.parentElement.clientWidth||265)/432));
      }
      const mode = this.previewState === 'thinking' ? 'work' : this.previewState === 'sleep' ? 'sleep' : 'idle';
      this.previewRenderer?.draw({}, { mode, reaction: this.previewState === 'idle' ? '' : this.previewState });
      this.previewAnimation = requestAnimationFrame(draw);
    };
    draw();
  }

  setCharacters(characters) {
    if (characters.map((c) => c.id).join() === this.characters.map((c) => c.id).join()) return;
    this.characters = characters;
    const existing = new Set(characters.map((c) => c.id));
    for (const [id, card] of this.cards) if (!existing.has(id)) { card.remove(); this.cards.delete(id); }
    for (const character of characters) {
      if (this.cards.has(character.id)) continue;
      this.appendCard(character);
    }
    this.update();
  }

  appendCard(character) {
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'character-card'; card.dataset.characterId = character.id;
    const art = document.createElement('div'); art.className = 'character-card__art';
    const image = document.createElement('img'); image.alt = character.name;
    this.preview(character).then((src) => { image.src = src; }).catch(() => { image.src = character.custom ? character.portrait : `../../assets/characters/${character.portrait}`; });
    art.append(image);
    const name = document.createElement('strong'); name.textContent = character.name;
    const description = document.createElement('span'); description.className = 'character-card__description';
    description.textContent = character.custom ? (this.lang === 'th' ? 'เพิ่มเอง · ภาพนิ่ง' : 'Imported · Still image') : character.renderer === 'capri' ? this.t.original : this.lang === 'th' ? character.nameTh.split(' · ').slice(1).join(' · ') || this.t.game : this.t.game;
    const badge = document.createElement('span'); badge.className = 'character-card__badge'; badge.textContent = this.t.active;
    card.append(art, name, description, badge);
    card.onclick = () => { this.confirmDelete = null; this.status.textContent = ''; this.pendingId = character.id; this.update(); this.loadPreview(); };
    this.cards.set(character.id, card); this.grid.append(card);
  }

  showImport() {
    this.content.hidden = this.footer.hidden = this.addButton.hidden = true;
    this.importer.root.hidden = false;
    this.importer.file.focus();
  }
  closeImport() {
    if (this.importer.busy) return;
    this.importer.root.hidden = true;
    this.content.hidden = this.footer.hidden = this.addButton.hidden = false;
    this.addButton.focus();
  }

  update() {
    for (const [id, card] of this.cards) {
      card.setAttribute('aria-pressed', String(id === this.pendingId));
      card.querySelector('.character-card__badge').hidden = id !== this.currentId;
    }
    const legacy = this.characters.find(c => c.id === this.pendingId)?.renderer === 'capri';
    this.viewButtons.get('bust').disabled = legacy;
    for (const [value, button] of this.viewButtons) button.setAttribute('aria-pressed', String(value === (legacy ? 'full' : this.pendingFraming)));
    this.sizeInput.value = this.pendingScale;
    this.sizeValue.textContent = `${Math.round(this.pendingScale * 100)}% · ≈${Math.round(396 * this.pendingScale)} px`;
    this.apply.disabled = this.pendingId === this.currentId && this.pendingScale === this.currentScale && this.pendingFraming === this.currentFraming;
    this.remove.hidden = !this.characters.find((c) => c.id === this.pendingId)?.custom;
    this.apply.textContent = this.apply.disabled ? this.t.current : this.t.select;
  }

  setCurrent(id) {
    if (id !== this.currentId) {
      this.currentId = this.pendingId = id;
      if (this.open) this.loadPreview();
    }
    this.update();
  }

  show() {
    this.confirmDelete = null;
    this.closeImport();
    this.pendingId = this.currentId;
    this.pendingScale = this.currentScale;
    this.pendingFraming = this.currentFraming;
    this.status.textContent = '';
    this.update();
    this.root.hidden = false;
    this.loadPreview();
    this.animatePreview();
    this.onVisibility(true);
    this.cards.get(this.currentId)?.focus();
  }

  hide() {
    if (this.importer.busy) return;
    this.confirmDelete = null;
    this.root.hidden = true;
    ++this.previewRequest;
    cancelAnimationFrame(this.previewAnimation);
    this.previewRenderer?.dispose?.();
    this.previewRenderer = null;
    this.onVisibility(false);
  }
}

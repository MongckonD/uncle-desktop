'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ID = /^custom-[a-f0-9-]{36}$/;
const MAX_BYTES = 10 * 1024 * 1024;

function createUserCharacters(root, nativeImage, catalog) {
  root = path.resolve(root);
  let draft = null;
  const folderFor = (id) => {
    const folder = path.resolve(root, id);
    if (!ID.test(id) || path.dirname(folder) !== root) throw new Error('Invalid character path');
    return folder;
  };
  const imagePath = (id, file) => {
    if (!ID.test(id) || !['atlas.png', 'portrait.png'].includes(file)) throw new Error('Invalid character path');
    return path.join(folderFor(id), file);
  };
  const record = ({ id, name, personality }) => {
    if (!ID.test(id) || typeof name !== 'string' || !name.trim() || name.length > 40 || /[\x00-\x1f\x7f]/.test(name) || typeof personality !== 'string' || personality.length > 500) throw new Error('ชื่อต้องมี 1–40 ตัวอักษร และบุคลิกไม่เกิน 500 ตัวอักษร');
    return { id, name: name.trim(), nameTh: `${name.trim()} · เพิ่มเอง · ภาพนิ่ง`, personality: `You are ${name.trim()}, a fictional AI desktop companion. ${personality.trim() || 'Be friendly, helpful and encouraging.'}`, custom: true, atlas: `/user-characters/${id}/atlas.png`, portrait: `/user-characters/${id}/portrait.png`, columns: 4, rows: 6, frameWidth: 320, frameHeight: 420, fps: 4 };
  };
  function load() {
    fs.mkdirSync(root, { recursive: true });
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !ID.test(entry.name)) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(root, entry.name, 'character.json'), 'utf8'));
        if (meta.id !== entry.name) continue;
        const character = record(meta);
        for (const file of ['atlas.png', 'portrait.png']) {
          const target = imagePath(meta.id, file);
          if (fs.lstatSync(target).isSymbolicLink() || fs.statSync(target).size > MAX_BYTES) throw new Error('Invalid asset');
          const size = nativeImage.createFromPath(target).getSize();
          // an atlas may have a 7th row: her sitting frames (character-renderer.js)
          const heights = file === 'atlas.png' ? [2520, 2940] : [420];
          if (size.width !== (file === 'atlas.png' ? 1280 : 320) || !heights.includes(size.height)) throw new Error('Invalid asset size');
          if (file === 'atlas.png') character.rows = size.height / 420;
        }
        if (!catalog.some((c) => c.id === character.id)) catalog.push(character);
      } catch (error) { console.warn('[characters] skipped invalid custom character', entry.name, error.message); }
    }
  }
  function preview(bytes) {
    draft = null;
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_BYTES) throw new Error('ใช้ไฟล์ PNG ขนาดไม่เกิน 10 MB');
    const buffer = Buffer.from(bytes);
    const png = buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!png) throw new Error('รองรับเฉพาะภาพ PNG กรุณาบันทึกภาพเป็น PNG ก่อน');
    if (png && (buffer.length < 24 || buffer.readUInt32BE(16) > 4096 || buffer.readUInt32BE(20) > 4096 || buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 12000000)) throw new Error('ภาพใหญ่เกินไป');
    const source = nativeImage.createFromBuffer(buffer);
    const size = source.getSize();
    if (source.isEmpty() || size.width > 4096 || size.height > 4096 || size.width * size.height > 12000000) throw new Error('ภาพต้องไม่เกิน 4096 พิกเซลต่อด้าน และ 12 ล้านพิกเซล');
    const factor = Math.min(300 / size.width, 400 / size.height, 1);
    const image = source.resize({ width: Math.max(1, Math.round(size.width * factor)), height: Math.max(1, Math.round(size.height * factor)), quality: 'best' });
    const { width, height } = image.getSize();
    const bitmap = image.toBitmap();
    let transparent = false, visible = false;
    for (let i = 3; i < bitmap.length; i += 4) { transparent ||= bitmap[i] < 16; visible ||= bitmap[i] > 80; }
    if (!visible) throw new Error('ภาพนี้ว่างเปล่า กรุณาเลือกภาพที่เห็นตัวละคร');
    const frame = Buffer.alloc(320 * 420 * 4);
    for (let y = 0; y < height; y++) bitmap.copy(frame, ((418 - height + y) * 320 + Math.floor((320 - width) / 2)) * 4, y * width * 4, (y + 1) * width * 4);
    const normalized = nativeImage.createFromBitmap(frame, { width: 320, height: 420 });
    draft = { token: randomUUID(), frame, png: normalized.toPNG() };
    return { token: draft.token, preview: normalized.toDataURL(), transparent, width: size.width, height: size.height };
  }
  function add({ token, name, personality = '' } = {}) {
    if (!draft || draft.token !== token) throw new Error('กรุณาเลือกภาพอีกครั้ง');
    const meta = { id: `custom-${randomUUID()}`, name, personality };
    const character = record(meta);
    const atlas = Buffer.alloc(1280 * 2520 * 4);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 4; col++) for (let y = 0; y < 420; y++) {
      draft.frame.copy(atlas, (((row * 420 + y) * 1280) + col * 320) * 4, y * 320 * 4, (y + 1) * 320 * 4);
    }
    const folder = folderFor(meta.id);
    fs.mkdirSync(folder);
    try {
      fs.writeFileSync(imagePath(meta.id, 'atlas.png'), nativeImage.createFromBitmap(atlas, { width: 1280, height: 2520 }).toPNG());
      fs.writeFileSync(imagePath(meta.id, 'portrait.png'), draft.png);
      // Metadata is the commit marker; incomplete imports are ignored on restart.
      fs.writeFileSync(path.join(folder, 'character.json'), JSON.stringify(meta, null, 2), { flag: 'wx' });
    } catch (error) { fs.rmSync(folder, { recursive: true, force: true }); throw error; }
    catalog.push(character);
    draft = null;
    return character;
  }
  function remove(id) {
    const index = catalog.findIndex((c) => c.id === id && c.custom);
    if (!ID.test(id) || index < 0) throw new Error('ลบได้เฉพาะตัวละครที่เพิ่มเอง');
    fs.rmSync(folderFor(id), { recursive: true });
    catalog.splice(index, 1);
  }
  return { load, preview, add, remove, imagePath, root };
}
module.exports = { createUserCharacters };

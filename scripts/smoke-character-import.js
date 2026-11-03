'use strict';
const { authHeaders } = require('../hooks/bridge-token');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const statePath = path.join(__dirname, '../captures/import-smoke-state.json');
const base = `http://127.0.0.1:${process.env.CAPRI_PORT || 47823}`;
async function post(route, body) {
  const res = await fetch(`${base}/debug/${route}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const result = await res.json();
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
}
const inspect = (js) => post('eval', { js });
async function until(js) {
  for (let i = 0; i < 80; i++) {
    if (await inspect(js)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out: ${js}`);
}
async function click(selector) {
  await inspect(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',behavior:'instant'});true`);
  const point = await inspect(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  await post('mouse', { ...point, click: true });
}
(async () => {
  await until('Boolean(window.dev?.picker)');
  if (process.argv[2] === 'verify') {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(await inspect('window.dev.capri.character.id'), state.id);
    assert.equal(await inspect('window.dev.capri.character.name'), 'แมวทดสอบนำเข้า');
    assert.match(await inspect('window.dev.brain.character.personality'), /ให้กำลังใจ/);
    await post('command', { name: 'characters' });
    await until('window.dev.picker.open');
    await click(`[data-character-id="${state.id}"]`);
    await click('.character-picker__remove');
    assert.equal(await inspect('window.dev.picker.cards.size'), state.count + 1, 'First delete click only asks for confirmation');
    await click('.character-picker__remove');
    await until(`window.dev.picker.cards.size===${state.count}`);
    await until('window.dev.capri.character.id === "angry-boy"');
    assert.equal(await inspect('window.host.getConfig().then(c=>c.characters.some(x=>x.id===' + JSON.stringify(state.id) + '))'), false);
    await inspect(`window.host.setConfig({characterId:${JSON.stringify(state.original)}})`);
    await until(`window.dev.capri.character.id===${JSON.stringify(state.original)}`);
    await inspect('window.dev.picker.hide(); true');
    fs.unlinkSync(statePath);
    console.log('PASS restart persistence, selected image and persona, two-click deletion, built-in fallback, cleanup');
    return;
  }
  assert.equal(fs.existsSync(statePath), false, 'Finish or clean up the previous import smoke test first');
  const original = await inspect('window.dev.capri.character.id');
  const count = await inspect('window.dev.picker.cards.size');
  await post('command', { name: 'characters' });
  await until('window.dev.picker.open');
  await click('.character-picker__add');
  assert.equal(await inspect('window.dev.picker.importer.root.hidden'), false);
  assert.equal(await inspect('window.dev.picker.importer.submit.disabled'), true);
  await inspect('window.dev.picker.importer.description.value="แมวสีครีม เสื้อฟ้า";window.dev.picker.importer.description.dispatchEvent(new Event("input"));true');
  assert.match(await inspect('window.dev.picker.importer.prompt.value'), /แมวสีครีม เสื้อฟ้า/);
  await inspect('window.dev.picker.importer.root.querySelector("details").open=true;true');
  await inspect('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
  await post('capture', { name: 'character-import-help' });
  // A File passes through the same change-handler path as the native file chooser, without manipulating the OS dialog.
  await inspect('(async()=>{const blob=await fetch("../../assets/characters/example.png").then(r=>r.blob());await window.dev.picker.importer.readFile(new File([blob],"แมวทดสอบ.png",{type:"image/png"}));return true})()');
  assert.ok(await inspect('Boolean(window.dev.picker.importer.draft && !window.dev.picker.importer.image.hidden)'));
  await inspect('window.dev.picker.importer.name.value="แมวทดสอบนำเข้า";window.dev.picker.importer.personality.value="พูดไทย ใจดี ชอบให้กำลังใจ";window.dev.picker.importer.name.dispatchEvent(new Event("input"));true');
  assert.equal(await inspect('window.dev.picker.importer.submit.disabled'), false);
  await inspect('window.dev.picker.importer.root.querySelector("details").open=false;true');
  await post('capture', { name: 'character-import-preview' });
  await click('.character-import [type=submit]');
  await until('window.dev.capri.character.custom && !window.dev.picker.open');
  const id = await inspect('window.dev.capri.character.id');
  fs.writeFileSync(statePath, JSON.stringify({ original, count, id }));
  assert.equal(await inspect('window.dev.picker.cards.size'), count + 1);
  assert.equal(await inspect('document.querySelector(".panel__who").textContent'), 'แมวทดสอบนำเข้า');
  assert.ok(await inspect('window.dev.capri.sprite.image.naturalWidth===1280 && window.dev.capri.sprite.image.naturalHeight===2520'));
  await post('command', { name: 'characters' });
  await until('[...document.querySelectorAll(".character-card img")].every(img=>img.complete&&img.naturalWidth>0)');
  await post('capture', { name: 'character-import-added' });
  console.log('PASS import UI, generated prompt, real PNG preview, add/use, custom assets and gallery; restart app then run verify');
})().catch((error) => { console.error(error); process.exitCode = 1; });

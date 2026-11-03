'use strict';
const { authHeaders } = require('../hooks/bridge-token');
// Local app bridge only; no external accounts or live voice calls.
const assert = require('node:assert/strict');
const BASE = `http://127.0.0.1:${process.env.CAPRI_PORT || 47823}`;
const pause = ms => new Promise(r => setTimeout(r, ms));
async function post(route, body) {
  const response = await fetch(`${BASE}/${route}`, {method:'POST', headers: authHeaders(), body:JSON.stringify(body)});
  const result = await response.json();
  assert.ok(result.ok, JSON.stringify(result)); return result;
}
async function inspect(js) { return (await post('debug/eval', {js})).value; }
async function until(js) {
  for (let n = 0; n < 60; n++) { if (await inspect(js)) return; await pause(100); }
  throw new Error(`Timeout: ${js}`);
}
(async () => {
  const original = await inspect('window.host.getConfig().then(c=>({characterId:c.characterId,scale:c.scale,characterFraming:c.characterFraming,motion:c.motion}))');
  try {
    await inspect('window.dev.picker.hide(); window.host.setConfig({motion:"full"}).then(()=>true)');
    await inspect('window.dev.picker.show(); document.querySelector("[data-character-id=mochi]").click(); true');
    await until('window.dev.picker.previewRenderer?.character?.id === "mochi"');
    await inspect('document.querySelector("[data-framing=bust]").click(); const s=window.dev.picker.sizeInput; s.value="1.6"; s.dispatchEvent(new Event("input")); true');
    assert.equal(await inspect('window.dev.picker.previewRenderer.framing'), 'bust');
    assert.equal(await inspect('window.host.getConfig().then(c=>c.scale)'), original.scale, 'preview must not alter saved size');
    await inspect('window.dev.picker.hide(); window.dev.picker.show(); true');
    assert.equal(await inspect('window.dev.picker.pendingScale'), original.scale, 'cancel resets pending size');
    await inspect('document.querySelector("[data-character-id=mochi]").click(); document.querySelector("[data-framing=bust]").click(); const s=window.dev.picker.sizeInput; s.value="1.6"; s.dispatchEvent(new Event("input")); window.dev.picker.apply.click(); true');
    await until('!window.dev.picker.open && window.dev.capri.character.id === "mochi" && window.dev.capri.framing === "bust"');
    assert.equal(await inspect('window.host.getConfig().then(c=>c.scale)'), 1.6);
    console.log('PASS preview/cancel/apply: upper-body view and 160% size persist');
    for (const id of ['mochi', 'lili', 'luna', 'pudding']) {
      await inspect(`window.host.setConfig({characterId:${JSON.stringify(id)}}).then(()=>true)`);
      await until(`window.dev.capri.character.id === ${JSON.stringify(id)}`);
      assert.equal(await inspect('window.dev.capri.sprite.character.expressive'), true);
      for (const view of ['full', 'bust']) {
        await inspect(`window.host.setConfig({characterFraming:${JSON.stringify(view)}}).then(()=>true)`);
        assert.equal(await inspect('window.dev.capri.sprite.framing'), view);
        // Compare the actual canvas pixels, not just frame indexes, for all states.
        const distinct = await inspect(`(()=>{const s=window.dev.capri.sprite;return Array.from({length:6},(_,r)=>{const frames=[];for(let c=0;c<4;c++){s.selectFrame(r*4+c);frames.push(s.frameCanvas.toDataURL());}return new Set(frames).size;})})()`);
        assert.deepEqual(distinct, [4,4,4,4,4,4], `${id}/${view}: duplicated animation drawings`);
        assert.equal(await inspect('window.dev.capri.hit(5,5)'), false);
      }
      await inspect('window.dev.picker.show(); true');
      await until(`window.dev.picker.previewRenderer?.character?.id === ${JSON.stringify(id)}`);
      await inspect('document.querySelector("[data-preview-state=success]").click(); true');
      await post('debug/capture', {name:`studio-${id}-bust`});
      await inspect('window.dev.picker.hide(); true');
      console.log(`PASS ${id}: 24 distinct drawings in full/upper-body views, gallery preview loads`);
    }
    // Drawing masks must follow the zoom, and requested size fits smaller screens.
    assert.ok(await inspect('(()=>{const c=window.dev.capri;const old={view:{...c.view},pos:{...c.pos},scale:c.scale};try{c.setView(640,480,480);c.setScale(1.6);return c.scale*420<=456&&c.pos.x>=160*c.scale&&c.pos.x<=640-160*c.scale;}finally{c.setView(old.view.w,old.view.h,old.view.floor);c.pos=old.pos;c.setScale(old.scale);}})()'));
    assert.ok(await inspect('window.host.setConfig({scale:99}).then(()=>false,()=>true)'));
    assert.ok(await inspect('window.host.setConfig({characterFraming:"invalid"}).then(()=>false,()=>true)'));
    console.log('PASS screen-size bounds and invalid display settings rejected');
  } finally {
    await inspect('window.dev.picker.hide(); true');
    await inspect(`window.host.setConfig(${JSON.stringify(original)}).then(()=>true)`);
    await until(`window.dev.capri.character.id === ${JSON.stringify(original.characterId)}`);
  }
})().catch(error => {console.error(error); process.exitCode=1;});

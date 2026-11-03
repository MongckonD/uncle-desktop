'use strict';
const { authHeaders } = require('../hooks/bridge-token');
// Runs against this app's own --dev bridge; no global mouse/keyboard input or real agent hooks.
const assert = require('node:assert/strict');
const BASE = `http://127.0.0.1:${process.env.CAPRI_PORT || 47823}`;
const characters = require('../assets/characters/catalog.json');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function post(route, body) {
  const response = await fetch(`${BASE}/${route}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  const result = await response.json();
  assert.ok(result.ok, JSON.stringify(result));
  return result;
}
async function inspect(js) { return (await post('debug/eval', { js })).value; }
async function until(js) {
  for (let i = 0; i < 50; i++) {
    if (await inspect(js)) return;
    await pause(100);
  }
  throw new Error(`Timed out: ${js}`);
}
const label = (id) => require('../assets/characters/catalog.json').find((character) => character.id === id).nameTh;
async function click(selector) {
  await inspect(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',behavior:'instant'}); true`);
  const at = await inspect(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  await post('debug/mouse', { ...at, click: true });
}

(async () => {
  const original = await inspect('window.dev.capri.character.id');
  const event = (hook_event_name, extra = {}) => post('event', { hook_event_name, session_id: 'codex:character-smoke', demo: true, cwd: 'character-smoke', ...extra });
  try {
    await until('!window.dev.capri.busy');
    await inspect('window.dev.capri.endAct(false); window.dev.capri.setStance("stand"); window.dev.capri.pos=window.dev.capri.spot("post"); window.dev.capri.place(); true');
    await post('debug/command', { name: 'characters' });
    await until('window.dev.picker.open && [...document.querySelectorAll(".character-card img")].every(img=>img.complete&&img.naturalWidth>0)');
    assert.equal(await inspect('document.querySelectorAll(".character-card").length'), characters.length);
    assert.ok(await inspect('[...document.querySelectorAll(".character-card__art")].every(e=>e.firstChild.getBoundingClientRect().height<=e.getBoundingClientRect().height+1)'));
    const preview = characters.filter((c) => c.id !== original && c.renderer !== 'capri').at(-1).id;
    await click(`[data-character-id="${preview}"]`);
    assert.equal(await inspect('window.dev.capri.character.id'), original);
    await click('.character-picker footer .character-picker__apply');
    await until(`window.dev.capri.character.id === ${JSON.stringify(preview)} && !window.dev.picker.open`);
    await post('debug/command', { name: 'characters' });
    await until('window.dev.picker.open');
    await inspect('document.getElementById("character-picker").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); true');
    assert.equal(await inspect('window.dev.picker.open'), false);
    await post('debug/menu', { click: label(original) });
    await until(`window.dev.capri.character.id === ${JSON.stringify(original)}`);
    console.log(`PASS gallery: ${characters.length} complete previews, preview before apply, selection and Escape close`);
    await inspect('window.__characterSmoke = { capri: window.dev.capri, pos: {...window.dev.capri.pos}, nextMove: window.dev.capri.nextMove, nextGaze: window.dev.capri.nextGaze }; window.dev.capri.nextMove = window.dev.capri.nextGaze = Number.MAX_SAFE_INTEGER; true');
    await event('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'character-smoke.txt' } });
    await until('window.dev.capri.sprite.state === "thinking"');
    await inspect('window.__characterSmoke.session = window.dev.brain.sessions.get("codex:character-smoke"); true');
    for (const { id } of characters) {
      await post('debug/menu', { click: label(id) });
      await until(`window.dev.capri.character.id === ${JSON.stringify(id)}`);
      assert.ok(await inspect('window.dev.capri === window.__characterSmoke.capri && window.dev.brain.sessions.get("codex:character-smoke") === window.__characterSmoke.session && window.dev.capri.mode === "work"'));
      assert.equal(await inspect('window.host.getConfig().then(config=>config.characterId)'), id);
      assert.equal(await inspect('document.querySelector(".panel__who").textContent'), require('../assets/characters/catalog.json').find((c) => c.id === id).name);
      const delta = await inspect('Math.hypot(window.dev.capri.pos.x - window.__characterSmoke.pos.x, window.dev.capri.pos.y - window.__characterSmoke.pos.y)');
      assert.ok(delta < 1, `Switch moved character by ${delta}`);
      console.log(`PASS switch ${id}: same instance, session, position, work state, saved preference`);
    }
    // Confirm a body pixel is draggable while transparent pixels stay click-through.
    const hit = await inspect('(()=>{const c=window.dev.capri,r=c.canvas.getBoundingClientRect();for(let y=r.top;y<Math.min(r.bottom,innerHeight);y+=4)for(let x=r.left;x<r.right;x+=4)if(c.hit(x,y))return {x:Math.round(x),y:Math.round(y)};return null})()');
    assert.ok(hit);
    assert.equal(await inspect('window.dev.capri.hit(5,5)'), false);
    const before = await inspect('({...window.dev.capri.pos})');
    await post('debug/drag', { points: [hit, { x: hit.x - 100, y: hit.y - 60, ms: 250 }, { x: hit.x - 100, y: hit.y - 60, ms: 250 }] });
    const after = await inspect('({...window.dev.capri.pos})');
    assert.ok(Math.hypot(after.x - before.x, after.y - before.y) > 50);
    console.log('PASS alpha hit testing and dragging');
    await event('SessionEnd');
    await inspect('window.dev.capri.endAct(false); window.dev.capri.setStance("stand"); window.dev.capri.flight = window.dev.capri.skid = window.dev.capri.squash = null; window.dev.capri.reactionUntil = 0; window.dev.capri.busy = false; window.dev.capri.pos={x:innerWidth-260,y:window.dev.capri.floor-4}; true');
    for (const { id } of characters) {
      await post('debug/menu', { click: label(id) });
      await until(`window.dev.capri.character.id === ${JSON.stringify(id)}`);
      for (const [state, mode, reaction] of [['idle', 'idle', ''], ['thinking', 'work', ''], ['attention', 'alert', ''], ['success', 'idle', 'success'], ['error', 'idle', 'error'], ['sleep', 'sleep', '']]) {
        await inspect(`window.dev.capri.endAct(false); window.dev.capri.setMode(${JSON.stringify(mode)}); window.dev.capri.reaction=${JSON.stringify(reaction)}; window.dev.capri.reactionUntil=${reaction ? 'performance.now()+1000' : '0'}; window.dev.capri.drawFrame(); true`);
        assert.equal(await inspect('window.dev.capri.sprite.state'), state);
        assert.equal(await inspect('window.dev.capri.stance'), 'stand');
        await post('debug/capture', { name: `${id}-${state}` });
      }
      console.log(`PASS ${id}: all six animation states rendered`);
    }
    assert.ok(await inspect('window.host.setConfig({characterId:"../../missing"}).then(()=>false,()=>true)'));
    console.log('PASS rejects unknown character IDs');
  } finally {
    await event('SessionEnd');
    await post('debug/menu', { click: label(original) });
    await until(`window.dev.capri.character.id === ${JSON.stringify(original)}`);
    await inspect('if(window.__characterSmoke){window.dev.capri.reactionUntil=0; window.dev.capri.endAct(false); window.dev.capri.setStance("stand"); window.dev.capri.flight=window.dev.capri.skid=window.dev.capri.squash=null; window.dev.capri.setMode(window.dev.brain.busySessions.length ? "work" : "idle"); window.dev.capri.pos=window.__characterSmoke.pos; window.dev.capri.nextMove=window.__characterSmoke.nextMove; window.dev.capri.nextGaze=window.__characterSmoke.nextGaze; window.dev.capri.place(); window.dev.panel.hide(); delete window.__characterSmoke;} true');
  }
})().catch((err) => { console.error(err); process.exitCode = 1; });

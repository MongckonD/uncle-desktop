'use strict';
const { authHeaders } = require('../hooks/bridge-token');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:47823';
const delay = ms => new Promise(r => setTimeout(r, ms));
async function post(route, body) {
  const result=await (await fetch(`${base}/${route}`,{method:'POST',headers: authHeaders(),body:JSON.stringify(body)})).json();
  assert.ok(result.ok,JSON.stringify(result));return result.value;
}
const inspect=js=>post('debug/eval',{js});
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await delay(100);}throw new Error('Timed out waiting for renderer');}
(async()=>{
  const previous=await inspect('window.host.getConfig().then(c=>({characterId:c.characterId,characterFraming:c.characterFraming,scale:c.scale,motion:c.motion}))');
  try{
    for(const id of ['mochi','lili','luna','pudding','tama']){
      for(const framing of ['full','bust']){
        await inspect(`window.host.setConfig({characterId:${JSON.stringify(id)},characterFraming:${JSON.stringify(framing)},scale:1.2,motion:'full'}).then(()=>true)`);
        await until(async()=>await inspect(`window.dev.capri.character.id===${JSON.stringify(id)} && window.dev.capri.sprite.compositeView===${JSON.stringify(framing)} && window.dev.capri.sprite.compositeReady`));
        const data=await inspect('(()=>{const s=window.dev.capri.sprite;return {native:s.activeResolution,bytes:s.composite.width*s.composite.height*4,mask:s.pixels.some((v,i)=>i%4===3&&v>40),fallback:!s.source}})()');
        const { fullHD }=require('../assets/characters/catalog.json').find(c=>c.id===id);
        assert.deepEqual(data.native,framing==='bust'||fullHD?[640,840]:[320,420]);
        assert.ok(data.mask && !data.fallback);
        assert.ok(data.bytes<=640*840*4);
      }
      const states={idle:['idle',''],thinking:['work',''],attention:['alert',''],success:['idle','success'],error:['idle','error'],sleep:['sleep','']};
      for(const [state,[mode,reaction]] of Object.entries(states)){
        await inspect(`(()=>{const c=window.dev.capri;c.endAct(false);c.setMode(${JSON.stringify(mode)});c.reaction=${JSON.stringify(reaction)};c.reactionUntil=performance.now()+3000;c.drawFrame();return true})()`);
        await until(async()=>await inspect(`window.dev.capri.sprite.state===${JSON.stringify(state)} && !window.dev.capri.sprite.pendingComposite`));
        assert.ok(await inspect('window.dev.capri.sprite.pixels.some((v,i)=>i%4===3&&v>40)'));
      }
      console.log(`PASS ${id}: native full and bust atlas, 6 states, alpha and compositing`);
    }
    await inspect('window.dev.picker.show(); true');
    await until(async()=>await inspect('window.dev.picker.open && !!window.dev.picker.previewRenderer'));
    assert.ok(await inspect('window.dev.picker.previewRenderer.character.id === window.dev.picker.pendingId'));
    console.log('PASS character gallery loads a paged preview');
  }finally{
    await inspect('window.dev.picker.hide(); true');
    await inspect(`window.host.setConfig(${JSON.stringify(previous)}).then(()=>true)`);
    await until(async()=>await inspect(`window.dev.capri.character.id===${JSON.stringify(previous.characterId)}`));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

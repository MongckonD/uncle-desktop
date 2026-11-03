'use strict';
const { authHeaders } = require('../hooks/bridge-token');
// Exercises this application's own canvas using synthetic audio; no microphone.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const characters=require('../assets/characters/catalog.json').filter(c=>c.conversationPoses && (!process.argv[2] || c.id===process.argv[2]));
const out=path.join(__dirname,'../../character-sources/motion-0.20/live-qa');
fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function inspect(js){
  const response=await fetch('http://127.0.0.1:47823/debug/eval',{method:'POST',headers: authHeaders(),body:JSON.stringify({js})});
  const result=await response.json();assert.ok(result.ok,JSON.stringify(result));return result.value;
}
async function until(js){for(let i=0;i<150;i++){if(await inspect(js))return;await pause(100);}throw Error('Renderer did not become ready');}
(async()=>{
  const previous=await inspect('window.host.getConfig().then(c=>({characterId:c.characterId,characterFraming:c.characterFraming,scale:c.scale,motion:c.motion}))');
  const results=[];
  try{
    await inspect('window.__motionQA={lastDraw:window.dev.capri.lastDraw}; true');
    for(const character of characters){
      await inspect(`window.host.setConfig({characterId:${JSON.stringify(character.id)},characterFraming:'full',scale:1.2,motion:'full'}).then(()=>true)`);
      await until(`window.dev.capri.character.id===${JSON.stringify(character.id)} && !!window.dev.capri.sprite.source && window.dev.capri.sprite.compositeReady`);
      const result=await inspect(`(async()=>{
        const c=window.dev.capri;
        const {createCharacterRenderer}=await import('./js/character-renderer.js');
        const canvas=document.createElement('canvas');
        const s=createCharacterRenderer(canvas,c.sprite.source,c.character);
        s.resize(1.2);s.setFraming('full');await s.ready();
        window.__motionQARenderer=s;
        const indices=[];const start=performance.now();
        while(performance.now()-start<2600){
          s.draw({alpha:1},{mode:'idle',talk:.7});
          await new Promise(requestAnimationFrame);
          if(s.compositeKey)indices.push(JSON.parse(s.compositeKey)[3][0]);
        }
        const voiceEnd=performance.now();
        while(performance.now()-voiceEnd<180){s.draw({alpha:1},{mode:'idle',talk:0});await new Promise(requestAnimationFrame);}
        const closed=JSON.parse(s.compositeKey)[3][0];
        while(performance.now()-voiceEnd<550){s.draw({alpha:1},{mode:'idle',talk:0});await new Promise(requestAnimationFrame);}
        const states={};
        for(const [state,mode,reaction] of [['idle','idle',''],['thinking','work',''],['attention','alert',''],['success','idle','success'],['error','idle','error'],['sleep','sleep','']]){
          const expected=s.source.manifest.variants[0].layers[0].tracks[state];
          for(let i=0;i<100;i++){
            s.draw({alpha:1},{mode,reaction,talk:0});await new Promise(requestAnimationFrame);
            if(!s.pendingComposite && expected.includes(JSON.parse(s.compositeKey)[3][0]))break;
          }
          states[state]=s.state===state && expected.includes(JSON.parse(s.compositeKey)[3][0]) && s.pixels.some((v,i)=>i%4===3&&v>40);
        }
        const settle=performance.now();while(performance.now()-settle<450){s.draw({alpha:1},{mode:'idle',talk:0});await new Promise(requestAnimationFrame);}
        const picture=canvas.toDataURL('image/png');
        return {indices:[...new Set(indices)],closed,states,resolution:s.activeResolution,picture};
      })()`);
      const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/characters',character.spriteManifest)));
      const tracks=manifest.variants[0].layers[0].tracks;
      const opens=['talkSoft','talkRound','talkEmphasis'].map(k=>tracks[k][0]);
      assert.ok(result.indices.filter(i=>opens.includes(i)).length>=2,`${character.id}: speech needs varied authored poses ${JSON.stringify(result.indices)}`);
      assert.equal(result.closed,tracks.talkRest[0],`${character.id}: mouth did not close on silence`);
      assert.ok(Object.values(result.states).every(Boolean),`${character.id}: missing state`);
      fs.writeFileSync(path.join(out,`${character.id}-full.png`),Buffer.from(result.picture.split(',')[1],'base64'));delete result.picture;
      await inspect(`(()=>{const s=window.__motionQARenderer;s.setFraming('bust');s.draw({alpha:1},{mode:'idle',talk:.7});return true})()`);
      await until('!window.__motionQARenderer.pendingComposite && window.__motionQARenderer.pixels.some((v,i)=>i%4===3&&v>40)');
      const bust=await inspect(`(async()=>{const s=window.__motionQARenderer,start=performance.now();while(performance.now()-start<450){s.draw({alpha:1},{mode:'idle',talk:.7});await new Promise(requestAnimationFrame);}return s.canvas.toDataURL('image/png')})()`);
      fs.writeFileSync(path.join(out,`${character.id}-bust.png`),Buffer.from(bust.split(',')[1],'base64'));
      results.push({id:character.id,...result});console.log(`PASS ${character.id}: varied speech, silent mouth, six states, full and bust`);
      fs.writeFileSync(path.join(out,`${character.id}-results.json`),JSON.stringify(results.at(-1),null,2)+'\n');
      await inspect('window.__motionQARenderer.dispose();delete window.__motionQARenderer; true');
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
  }finally{
    await inspect('window.__motionQARenderer?.dispose();delete window.__motionQARenderer;window.dev.capri.lastDraw=0; delete window.__motionQA; true');
    await inspect(`window.host.setConfig(${JSON.stringify(previous)}).then(()=>true)`);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});

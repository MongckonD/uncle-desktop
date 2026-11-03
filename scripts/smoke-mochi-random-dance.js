'use strict';
const { authHeaders } = require('../hooks/bridge-token');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.join(__dirname,'../../character-sources/mochi-0.23.1');fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function post(route,data){const r=await fetch('http://127.0.0.1:47823/debug/'+route,{method:'POST',headers: authHeaders(),body:JSON.stringify(data)});const v=await r.json();assert.ok(v.ok,JSON.stringify(v));return v.value;}
const inspect=js=>post('eval',{js});
(async()=>{
 let ready=false;for(let i=0;i<80;i++){if(await inspect('!!window.dev?.capri').catch(()=>false)){ready=true;break;}await pause(250);}assert.ok(ready,'App did not finish starting');
 const previous=await inspect('window.host.getConfig().then(c=>({characterId:c.characterId,characterFraming:c.characterFraming,motion:c.motion}))');
 const media=await inspect("({music:!!window.dev.capri.musicDance,manual:!!window.dev.capri.manualDance,hidden:document.getElementById('mini-player')?.hidden??true,title:document.getElementById('mini-player')?.title||'',text:document.querySelector('#mini-player .mp-text')?.textContent||'',playing:!!document.getElementById('mini-player')?.classList.contains('is-playing')})");
 try{
  await inspect("window.host.setConfig({characterId:'mochi',motion:'full'}).then(()=>true)");
  for(let i=0;i<150;i++){if(await inspect("window.dev.capri.character.id==='mochi' && !!window.dev.capri.sprite.source"))break;await pause(100);}
  await post('command',{name:'now-playing',title:'Synthetic music status test',status:'Playing'});await pause(100);
  assert.equal(await inspect('window.dev.capri.musicDance'),true);
  await post('command',{name:'now-playing',title:'Synthetic music status test',status:'Paused'});await pause(100);
  assert.equal(await inspect('window.dev.capri.musicDance'),false);
  await post('command',{name:'computer-companion',action:'dance'});await pause(100);
  assert.equal(await inspect('window.dev.capri.manualDance'),true);
  await post('command',{name:'computer-companion',action:'stop_dance'});await pause(100);
  assert.equal(await inspect('!!(window.dev.capri.manualDance||window.dev.capri.musicDance)'),false);
  const results=[];
  for(const view of ['full','bust']){
   const r=await inspect(`(async()=>{
    const {createCharacterRenderer}=await import('./js/character-renderer.js');
    const c=window.dev.capri,canvas=document.createElement('canvas'),s=createCharacterRenderer(canvas,c.sprite.source,c.character);s.resize(1.2);s.setFraming(${JSON.stringify(view)});await s.ready();
    const video=document.createElement('canvas');video.width=640;video.height=840;const ctx=video.getContext('2d'),stream=video.captureStream(30),chunks=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
    const idle=new Set(),speech=new Set(),paths=new Set(),timings=[],positions=[];let counter=0;
    for(const [label,duration,context] of [['RANDOM IDLE',16000,{mode:'idle'}],['DANCE',6000,{mode:'idle',dance:true}],['SPEECH',3000,{mode:'idle',talk:.7}],['PAUSE',650,{mode:'idle'}]]){
     const start=performance.now();while(performance.now()-start<duration){
      const before=performance.now();s.draw({alpha:1},context);timings.push(performance.now()-before);
      if(!s.pendingComposite){if(label==='RANDOM IDLE'){idle.add(s.compositeFrame);if(s.motion.lastAmbientPath>=0)paths.add(s.motion.lastAmbientPath);}if(label==='SPEECH')speech.add(s.compositeFrame);}
      if(label==='DANCE' && counter++%20===0){const a=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let top=canvas.height,left=canvas.width;for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(a[(y*canvas.width+x)*4+3]>80){top=Math.min(top,y);left=Math.min(left,x);}positions.push({top,left});}
      ctx.fillStyle='#30343b';ctx.fillRect(0,0,640,840);ctx.drawImage(canvas,(640-canvas.width)/2,840-canvas.height);ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText(${JSON.stringify(view)}+' / '+label,24,35);
      await new Promise(requestAnimationFrame);
     }
    }
    const closed=s.compositeFrame;
    await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
    const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
    timings.sort((a,b)=>a-b);s.dispose();return {idle:[...idle],speech:[...speech],paths:[...paths],positions,closed,p95:timings[Math.floor(timings.length*.95)],video:btoa(binary)};
   })()`);
   fs.writeFileSync(path.join(out,`${view}.webm`),Buffer.from(r.video,'base64'));delete r.video;
   assert.ok(r.idle.length>=3 && r.paths.length>=2,'Idle must vary authored paths');
   assert.ok(r.speech.filter(f=>f>=24).length>=3,'Speech must vary');
   assert.ok(Math.max(...r.positions.map(p=>p.top))-Math.min(...r.positions.map(p=>p.top))>3,'Dance must visibly move the rendered body');
   assert.ok(r.p95<40);results.push({view,...r});console.log(`PASS ${view}: random idle, continuous dance, speech and silence; p95 ${r.p95.toFixed(1)}ms`);
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2)+'\n');
 }finally{
  await inspect(`(()=>{const c=window.dev.capri;c.musicDance=${media.music};c.manualDance=${media.manual};clearInterval(window.__uncleDance);clearInterval(window.__uncleMusicDance);const p=document.getElementById('mini-player');if(p){p.hidden=${media.hidden};p.title=${JSON.stringify(media.title)};p.classList.toggle('is-playing',${media.playing});p.querySelector('.mp-text').textContent=${JSON.stringify(media.text)};}return true})()`);
  await inspect(`window.host.setConfig(${JSON.stringify(previous)}).then(()=>true)`);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

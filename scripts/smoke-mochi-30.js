'use strict';
// Live ordered-track QA and review movies from the real renderer, synthetic audio.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=path.join(__dirname,'../../character-sources/mochi-30');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function inspect(js){
  const r=await fetch('http://127.0.0.1:47823/debug/eval',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({js})});
  const result=await r.json();assert.ok(result.ok,JSON.stringify(result));return result.value;
}
(async()=>{
  const previous=await inspect('window.host.getConfig().then(c=>({characterId:c.characterId,characterFraming:c.characterFraming}))');
  const results=[];
  try{
    await inspect("window.host.setConfig({characterId:'mochi'}).then(()=>true)");
    let ready=false;
    for(let i=0;i<150;i++){
      if(await inspect("window.dev.capri.character.id==='mochi' && !!window.dev.capri.sprite.source")){ready=true;break;}
      await pause(100);
    }
    assert.ok(ready);
    for(const framing of ['full','bust']){
      const result=await inspect(`(async()=>{
        const {createCharacterRenderer}=await import('./js/character-renderer.js');
        const c=window.dev.capri,canvas=document.createElement('canvas');
        const s=createCharacterRenderer(canvas,c.sprite.source,c.character);s.resize(1.2);s.setFraming(${JSON.stringify(framing)});await s.ready();
        const video=document.createElement('canvas');video.width=640;video.height=840;
        const ctx=video.getContext('2d'),stream=video.captureStream(30),chunks=[];
        const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
        recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start();
        const segments=[['idle',16000,{mode:'idle'}],['speaking',6500,{mode:'idle',talk:.7}],
          ['pause',650,{mode:'idle'}],['thinking',1100,{mode:'work'}],['wave',1100,{mode:'alert'}],
          ['success',1100,{mode:'idle',reaction:'success'}],['error',1100,{mode:'idle',reaction:'error'}],['sleep',1100,{mode:'sleep'}]];
        const frames={},timings=[];
        for(const [name,duration,context] of segments){
          frames[name]=[];const start=performance.now();
          while(performance.now()-start<duration){
            const before=performance.now();s.draw({alpha:1},context);timings.push(performance.now()-before);
            if(!s.pendingComposite && s.compositeKey){const f=s.compositeFrame;if(frames[name].at(-1)!==f)frames[name].push(f);}
            ctx.fillStyle='#30343b';ctx.fillRect(0,0,640,840);
            ctx.drawImage(canvas,(640-canvas.width)/2,840-canvas.height);
            ctx.fillStyle='white';ctx.font='20px sans-serif';ctx.fillText('MOCHI / '+${JSON.stringify(framing)}+' / '+name,24,36);
            await new Promise(requestAnimationFrame);
          }
        }
        await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
        const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';
        for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        timings.sort((a,b)=>a-b);const p95=timings[Math.floor(timings.length*.95)];
        s.dispose();return {frames,p95,video:btoa(binary)};
      })()`);
      fs.writeFileSync(path.join(out,`after-${framing}.webm`),Buffer.from(result.video,'base64'));delete result.video;
      assert.ok([0,1,2,3].every(f=>result.frames.idle.includes(f)),'Idle/blink must advance');
      assert.ok([24,25,26,27,28,29].every(f=>result.frames.speaking.includes(f)),'Speech must traverse all six poses');
      const ordered=result.frames.speaking.filter(f=>f>=24);
      const allowed=new Set(['24:25','25:26','26:27','27:28','28:29','29:24','27:26','26:25','25:24']);
      for(let i=1;i<ordered.length;i++)assert.ok(allowed.has(`${ordered[i-1]}:${ordered[i]}`),'Skipped speech pose');
      assert.ok(result.frames.pause.includes(29),'Silence must close the mouth');
      for(const [name,first] of [['thinking',4],['wave',8],['success',12],['error',16],['sleep',20]])
        assert.ok(result.frames[name].some(f=>f>=first && f<first+4),name);
      assert.ok(result.p95<40,'Frame rendering exceeded 40ms');
      results.push({framing,...result});console.log(`PASS ${framing}: ordered speech, advancing idle/blink, silence and five reactions; p95 ${result.p95.toFixed(1)}ms`);
    }
    fs.writeFileSync(path.join(out,'live-results.json'),JSON.stringify(results,null,2)+'\n');
  }finally{await inspect(`window.host.setConfig(${JSON.stringify(previous)}).then(()=>true)`);}
})().catch(e=>{console.error(e);process.exitCode=1;});

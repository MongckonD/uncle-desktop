'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const out=path.join(__dirname,'../../character-sources/secondary-motion');
fs.mkdirSync(out,{recursive:true});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function inspect(js){
  const response=await fetch('http://127.0.0.1:47823/debug/eval',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({js})});
  const result=await response.json();assert.ok(result.ok,JSON.stringify(result));return result.value;
}
(async()=>{
  const previous=await inspect('window.host.getConfig().then(c=>({characterId:c.characterId,characterFraming:c.characterFraming,motion:c.motion}))');
  const results=[];
  try{
    for(const id of (process.argv[2]?[process.argv[2]]:['mochi','lili','luna']))for(const framing of ['full','bust']){
      await inspect(`window.host.setConfig({characterId:${JSON.stringify(id)},characterFraming:${JSON.stringify(framing)},motion:'full'}).then(()=>true)`);
      for(let i=0;i<150;i++){
        if(await inspect(`window.dev.capri.character.id===${JSON.stringify(id)} && !!window.dev.capri.sprite.source && !!window.dev.capri.sprite.torso`))break;
        await pause(100);
      }
      const result=await inspect(`(async()=>{
        const {createCharacterRenderer,viewCrop}=await import('./js/character-renderer.js');
        const {drawTorsoMotion}=await import('./js/torso-motion.js');
        const c=window.dev.capri,canvas=document.createElement('canvas');
        const s=createCharacterRenderer(canvas,c.sprite.source,c.character);s.resize(1.2);s.setFraming(${JSON.stringify(framing)});await s.ready();
        const movie=document.createElement('canvas');movie.width=640;movie.height=840;const videoCtx=movie.getContext('2d');
        const stream=movie.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
        recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};recorder.start();
        const maxima={x:0,y:0},timings=[],start=performance.now();
        while(performance.now()-start<4200){
          const t=(performance.now()-start)/1000,x=Math.sin(t*3.1)*35,y=Math.sin(t*4.2)*22,angle=Math.sin(t*2)*.035;
          const before=performance.now();s.draw({alpha:1},{mode:'idle',talk:t>1?.6:0,position:{x,y},bodyAngle:angle});
          if(t>.5)timings.push(performance.now()-before);
          for(const p of s.torso.offsets){maxima.x=Math.max(maxima.x,Math.abs(p.x));maxima.y=Math.max(maxima.y,Math.abs(p.y));}
          videoCtx.fillStyle='#343947';videoCtx.fillRect(0,0,640,840);videoCtx.save();
          videoCtx.translate(320+x*.4,800+y*.4);videoCtx.rotate(angle);videoCtx.drawImage(canvas,-canvas.width/2,-canvas.height);videoCtx.restore();
          await new Promise(requestAnimationFrame);
        }
        await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});stream.getTracks().forEach(t=>t.stop());
        const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let binary='';
        for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
        const image=s.torsoCanvas,baseline=document.createElement('canvas'),warped=document.createElement('canvas');
        baseline.width=warped.width=640;baseline.height=warped.height=840;
        const crop=viewCrop(c.character,${JSON.stringify(framing)},s.source),profile=c.character.secondaryMotion[${JSON.stringify(framing)}];
        const regions=profile.map(r=>({x:(r.x-crop.x)*320/crop.width,y:(r.y-crop.y)*420/crop.height,rx:r.rx*320/crop.width,ry:r.ry*420/crop.height}));
        for(const [target,offsets] of [[baseline,[{x:0,y:0},{x:0,y:0}]],[warped,[{x:3,y:-4},{x:2,y:-3}]]]){
          const ctx=target.getContext('2d');ctx.scale(2,2);drawTorsoMotion(ctx,image,regions,offsets);
        }
        const a=baseline.getContext('2d').getImageData(0,0,640,840).data,b=warped.getContext('2d').getImageData(0,0,640,840).data;
        const left=Math.min(...regions.map(r=>r.x-r.rx))*2-4,right=Math.max(...regions.map(r=>r.x+r.rx))*2+4;
        const top=Math.min(...regions.map(r=>r.y-r.ry))*2-4,bottom=Math.max(...regions.map(r=>r.y+r.ry))*2+4;
        let changed=0,outside=0;
        for(let y=0;y<840;y++)for(let x=0;x<640;x++){
          const i=(y*640+x)*4;let difference=0;for(let k=0;k<4;k++)difference=Math.max(difference,Math.abs(a[i+k]-b[i+k]));
          if(difference>2){changed++;if(x<left||x>right||y<top||y>bottom)outside++;}
        }
        const util=await import('./js/util.js'),setting=util.reducedMotion.setting;util.reducedMotion.setting='reduced';
        s.draw({alpha:1},{mode:'idle',talk:1,position:{x:10,y:10}});util.reducedMotion.setting=setting;
        const reduced=s.torso.offsets.every(p=>p.x===0&&p.y===0);
        timings.sort((a,b)=>a-b);const p95=timings[Math.floor(timings.length*.95)];
        s.dispose();return {maxima,changed,outside,reduced,p95,frames:timings.length,video:btoa(binary)};
      })()`);
      fs.writeFileSync(path.join(out,`${id}-${framing}.webm`),Buffer.from(result.video,'base64'));delete result.video;
      assert.ok(result.maxima.x>.5 && result.maxima.y>.5,`${id}/${framing}: inertia too small`);
      assert.ok(result.maxima.x<=8 && result.maxima.y<=8);
      assert.ok(result.changed>100 && result.outside===0,`${id}/${framing}: deformation escaped the torso ${JSON.stringify(result)}`);
      assert.ok(result.reduced);assert.ok(result.p95<40,`Rendering too slow: ${result.p95}ms`);
      results.push({id,framing,...result});console.log(`PASS ${id}/${framing}: two-axis inertia, fixed face/legs, reduced motion, p95 ${result.p95.toFixed(1)}ms`);
    }
    fs.writeFileSync(path.join(out,process.argv[2]?`results-${process.argv[2]}.json`:'results.json'),JSON.stringify(results,null,2)+'\n');
  }finally{await inspect(`window.host.setConfig(${JSON.stringify(previous)}).then(()=>true)`);}
})().catch(error=>{console.error(error);process.exitCode=1;});

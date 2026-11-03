'use strict';
const { authHeaders } = require('../hooks/bridge-token');
const assert=require('node:assert/strict');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function inspect(js){
  const response=await fetch('http://127.0.0.1:47823/debug/eval',{method:'POST',headers: authHeaders(),body:JSON.stringify({js})});
  const result=await response.json();assert.ok(result.ok,JSON.stringify(result));return result.value;
}
(async()=>{
  const previous=await inspect('window.host.getConfig().then(c=>({characterId:c.characterId,characterFraming:c.characterFraming}))');
  const results=[];
  try {
    await inspect("window.host.setConfig({characterId:'mochi'}).then(()=>true)");
    let ready=false;
    for(let i=0;i<150;i++) {
      if(await inspect("window.dev.capri.character.id==='mochi' && !!window.dev.capri.sprite.source")){ready=true;break;}
      await pause(100);
    }
    assert.ok(ready,'Mochi did not load');
    for(const framing of ['full','bust']) {
      const result=await inspect(`(async()=>{
        const {createCharacterRenderer,viewCrop}=await import('./js/character-renderer.js');
        const actor=window.dev.capri,canvas=document.createElement('canvas');
        const s=createCharacterRenderer(canvas,actor.sprite.source,actor.character);
        s.resize(1);s.setFraming(${JSON.stringify(framing)});await s.ready();
        const view=${JSON.stringify(framing)}==='bust'?s.source.bust:s.source;
        const variant=view.manifest.variants.find(v=>v.frameWidth===640),layer=variant.layers[0];
        const pages=await Promise.all(variant.pages.map(async p=>{const image=new Image();image.src=new URL(p.file,view.url).href;await image.decode();return image;}));
        const crop=viewCrop(actor.character,${JSON.stringify(framing)},s.source);
        // These ROIs are measured from the packed artwork, independently of
        // the motion profile. A self-referential profile bounds test misses this bug.
        const eyes=${JSON.stringify(framing)}==='bust'?[110,230,215,285]:[130,195,192,226];
        const chest=${JSON.stringify(framing)}==='bust'?[110,300,215,375]:[135,235,195,278];
        const results=[];
        for(let index=0;index<layer.frames.length;index++) {
          const frame=layer.frames[index];s.composite.width=640;s.composite.height=840;
          s.composite.getContext('2d').drawImage(pages[frame.page],frame.x,frame.y,640,840,0,0,640,840);
          const images=[];
          for(const offsets of [[{x:0,y:0},{x:0,y:0}],[{x:3,y:-4},{x:2,y:-3}]]) {
            const target=document.createElement('canvas');target.width=640;target.height=840;
            const ctx=target.getContext('2d');ctx.scale(2,2);ctx.translate(160,0);
            s.drawSecondary(ctx,crop,0,offsets,${JSON.stringify(framing)}==='bust');
            images.push(ctx.getImageData(0,0,640,840).data);
          }
          const changed=roi=>{
            const left=Math.max(0,Math.ceil((roi[0]-crop.x)*640/crop.width)),right=Math.min(640,Math.floor((roi[2]-crop.x)*640/crop.width));
            const top=Math.max(0,Math.ceil((roi[1]-crop.y)*840/crop.height)),bottom=Math.min(840,Math.floor((roi[3]-crop.y)*840/crop.height));
            let count=0;
            for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
              const i=(y*640+x)*4;
              if([0,1,2,3].some(k=>Math.abs(images[0][i+k]-images[1][i+k])>2))count++;
            }
            return count;
          };
          results.push({frame:index,eyes:changed(eyes),chest:changed(chest)});
        }
        s.dispose();return results;
      })()`);
      results.push({framing,frames:result.length,eyeChanges:result.reduce((n,r)=>n+r.eyes,0),minimumChestChanges:Math.min(...result.map(r=>r.chest))});
    }
    console.table(results);
    assert.ok(results.every(r=>r.eyeChanges===0 && r.minimumChestChanges>50),'Eyes must remain unchanged while the chest moves in every packed pose');
  }finally{await inspect(`window.host.setConfig(${JSON.stringify(previous)}).then(()=>true)`);}
})().catch(error=>{console.error(error);process.exitCode=1;});

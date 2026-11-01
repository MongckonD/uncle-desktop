'use strict';
const assert=require('node:assert/strict');
(async()=>{
  const js=`(async()=>{
    const {loadCharacterSource}=await import('./js/character-assets.js');
    const character=(await window.host.getConfig()).characters.find(c=>c.id==='luna');
    const source=await loadCharacterSource(character),failures=[];let cases=0;
    for(const [name,view] of [['full',source],['bust',source.bust]])for(const variant of view.manifest.variants){
      const w=variant.frameWidth,h=variant.frameHeight;
      const pages=await Promise.all(variant.pages.map(async p=>{const image=new Image();image.src=new URL(p.file,view.url).href;await image.decode();return image;}));
      const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d',{willReadFrequently:true});
      for(let index=0;index<variant.layers[0].frames.length;index++){
        const f=variant.layers[0].frames[index];ctx.clearRect(0,0,w,h);ctx.drawImage(pages[f.page],f.x,f.y,w,h,0,0,w,h);
        const data=ctx.getImageData(0,0,w,h).data;let top=-1;
        for(let y=0;y<h && top<0;y++)for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>80){top=y;break;}
        let widest=0;
        for(let y=Math.max(0,top-Math.round(w/80));y<Math.min(h,top+Math.max(1,Math.round(w/160)));y++){
          let count=0;for(let x=0;x<w;x++)if(data[(y*w+x)*4+3]>2)count++;widest=Math.max(widest,count);
        }
        cases++;if(widest>=w*.45)failures.push({view:name,index,width:w,widest});
      }
      pages.forEach(image=>{image.src='';});
    }
    return {cases,failures};
  })()`;
  const response=await fetch('http://127.0.0.1:47823/debug/eval',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({js})});
  const result=await response.json();assert.ok(result.ok,JSON.stringify(result));console.log(JSON.stringify(result.value));
  assert.equal(result.value.cases,48);assert.deepEqual(result.value.failures,[],'Live application still serves a Luna head strip');
})().catch(error=>{console.error(error);process.exitCode=1;});

'use strict';
const assert=require('node:assert/strict');
(async()=>{
  const response=await fetch('http://127.0.0.1:47823/debug/eval',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({js:`(async()=>{
    const {drawTorsoMotion}=await import('./js/torso-motion.js');
    const results=[];
    for(const resolution of [1,2,3])for(const scale of [.6,1,1.6,3.2])for(const alpha of [1,.5])for(const amplitude of [1,2]){
      const image=document.createElement('canvas');image.width=320*resolution;image.height=420*resolution;
      const source=image.getContext('2d');source.fillStyle='rgba(180,120,90,'+alpha+')';
      source.fillRect(0,0,image.width,image.height);
      const expected=source.getImageData(0,0,1,1).data;
      const canvas=document.createElement('canvas');canvas.width=Math.ceil(320*scale);canvas.height=Math.ceil(420*scale);
      const ctx=canvas.getContext('2d');ctx.scale(scale,scale);
      drawTorsoMotion(ctx,image,[{x:144,y:177,rx:25,ry:20},{x:173,y:177,rx:25,ry:20}],[{x:3*amplitude,y:-4*amplitude},{x:2*amplitude,y:-3*amplitude}]);
      const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
      let maxError=0,bad=0;
      for(let y=Math.ceil(159*scale);y<195*scale;y++)for(let x=Math.ceil(121*scale);x<196*scale;x++){
        let error=0;for(let k=0;k<4;k++)error=Math.max(error,Math.abs(pixels[(y*canvas.width+x)*4+k]-expected[k]));
        maxError=Math.max(maxError,error);if(error>2)bad++;
      }
      results.push({resolution,scale,alpha,amplitude,maxError,bad});
    }
    return results;
  })()`})});
  const result=await response.json();assert.ok(result.ok,JSON.stringify(result));
  console.log(JSON.stringify({cases:result.value.length,maxPixelError:Math.max(...result.value.map(r=>r.maxError)),badPixels:result.value.reduce((n,r)=>n+r.bad,0)}));
  if(result.value.some(r=>r.bad))console.table(result.value.filter(r=>r.bad));
  assert.ok(result.value.every(r=>r.bad===0),'Deformation must not introduce triangle seams or alpha overdraw');
})().catch(error=>{console.error(error);process.exitCode=1;});

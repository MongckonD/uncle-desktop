import { Spring } from './character-rig.js';

const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(n)?n:0));

export function torsoRegions(config,view,frame) {
  return config[`${view}Frames`]?.[frame] || config[view] || [];
}

// The painted pose already contains gravity's static equilibrium. Simulate
// displacement around that pose, driven by acceleration and posture changes.
export class TorsoMotion {
  constructor(config={}) {
    this.config=config;
    const settings={mass:clamp(config.mass??1,.3,3),stiffness:clamp(config.stiffness??60,20,180),
      damping:clamp(config.damping??9,4,35),max:clamp(config.max??7,0,8)};
    this.springs=[.96,1.04].map(mass=>({x:new Spring({...settings,mass:settings.mass*mass}),y:new Spring({...settings,mass:settings.mass*mass})}));
    this.reset();
  }

  reset() {
    for(const pair of this.springs){pair.x.reset();pair.y.reset();}
    this.last=null;this.velocity={x:0,y:0};this.posture=null;
    this.offsets=[{x:0,y:0},{x:0,y:0}];
  }

  update(now,context={}) {
    const position=context.position||{x:0,y:0};
    const root={x:(Number.isFinite(position.x)?position.x:0)+(context.angle||0)*200,
      y:(Number.isFinite(position.y)?position.y:0)-(context.breath||0)*200+(context.danceY||0)};
    root.x+=context.danceX||0;
    const elapsed=this.last?(now-this.last.time)/1000:0;
    if(context.still || elapsed<0 || elapsed>.25 || (this.last && Math.hypot(root.x-this.last.x,root.y-this.last.y)>120)) {
      this.reset();this.last={...root,time:now};return this.offsets;
    }
    const dt=clamp(elapsed,0,.05);
    const velocity={x:dt?clamp((root.x-(this.last?.x??root.x))/dt,-700,700):0,
      y:dt?clamp((root.y-(this.last?.y??root.y))/dt,-700,700):0};
    const ax=dt?clamp((velocity.x-this.velocity.x)/dt,-3000,3000):0;
    const ay=dt?clamp((velocity.y-this.velocity.y)/dt,-3000,3000):0;
    const posture=`${context.state||'idle'}:${context.speechPose||'rest'}`;
    if(this.posture!==null && this.posture!==posture) {
      // Authored pose changes move the torso even if its screen position stays
      // fixed. A bounded impulse adds lag rather than a permanent idle loop.
      const emphasis=context.speechPose==='talkEmphasis'?1.3:1;
      for(let i=0;i<2;i++) {
        this.springs[i].y.v+=clamp(this.config.impulse??32,10,60)*emphasis*(i===0?1:.9);
        this.springs[i].x.v+=(context.angle<0?-1:1)*11*emphasis;
      }
    }
    // Convert screen-pixel acceleration to the local spring's force units.
    const drive=clamp(this.config.drive??.024,0,.05)*6;
    const strength=clamp(this.config.strength??1.6,0,2);
    const previous=this.offsets;
    this.offsets=this.springs.map((pair,i)=>({
      x:clamp(pair.x.step(dt,-ax*drive+(previous[1-i].x-previous[i].x)*3)*strength,-8,8),
      y:clamp(pair.y.step(dt,-ay*drive+(previous[1-i].y-previous[i].y)*3)*strength,-8,8),
    }));
    this.last={...root,time:now};this.velocity=velocity;this.posture=posture;
    return this.offsets;
  }
}

export function torsoPoint(x,y,regions,offsets) {
  let dx=0,dy=0;
  for(let i=0;i<regions.length;i++) {
    const region=regions[i],r2=((x-region.x)/region.rx)**2+((y-region.y)/region.ry)**2;
    const weight=r2>=1?0:(1-r2)**2;
    dx+=(offsets[i]?.x||0)*weight;dy+=(offsets[i]?.y||0)*weight;
  }
  return {x:x+dx,y:y+dy};
}

// Warp a single native-resolution bitmap instead of alpha-compositing clipped
// triangles: their antialiased edges leave cracks or darker overlapping seams.
const surfaces=new WeakMap();
export function drawTorsoMotion(ctx,image,regions,offsets) {
  if(!regions?.length || offsets.every(o=>Math.abs(o.x)+Math.abs(o.y)<.005)) {
    ctx.drawImage(image,0,0,image.width,image.height,0,0,320,420);return;
  }
  // Limit the displacement gradient so overlapping regions cannot fold over.
  offsets=regions.map((r,i)=>{
    const p=offsets[i]||{x:0,y:0},max=.56*Math.min(r.rx,r.ry)/regions.length;
    const gain=Math.min(1,max/(Math.hypot(p.x,p.y)||1));
    return {x:p.x*gain,y:p.y*gain};
  });
  let surface=surfaces.get(image);
  if(!surface) {
    const canvas=document.createElement('canvas');
    surface={canvas,ctx:canvas.getContext('2d',{willReadFrequently:true})};
    surfaces.set(image,surface);
  }
  const {canvas,ctx:stage}=surface;
  if(canvas.width!==image.width || canvas.height!==image.height){canvas.width=image.width;canvas.height=image.height;}
  stage.globalCompositeOperation='copy';stage.drawImage(image,0,0);
  const sx=image.width/320,sy=image.height/420;
  const left=clamp(Math.floor(Math.min(...regions.map(r=>r.x-r.rx))*sx),0,image.width);
  const right=clamp(Math.ceil(Math.max(...regions.map(r=>r.x+r.rx))*sx),0,image.width);
  const top=clamp(Math.floor(Math.min(...regions.map(r=>r.y-r.ry))*sy),0,image.height);
  const bottom=clamp(Math.ceil(Math.max(...regions.map(r=>r.y+r.ry))*sy),0,image.height);
  const w=right-left,h=bottom-top;
  if(w>0 && h>0) {
    const source=stage.getImageData(left,top,w,h),target=stage.createImageData(w,h);
    const a=source.data,b=target.data;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const px=(left+x+.5)/sx,py=(top+y+.5)/sy;
      let u=px,v=py;
      // Newton inversion keeps the texture continuous, including alpha edges.
      for(let step=0;step<5;step++) {
        let dx=0,dy=0,xx=1,xy=0,yx=0,yy=1;
        for(let i=0;i<regions.length;i++) {
          const r=regions[i],ox=offsets[i]?.x||0,oy=offsets[i]?.y||0;
          const rx=u-r.x,ry=v-r.y,t=1-rx*rx/(r.rx*r.rx)-ry*ry/(r.ry*r.ry);
          if(t<=0)continue;
          const wx=-4*rx*t/(r.rx*r.rx),wy=-4*ry*t/(r.ry*r.ry);
          dx+=ox*t*t;dy+=oy*t*t;xx+=ox*wx;xy+=ox*wy;yx+=oy*wx;yy+=oy*wy;
        }
        const ex=u+dx-px,ey=v+dy-py,det=xx*yy-xy*yx;
        if(Math.abs(ex)+Math.abs(ey)<.0001 || Math.abs(det)<.05)break;
        u-=clamp((yy*ex-xy*ey)/det,-8,8);v-=clamp((xx*ey-yx*ex)/det,-8,8);
      }
      const tx=clamp(u*sx-left-.5,0,w-1),ty=clamp(v*sy-top-.5,0,h-1);
      const x0=Math.floor(tx),y0=Math.floor(ty),x1=Math.min(w-1,x0+1),y1=Math.min(h-1,y0+1);
      const fx=tx-x0,fy=ty-y0;
      const indices=[(y0*w+x0)*4,(y0*w+x1)*4,(y1*w+x0)*4,(y1*w+x1)*4];
      const weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];
      const dest=(y*w+x)*4;
      let alpha=0,red=0,green=0,blue=0;
      for(let i=0;i<4;i++) {
        const index=indices[i],weight=weights[i]*a[index+3];
        alpha+=weight;red+=a[index]*weight;green+=a[index+1]*weight;blue+=a[index+2]*weight;
      }
      b[dest+3]=alpha;
      if(alpha>0){b[dest]=red/alpha;b[dest+1]=green/alpha;b[dest+2]=blue/alpha;}
    }
    stage.putImageData(target,left,top);
  }
  ctx.drawImage(canvas,0,0,canvas.width,canvas.height,0,0,320,420);
}

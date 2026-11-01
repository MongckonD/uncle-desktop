'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const load=()=>import(pathToFileURL(path.join(__dirname,'../src/renderer/js/torso-motion.js')).href);

test('authored impulse control increases pose-change motion without raising the safety limit',async()=>{
  const {TorsoMotion}=await load();
  function peak(impulse){const m=new TorsoMotion({impulse});m.update(0,{speechPose:'talkPrepare'});let p=0;
    for(let i=1;i<60;i++){m.update(i*16,{speechPose:'talkEmphasis'});p=Math.max(p,m.offsets[0].y);assert.ok(m.offsets.every(o=>Math.abs(o.y)<=8));}return p;}
  assert.ok(peak(45)>peak(32)*1.15,'A stronger calibrated impulse should be visibly stronger');
});

test('torso motion follows both axes, remains bounded and settles when movement stops',async()=>{
  const {TorsoMotion}=await load();
  const motion=new TorsoMotion({stiffness:48,damping:7.5,strength:1.5});
  let maxX=0,maxY=0,difference=0;
  for(let i=0;i<240;i++){
    const offsets=motion.update(i*1000/60,{position:{x:Math.sin(i/15)*35,y:Math.sin(i/19)*20}});
    for(const point of offsets){maxX=Math.max(maxX,Math.abs(point.x));maxY=Math.max(maxY,Math.abs(point.y));assert.ok(Math.abs(point.x)<=6 && Math.abs(point.y)<=6);}
    difference=Math.max(difference,Math.abs(offsets[0].y-offsets[1].y));
  }
  assert.ok(maxX>.5 && maxY>.5,'Both horizontal and vertical inertia must be visible');
  assert.ok(difference>.005,'The two masses should not be perfectly rigidly linked');
  const fixed={x:Math.sin(239/15)*35,y:Math.sin(239/19)*20};
  for(let i=240;i<840;i++)motion.update(i*1000/60,{position:fixed});
  for(const point of motion.offsets)assert.ok(Math.abs(point.x)+Math.abs(point.y)<.01);
});

test('pose changes cause a transient impulse, not a continuous idle oscillation',async()=>{
  const {TorsoMotion}=await load();const motion=new TorsoMotion();
  motion.update(0,{speechPose:'talkPrepare'});
  motion.update(16,{speechPose:'talkEmphasis'});
  assert.ok(motion.offsets.every(p=>p.y>0));
  for(let i=2;i<400;i++)motion.update(i*16,{speechPose:'talkEmphasis'});
  assert.ok(motion.offsets.every(p=>Math.abs(p.x)+Math.abs(p.y)<.01));
});

test('elf profiles produce a visible rebound at different refresh rates',async()=>{
  const {TorsoMotion}=await load();
  const characters=require('../assets/characters/catalog.json');
  for(const character of characters.filter(c=>c.secondaryMotion))for(const fps of [30,60,144]) {
    const motion=new TorsoMotion(character.secondaryMotion);
    motion.update(0,{speechPose:'talkPrepare'});
    let peak=0,rebound=0;
    for(let i=1;i<fps*6;i++) {
      const offsets=motion.update(i*1000/fps,{speechPose:'talkEmphasis'});
      for(const p of offsets){peak=Math.max(peak,p.y);rebound=Math.min(rebound,p.y);assert.ok(Math.abs(p.x)<=8 && Math.abs(p.y)<=8);}
    }
    assert.ok(peak>4,`${character.id}/${fps}: reaction too small (${peak})`);
    assert.ok(rebound<-.5,`${character.id}/${fps}: no elastic rebound (${rebound})`);
    assert.ok(motion.offsets.every(p=>Math.abs(p.x)+Math.abs(p.y)<.01));
  }
});

test('reduced motion, long pauses and teleports reset secondary motion',async()=>{
  const {TorsoMotion}=await load();const motion=new TorsoMotion();
  motion.update(0,{position:{x:0,y:0}});motion.update(16,{position:{x:20,y:10}});
  assert.ok(motion.offsets.some(p=>p.x!==0 || p.y!==0));
  assert.deepEqual(motion.update(32,{still:true}),[{x:0,y:0},{x:0,y:0}]);
  assert.deepEqual(motion.update(1000,{}),[{x:0,y:0},{x:0,y:0}]);
  assert.deepEqual(motion.update(1016,{position:{x:1000,y:1000}}),[{x:0,y:0},{x:0,y:0}]);
});

test('local deformation preserves the face, legs and the region boundary',async()=>{
  const {torsoPoint}=await load();
  const regions=[{x:144,y:177,rx:25,ry:20},{x:173,y:177,rx:25,ry:20}];
  const offsets=[{x:3,y:-4},{x:2,y:-3}];
  assert.deepEqual(torsoPoint(144,177,regions,offsets),{x:147,y:173});
  for(const p of [{x:160,y:100},{x:160,y:350},{x:119,y:177},{x:144,y:157}])assert.deepEqual(torsoPoint(p.x,p.y,regions,offsets),p);
});

test('Mochi bust calibration targets the packed chest and leaves the eyes fixed',async()=>{
  const {torsoPoint}=await load();
  const mochi=require('../assets/characters/catalog.json').find(c=>c.id==='mochi');
  const regions=mochi.secondaryMotion.bust,offsets=[{x:3,y:-4},{x:2,y:-3}];
  // Independently measured on the active sequence-30-bust atlas, not bust-hd.
  for(const p of [{x:145,y:255},{x:180,y:255}])assert.deepEqual(torsoPoint(p.x,p.y,regions,offsets),p);
  const chest=torsoPoint(144,338,regions,offsets);
  assert.ok(Math.hypot(chest.x-144,chest.y-338)>1);
});

test('Luna isolated gesture uses its own calibration without changing other poses',async()=>{
  const {torsoRegions,torsoPoint}=await load();
  const config=require('../assets/characters/catalog.json').find(c=>c.id==='luna').secondaryMotion;
  assert.equal(torsoRegions(config,'bust',0),config.bust);
  assert.equal(torsoRegions(config,'full',10),config.full);
  const profile=torsoRegions(config,'bust',10);
  assert.equal(profile,config.bustFrames['10']);
  assert.deepEqual(torsoRegions(config,'bust',4),profile);
  const offsets=[{x:3,y:-4},{x:2,y:-3}];
  assert.deepEqual(torsoPoint(160,230,profile,offsets),{x:160,y:230});
  assert.ok(torsoPoint(142,330,profile,offsets).y<329);
});

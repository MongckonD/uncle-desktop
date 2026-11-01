'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = name => import(pathToFileURL(path.join(__dirname, '../src/renderer/js', name)).href);

test('conversation gestures follow audio and close immediately on pauses', async () => {
  const { ConversationMotion } = await load('conversation-motion.js');
  const motion = new ConversationMotion('test');
  assert.equal(motion.update(0, {talk:.8}).speechPose, 'talkPrepare');
  assert.match(motion.update(120, {talk:.8}).speechPose, /^talk(Soft|Round|Emphasis)$/);
  assert.equal(motion.update(160, {talk:0}).speechPose, 'talkRest');
  assert.equal(motion.update(600, {talk:0}).speechPose, null);
  assert.equal(motion.update(620, {talk:.9,state:'sleep'}).speechPose, null);
  assert.equal(motion.update(640, {talk:.9,state:'error'}).speechPose, null);
  assert.equal(motion.update(660, {talk:.9,still:true}).breath, 0);
});

test('long speech varies gestures without a fixed two-frame loop or immediate repetition', async () => {
  const { ConversationMotion } = await load('conversation-motion.js');
  const motion = new ConversationMotion('test');
  let previous, changes=[];
  for(let now=0;now<20000;now+=50) {
    const result=motion.update(now,{talk:.6});
    if(result.speechPose!==previous && result.speechPose!=='talkPrepare')changes.push({pose:result.speechPose,at:now});
    previous=result.speechPose;
  }
  assert.equal(new Set(changes.map(c=>c.pose)).size,3);
  assert.ok(changes.length>10 && changes.length<40);
  for(let i=1;i<changes.length;i++)assert.ok(changes[i].at-changes[i-1].at>=550);
});

test('the renderer selects authored open and closed poses and preserves important states', async () => {
  const { trackFrame } = await load('character-rig.js');
  const layer={role:'composite',frames:Array(12).fill({}),tracks:{idle:[0],sleep:[5],error:[4],talkSoft:[8],talkRest:[11]}};
  assert.equal(trackFrame(layer,'idle',0,2,{directed:true,talk:.8,speechPose:'talkSoft'}),8);
  assert.equal(trackFrame(layer,'idle',0,2,{directed:true,talk:0,speechPose:'talkRest'}),11);
  assert.equal(trackFrame(layer,'sleep',0,2,{directed:true,talk:.8,speechPose:'talkSoft'}),5);
  assert.equal(trackFrame(layer,'error',0,2,{directed:true,talk:.8,speechPose:'talkSoft'}),4);
});

test('ordered speech traverses authored adjacent poses and closes on silence',async()=>{
  const {ConversationMotion}=await load('conversation-motion.js');
  const motion=new ConversationMotion('mochi',{orderedSpeech:true});
  const seen=new Set(),pairs=new Set();let previous;
  const allowed=new Set(['0:1','1:2','2:3','3:4','4:5','5:0','3:2','2:1','1:0']);
  for(let now=0;now<30000;now+=16){
    const frame=motion.update(now,{talk:.7}).speechFrame;
    seen.add(frame);
    if(previous!==undefined && previous!==frame){const pair=`${previous}:${frame}`;assert.ok(allowed.has(pair),pair);pairs.add(pair);}
    previous=frame;
  }
  assert.equal(seen.size,6);assert.ok(pairs.has('2:1'),'Both small and full gestures should occur');
  assert.equal(motion.update(30000,{talk:0}).speechFrame,5);
  assert.equal(motion.update(31000,{talk:0}).speechFrame,undefined);
  assert.equal(motion.update(31016,{talk:1,state:'error'}).speechFrame,undefined);
  assert.equal(motion.update(31032,{talk:1,still:true}).speechFrame,undefined);
});

test('ambient gestures vary whole paths and dwell times without repeating a path immediately',async()=>{
  const {ConversationMotion}=await load('conversation-motion.js');
  const motion=new ConversationMotion('mochi',{orderedSpeech:true});
  const paths=[],dwells=new Set(),seen=new Set();let lastPath=-1,previous=0,at=0;
  for(let now=0;now<90000;now+=16){
    const result=motion.update(now);seen.add(result.ambientFrame);
    if(motion.lastAmbientPath!==lastPath){paths.push(motion.lastAmbientPath);lastPath=motion.lastAmbientPath;}
    if(previous!==result.ambientFrame){dwells.add(now-at);at=now;previous=result.ambientFrame;}
  }
  assert.equal(new Set(paths).size,3);assert.equal(seen.size,4);assert.ok(dwells.size>4);
  for(let i=1;i<paths.length;i++)assert.notEqual(paths[i],paths[i-1]);
  assert.equal(motion.update(90016,{state:'error'}).ambientFrame,undefined);
  assert.equal(motion.update(90032,{talk:1}).ambientFrame,undefined);
  assert.equal(motion.update(90048,{still:true}).ambientFrame,undefined);
  const {trackFrame}=await load('character-rig.js');
  const layer={continuousTracks:true,role:'composite',tracks:{idleMotion:[0,1,2,3],thinkingMotion:[4,5,6,7],error:[16]},frames:Array(30).fill({})};
  assert.equal(trackFrame(layer,'thinking',0,4,{ambientFrame:2}),6);
  assert.equal(trackFrame(layer,'error',0,4,{ambientFrame:2}),16);
});

test('music dance is continuous, bounded and yields to speech, sleep and reduced motion',async()=>{
  const {ConversationMotion,dancePose}=await load('conversation-motion.js');
  let peak=0;
  for(let t=0;t<3000;t+=16){const p=dancePose(t,true);peak=Math.max(peak,Math.abs(p.x)+Math.abs(p.y));assert.ok(Math.abs(p.x)<=5 && p.y>=-8 && p.y<=0 && Math.abs(p.angle)<=.03);}
  assert.ok(peak>8);assert.deepEqual(dancePose(500,false),{x:0,y:0,angle:0});
  const m=new ConversationMotion('mochi',{orderedSpeech:true});
  assert.notEqual(m.update(300,{dance:true}).danceY,0);
  for(const context of [{talk:1},{state:'sleep'},{state:'error'},{still:true}])assert.equal(m.update(316,{dance:true,...context}).danceY,0);
});

test('continuous authored tracks are not frozen by the conversation director',async()=>{
  const {trackFrame}=await load('character-rig.js');
  const layer={role:'composite',continuousTracks:true,frames:Array(30).fill({}),
    tracks:{idle:[0,1,2,3],error:[16,17,18,19],speechMotion:[24,25,26,27,28,29]}};
  assert.deepEqual([0,250,500,750].map(t=>trackFrame(layer,'idle',t,4,{directed:true,blink:true})),[0,1,2,3]);
  assert.equal(trackFrame(layer,'idle',0,4,{speechFrame:4,talk:1}),28);
  assert.equal(trackFrame(layer,'error',250,4,{speechFrame:4,talk:1}),17);
  assert.equal(trackFrame(layer,'idle',500,4,{speechFrame:4,talk:1,still:true}),0);
});

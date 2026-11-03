'use strict';
const { authHeaders } = require('../hooks/bridge-token');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createNative}=require('../src/main/computer');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function inspect(js){const r=await fetch('http://127.0.0.1:47823/debug/eval',{method:'POST',headers: authHeaders(),body:JSON.stringify({js})}).then(r=>r.json());if(!r.ok)throw Error(r.error||'App test failed');return r.value;}
async function run(question,interrupt){
 const v=window.dev.voiceAgent,l=window.dev.listening,SDK=window.ElevenLabsClient.Conversation;
 const originalMedia=navigator.mediaDevices.getUserMedia,oldLoader=v.loadSDK,oldHost=v.host,oldVolume=v.volume;
 const context=new AudioContext(),streams=[],transcripts=[],tools=[];let dest,audioChunks=0,interruptions=0;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async(test,ms)=>{const end=Date.now()+ms;while(Date.now()<end&&!test())await sleep(100);return test();};
 const decode=base64=>context.decodeAudioData(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)).buffer);
 const feed=async base64=>{const buffer=await decode(base64),source=context.createBufferSource();source.buffer=buffer;source.connect(dest);source.start();await sleep(buffer.duration*1000+150);source.disconnect();};
 try{
  await l.load();l.stop();await context.resume();
  navigator.mediaDevices.getUserMedia=async()=>{dest=context.createMediaStreamDestination();streams.push(dest.stream);return dest.stream;};
  v.host={...oldHost,agentTool:async request=>{if(request.name!=='media'||request.args?.action!=='now_playing')return JSON.stringify({status:'not_executed',message:'QA allows only reading current song'});tools.push(request.name);return oldHost.agentTool(request);}};
  v.loadSDK=async()=>({startSession:options=>SDK.startSession({...options,onAudio:()=>audioChunks++,onInterruption:event=>{interruptions++;options.onInterruption?.(event);},onMessage:event=>{transcripts.push({role:event.role,text:event.message});options.onMessage?.(event);}})});
  v.volume=0.15;await v.start();window.__uncleAgentLive.phase='connected';
  if(!await until(()=>audioChunks>0,20000))throw Error('No ElevenLabs greeting audio');
  await until(()=>!v.speaking,10000);await sleep(300);window.__uncleAgentLive.phase='thai-audio';await feed(question);
  if(!await until(()=>tools.length>0,25000))throw Error('Thai audio did not invoke media tool');
  if(!await until(()=>window.dev.computer.state?.status==='done',15000))throw Error('Native media job did not finish');
  await until(()=>!v.speaking,10000);window.__uncleAgentLive.phase='interruption';
  v.session.sendUserMessage('ช่วยนับเลขภาษาไทยตั้งแต่หนึ่งถึงยี่สิบช้าๆ เพื่อทดสอบเสียง');
  if(!await until(()=>v.speaking,15000))throw Error('Agent did not start speaking for interruption test');
  await feed(interrupt);await until(()=>interruptions>0,10000);await sleep(1500);
  return {status:'done',audioChunks,interruptions,tools,transcripts,computerStatus:window.dev.computer.state?.status,syntheticInputOnly:true};
 }catch(e){return {status:'error',message:e.message,audioChunks,interruptions,tools,transcripts};}
 finally{v.stop();await sleep(300);navigator.mediaDevices.getUserMedia=originalMedia;for(const stream of streams)stream.getTracks().forEach(t=>t.stop());await context.close();v.loadSDK=oldLoader;v.host=oldHost;v.volume=oldVolume;l.hide();}
}
(async()=>{
 const saved=await inspect('host.computerInfo()'),fixture=await require('../tests/fixtures/computer-qa')(),native=createNative();
 try{
  await inspect('window.dev.listening.hide();window.dev.computer.hide()');let target;
  for(let i=0;i<30;i++){target=(await native.request({action:'windows'})).find(w=>w.title==='Uncle Computer QA');if(target)break;await wait(200);}assert.ok(target);await native.request({action:'focus',window:target.window});native.stop();
  await inspect('host.computerSave('+JSON.stringify({...saved.settings,consent:true,voice:true,images:false})+')');
  const dir=process.argv[2]||path.resolve(__dirname,'../../../work/voice-qa');
  const question=fs.readFileSync(path.join(dir,'agent-question.mp3')).toString('base64'),interrupt=fs.readFileSync(path.join(dir,'agent-interrupt.mp3')).toString('base64');
  await inspect('window.__uncleAgentLive={phase:"starting",result:null};('+run.toString()+')('+JSON.stringify(question)+','+JSON.stringify(interrupt)+').then(result=>window.__uncleAgentLive.result=result);true');
  let result;const end=Date.now()+110000;while(Date.now()<end){await wait(500);result=await inspect('window.__uncleAgentLive.result');if(result)break;}
  assert.ok(result,'Live test timed out');console.log(JSON.stringify(result));assert.equal(result.status,'done',result.message);assert.ok(result.audioChunks>0&&result.interruptions>0&&result.tools.length>0);console.log('PASS real ElevenLabs Thai audio → transcript → client tool → native read-only media result; real interruption and cleanup.');
 }finally{await inspect('window.dev.listening.stop();window.dev.voiceAgent.stop();host.computerStop()').catch(()=>{});await inspect('host.computerSave('+JSON.stringify(saved.settings)+')').catch(()=>{});native.stop();await fixture.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

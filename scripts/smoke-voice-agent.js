'use strict';
const { authHeaders } = require('../hooks/bridge-token');
const assert=require('node:assert/strict');
async function inspect(js){const r=await fetch('http://127.0.0.1:47823/debug/eval',{method:'POST',headers: authHeaders(),body:JSON.stringify({js})}).then(r=>r.json());assert.ok(r.ok,JSON.stringify(r));return r.value;}
async function test(){
 const v=window.dev.voiceAgent,l=window.dev.listening,OriginalSocket=window.WebSocket,originalHost=v.host,originalComputer=v.computer;
 await l.load();l.stop();let socket,toolCalls=0,answers=0,interrupted=false;
 class FakeSocket extends EventTarget {
  static OPEN=1;static CLOSED=3;readyState=0;messages=[];
  constructor(){super();socket=this;setTimeout(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));},0);}
  emit(data){this.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(data)}));}
  send(data){const event=JSON.parse(data);this.messages.push(event);if(event.type==='conversation_initiation_client_data')setTimeout(()=>this.emit({type:'conversation_initiation_metadata',conversation_initiation_metadata_event:{conversation_id:'local_qa',agent_output_audio_format:'pcm_16000',user_input_audio_format:'pcm_16000'}}),0);}
  close(){this.readyState=3;this.dispatchEvent(new CloseEvent('close',{code:1000,reason:'Local test ended'}));}
 }
 try{
  window.WebSocket=FakeSocket;v.host={...originalHost,agentStart:async()=>({signedUrl:'wss://api.elevenlabs.io/local-qa',sessionId:'local-only',settings:{language:'th'},tools:['media'],prompt:'local test'}),agentStop(){},agentTool:async request=>{if(request.sessionId!=='local-only'||request.name!=='media')throw Error('bad tool bridge');toolCalls++;return JSON.stringify({status:'accepted',jobId:'qa-job'});}};
  v.computer={hide(){},answerState:async(state,yes)=>{if(state.id!=='qa-job'||state.approvalId!=='qa-approval'||yes!==true)throw Error('bad approval');answers++;}};
  await v.start();if(!v.session)throw Error('real SDK did not start');
  socket.emit({type:'client_tool_call',client_tool_call:{tool_name:'media',tool_call_id:'qa-call',parameters:{action:'now_playing'}}});
  await new Promise(r=>setTimeout(r,250));
  v.ask({id:'qa-job',voice:true,status:'confirm',approvalId:'qa-approval',question:'ทดสอบยืนยันหรือไม่',answerNeeded:false});
  socket.emit({type:'agent_response',agent_response_event:{agent_response:'ใช่',event_id:1}});await new Promise(r=>setTimeout(r,30));if(answers)throw Error('agent approved itself');
  socket.emit({type:'user_transcript',user_transcription_event:{user_transcript:'ใช่',event_id:2}});
  socket.emit({type:'interruption',interruption_event:{event_id:3}});
  await new Promise(r=>setTimeout(r,400));interrupted=l.status.textContent.includes('พูดแทรก');
  const result={sdk:window.ElevenLabsClient!==undefined,connected:!!v.session,micChunks:socket.messages.filter(e=>e.user_audio_chunk).length,toolCalls,toolResults:socket.messages.filter(e=>e.type==='client_tool_result'&&e.tool_call_id==='qa-call'&&!e.is_error).length,answers,interrupted};
  v.stop();await new Promise(r=>setTimeout(r,150));result.stopped=!v.active&&socket.readyState===3;return result;
 }finally{v.stop();v.host=originalHost;v.computer=originalComputer;window.WebSocket=OriginalSocket;l.stop();await v.load();l.hide();}
}
(async()=>{const result=await inspect('('+test.toString()+')()');console.log(JSON.stringify(result));assert.ok(result.connected&&result.micChunks>0&&result.toolCalls===1&&result.toolResults===1&&result.answers===1&&result.interrupted&&result.stopped);console.log('PASS real ElevenLabs SDK + local AudioWorklets/microphone, mocked service transport, tool callback/result, transcript approval, interruption and stop. No audio sent to ElevenLabs.');})().catch(e=>{console.error(e);process.exitCode=1;});

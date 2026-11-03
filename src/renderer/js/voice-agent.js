import {confirmationAnswer} from './voice-commands.js';
const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
export class VoiceAgent {
 constructor({host,listening,speech,computer,loadSDK=async()=>window.ElevenLabsClient.Conversation}){
  Object.assign(this,{host,listening,speech,computer,loadSDK});this.serial=0;this.seenUserEvents=new Set();this.ownedJobs=new Set();this.settings={engine:'classic'};
  const box=listening.root.firstElementChild;
  const field=(text,node,parent=box)=>{const label=el('label',text);label.append(node);parent.append(label);return node;};
  this.engine=el('select');for(const [value,text]of [['classic','ระบบเดิม — Local / Gemini / OpenAI'],['elevenlabs','ElevenLabs Voice Agent — สนทนาต่อเนื่อง / พูดแทรก']]){const o=el('option',text);o.value=value;this.engine.append(o);}
  const engineLabel=el('label','ระบบสนทนาด้วยเสียง');engineLabel.append(this.engine);box.insertBefore(engineLabel,box.children[3]);
  this.group=el('div');this.group.className='voice-agent-settings';box.insertBefore(this.group,engineLabel.nextSibling);
  this.group.append(el('p','โหมดนี้ส่งเสียงไมค์ บทสนทนา และผลเครื่องมือไป ElevenLabs ใช้เครดิตในบัญชีของคุณ แยกจาก AI ที่ใช้วางแผนงานควบคุมเครื่อง เลือกรอคำเรียกได้: ตรวจชื่อในเครื่องก่อน แล้วเปิดการสนทนาออนไลน์จนกดหยุด'));
  this.key=field('ElevenLabs API key — เว้นว่างใช้คีย์เดิม',el('input'),this.group);this.key.type='password';this.key.autocomplete='off';this.key.maxLength=512;
  this.keyState=el('p');this.group.append(this.keyState);
  this.voice=field('เสียง ElevenLabs',el('select'),this.group);
  this.voiceId=field('Voice ID — วางเองได้หากไม่อยู่ในรายการ',el('input'),this.group);this.voiceId.maxLength=150;this.voice.onchange=()=>this.voiceId.value=this.voice.value;
  this.language=field('ภาษาสนทนา',el('select'),this.group);for(const [value,text]of [['th','ไทย'],['en','English']]){const o=el('option',text);o.value=value;this.language.append(o);}
  this.agentId=field('Agent ID — สร้างจากปุ่มด้านล่าง หรือใส่ของคุณ',el('input'),this.group);this.agentId.maxLength=150;
  this.consent=el('input');this.consent.type='checkbox';const consentLabel=el('label');consentLabel.append(this.consent,document.createTextNode(' ยินยอมส่งเสียงและข้อมูลการสนทนา/ผลเครื่องมือไป ElevenLabs และใช้เครดิตบัญชี'));this.group.append(consentLabel);
  const actions=el('div');actions.className='speech-actions';
  const voices=el('button','โหลดรายชื่อเสียง');voices.onclick=()=>this.run(async()=>{await this.save();const list=await host.agentVoices();this.voice.replaceChildren();for(const v of list){const o=el('option',v.name);o.value=v.id;this.voice.append(o);}if(!this.voiceId.value&&list[0])this.voiceId.value=list[0].id;listening.setStatus('โหลดเสียงแล้ว เลือกเสียงแล้วกดสร้าง/อัปเดต Agent');});
  const setup=el('button','สร้าง / อัปเดต Agent และเครื่องมือ');setup.onclick=()=>this.run(async()=>{await this.save();const result=await host.agentConfigure();this.agentId.value=result.agentId;await this.load();listening.setStatus(`Agent พร้อม · เครื่องมือ ${result.tools} รายการ · กดเริ่มฟังเพื่อเชื่อมต่อ`);});
  const save=el('button','บันทึกระบบเสียง');save.onclick=()=>this.run(async()=>{await this.save();listening.setStatus('บันทึกแล้ว');});
  const forget=el('button','ลบคีย์ที่บันทึกไว้');forget.onclick=()=>this.run(async()=>{this.stop();await host.agentForgetKey();this.key.value='';await this.load();listening.setStatus('ลบคีย์ในเครื่องแล้ว การเพิกถอนคีย์ทำได้ที่เว็บไซต์ ElevenLabs');});actions.append(voices,setup,save,forget);this.group.append(actions,el('p','การอัปเดตจะเปลี่ยน prompt และเครื่องมือของ Agent ID ที่ระบุ คีย์ต้องมีสิทธิ์ Agents Read/Write, Tools Read/Write และ Voices Read · เครื่องมือใช้สิทธิ์จากหน้า “ควบคุมเครื่อง”'));
  this.mute=el('button','พักไมค์ชั่วคราว');this.mute.hidden=true;this.mute.onclick=()=>{this.muted=!this.muted;this.session?.setMicMuted(this.muted);this.mute.textContent=this.muted?'เปิดไมค์ต่อ':'พักไมค์ชั่วคราว';};this.group.append(this.mute);
  this.engine.onchange=()=>{this.listening.stop();this.refresh();};this.refresh();
 }
 get active(){return Boolean(this.session||this.starting);}
 get selected(){return this.engine.value==='elevenlabs';}
 refresh(){this.group.hidden=!this.selected;if(this.listening.testButton)this.listening.testButton.hidden=this.selected;this.listening.mode.options[0].textContent=this.selected?'กดเริ่ม / จบสนทนาออนไลน์':'กดพูด — กดเริ่ม / หยุด';for(const key of ['provider','localModel','silence','vocabulary','key','follow','threshold','review','consent'])this.listening[key].parentElement.hidden=this.selected;this.listening.mode.parentElement.hidden=false;this.listening.words.parentElement.hidden=false;}
 async run(fn){try{await fn();}catch(e){this.listening.setStatus(String(e.message).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,''));}}
 async load(){const info=await this.host.agentInfo();this.settings=info.settings;this.engine.value=info.settings.engine;this.agentId.value=info.settings.agentId;this.voiceId.value=info.settings.voiceId;this.language.value=info.settings.language;this.consent.checked=info.settings.consent;this.keyState.textContent=info.hasKey?'✓ มีคีย์บันทึกไว้แล้ว':'ยังไม่มีคีย์ ElevenLabs';this.refresh();}
 async save(){this.stop();const value={engine:this.engine.value,agentId:this.agentId.value.trim(),voiceId:this.voiceId.value.trim(),language:this.language.value,consent:this.consent.checked};this.settings=await this.host.agentSave(value,this.key.value.trim());this.key.value='';return this.settings;}
 configure(config){if(config.visible===false||this.characterId&&this.characterId!==config.characterId)this.stop();this.characterId=config.characterId;this.volume=config.muted?0:config.volume??0.7;this.session?.setVolume({volume:this.volume});}
 async start(command=''){
  if(this.active)return;this.listening.releaseMic();this.speech.stop();const serial=++this.serial;this.starting=true;this.seenUserEvents.clear();this.listening.indicator.hidden=false;this.listening.indicator.textContent='■ ยกเลิกการเชื่อมต่อ ElevenLabs';
  try{
   const info=await this.host.agentStart();if(serial!==this.serial)return;
   const SDK=await this.loadSDK();if(serial!==this.serial)return;
   const tools=Object.fromEntries(info.tools.map(name=>[name,async args=>{
    if(serial!==this.serial)throw Error('การสนทนาจบแล้ว');
    this.listening.hide();this.computer.hide();
    try{return await this.host.agentTool({sessionId:info.sessionId,name,args});}catch(e){return JSON.stringify({status:"not_executed",message:String(e.message).replace(/^Error invoking remote method [^:]+: (?:Error: )?/,"")});}
   }]));
   const session=await SDK.startSession({signedUrl:info.signedUrl,connectionType:'websocket',inputDeviceId:this.listening.mic.value||undefined,
    workletPaths:{rawAudioProcessor:new URL('../vendor/rawAudioProcessor.js',import.meta.url).href,audioConcatProcessor:new URL('../vendor/audioConcatProcessor.js',import.meta.url).href},
    overrides:{agent:{language:info.settings.language,prompt:{prompt:info.prompt}},...(info.settings.voiceId?{tts:{voiceId:info.settings.voiceId}}:{})},clientTools:tools,
    onMessage:event=>{if(serial===this.serial)this.message(event).catch(e=>this.listening.setStatus(e.message));},
    onModeChange:({mode})=>{if(serial===this.serial){this.speaking=mode==='speaking';this.listening.setStatus(this.speaking?'ElevenLabs กำลังตอบ — พูดแทรกได้':'ElevenLabs ฟังอยู่');}},
    onInterruption:()=>{if(serial===this.serial){this.speaking=false;this.listening.setStatus('ได้ยินการพูดแทรก กำลังฟังต่อ…');}},
    onDisconnect:details=>this.disconnected(details,serial),
    onError:()=>{if(serial===this.serial){this.stop();this.listening.setStatus('ElevenLabs เชื่อมต่อหรือประมวลผลไม่สำเร็จ ตรวจคีย์ เครดิต และ Agent');}}
   });
   if(serial!==this.serial){await session.endSession();return;}
   this.session=session;this.starting=false;this.session.setVolume({volume:this.volume??0.7});this.muted=false;this.mute.hidden=false;this.mute.textContent='พักไมค์ชั่วคราว';
   this.listening.indicator.hidden=false;this.listening.indicator.textContent='■ จบสนทนา ElevenLabs / ปิดไมค์';this.listening.startButton.textContent='■ จบสนทนา ElevenLabs';this.listening.hide();if(command)this.session.sendUserMessage(command);
  }catch(e){if(serial===this.serial){this.stop();throw Error(String(e.message).includes('remote method')?e.message:'เริ่ม ElevenLabs ไม่สำเร็จ ตรวจไมค์ Agent ID และการอนุญาตของ Agent');}}
 }
 disconnected(details,serial){
  if(serial!==this.serial)return;
  const rearm=details?.reason==='agent'&&this.selected&&['wake','always'].includes(this.listening.settings?.mode);this.stop();this.listening.setStatus('จบการสนทนา ElevenLabs แล้ว');
  if(rearm){const generation=this.serial,captureSerial=this.listening.serial;setTimeout(()=>{if(generation!==this.serial||captureSerial!==this.listening.serial||!this.selected)return;this.listening.followUntil=0;this.listening.capture(captureSerial).catch(e=>this.listening.error(e));},500);}
 }
 async message(event){
  if(typeof event.message!=='string'||event.message.length>8000)return;
  const user=event.role==='user'||event.source==='user';
  if(user&&event.event_id!==undefined){if(this.seenUserEvents.has(event.event_id))return;this.seenUserEvents.add(event.event_id);}
  this.listening.heard.value=(user?'คุณ: ':'Rocky: ')+event.message;
  if(!user)return;
  if(/^(หยุดงาน|ยกเลิกงาน|stop|cancel)[.!\s]*$/i.test(event.message)){this.host.computerStop();return;}
  if(this.pending&&event.message!==this.injected)await this.answer(event.message);
  else if(this.computer.state?.status==='running'&&event.message!==this.injected)this.host.computerTell(event.message).catch(()=>{});
 }
 ask(state){
  if(!this.active)return false;this.pending={...state};
  this.listening.confirmButtons.hidden=false;this.listening.confirmYes.hidden=Boolean(state.answerNeeded);this.listening.root.hidden=false;this.listening.onVisibility(true);this.listening.setStatus(state.question);
  this.injected='LOCAL JOB QUESTION: '+state.question+' Ask the user this question now and wait. Local client handles their answer. Do not call any tool to approve.';
  this.session?.sendUserMessage(this.injected);return true;
 }
 async answer(text){
  const pending=this.pending;if(!pending)return;const yes=confirmationAnswer(text);
  if(yes===null&&!pending.answerNeeded){this.listening.setStatus('กรุณาตอบ “ใช่” หรือ “ยกเลิก”');return;}
  this.pending=null;this.listening.confirmButtons.hidden=true;this.listening.hide();await this.computer.answerState(pending,yes!==false,pending.answerNeeded?text:'');
 }
 state(state){
  if(!state.voice)return false;if(!this.active&&!this.ownedJobs.has(state.id))return false;if(this.active)this.ownedJobs.add(state.id);
  if(!['running','confirm'].includes(state.status)){
   this.pending=null;this.ownedJobs.delete(state.id);this.listening.confirmButtons.hidden=true;this.listening.hide();
   this.injected='LOCAL JOB RESULT ('+state.status+'): '+state.message+'. Report this verified result briefly. Do not repeat the job.';this.session?.sendUserMessage(this.injected);
  }return true;
 }
 level(){return this.session?.getOutputVolume?.()||0;}
 stop(){
  const had=this.active;this.serial++;this.starting=false;this.pending=null;this.speaking=false;const old=this.session;this.session=null;
  if(had){this.host.agentStop();Promise.resolve(old?.endSession()).catch(()=>{});this.listening.indicator.hidden=true;this.listening.startButton.textContent='🎤 เริ่มฟัง';this.listening.confirmButtons.hidden=true;}
  this.mute.hidden=true;
 }
}

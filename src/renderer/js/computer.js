const el=(tag,text='')=>{const n=document.createElement(tag);n.textContent=text;return n;};
export class Computer {
  constructor({host,root,indicator,onVisibility,onStart,onQuestion,onState,onPermission}) {
    Object.assign(this,{host,root,indicator,onVisibility,onStart,onQuestion,onState,onPermission});root.className='character-picker';
    const box=el('div');box.className='character-picker__box speech-box';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','ควบคุมเครื่อง');
    const close=el('button','✕');close.className='speech-close';close.setAttribute('aria-label','ปิดแผงควบคุม');close.onclick=()=>this.hide();
    box.append(el('h1','ควบคุมเครื่อง'),close,el('p','บอกงาน → อ่านหน้าต่าง → คลิก/พิมพ์ → ตรวจผลทุกขั้น · Ctrl+Alt+X หยุดทันที · งานละไม่เกิน 30 ขั้น / 10 นาที'));
    const label=el('label','งานที่ต้องการ');this.task=el('textarea');this.task.rows=3;this.task.maxLength=2000;this.task.placeholder='เช่น เปิด Notepad แล้วพิมพ์ สวัสดีจาก Uncle';label.append(this.task);box.append(label);
    this.provider=el('p');box.append(this.provider);
    this.consent=el('input');this.consent.type='checkbox';const consent=el('label');consent.append(this.consent,document.createTextNode(' อนุญาตอ่านชื่อหน้าต่างและข้อความในแอป ส่งให้ AI ที่เลือก และใช้เมาส์/คีย์บอร์ดสำหรับงานที่ฉันสั่ง (จำการอนุญาตไว้ ปิดได้ที่นี่)'));box.append(consent);
    this.voice=el('input');this.voice.type='checkbox';const voice=el('label');voice.append(this.voice,document.createTextNode(' ให้คำสั่งเสียงเริ่มงานได้อัตโนมัติ และถาม–ตอบขั้นตอนด้วยเสียง'));box.append(voice);
    this.images=el('input');this.images.type='checkbox';const images=el('label');images.append(this.images,document.createTextNode(' ใช้ภาพหน้าต่างด้วย — สำหรับแอปที่อ่านปุ่มไม่ได้ ต้องเลือก AI ที่รับภาพได้'));box.append(images);
    const level=el('label','ความปลอดภัย');this.security=el('select');
    for(const [value,text] of [['lockdown','Lockdown — อ่านหน้าจออย่างเดียว ไม่คลิกไม่พิมพ์'],['guarded','Guarded — ถามก่อนทุกขั้นที่มีผล เช่น ส่ง บันทึก ลบ (แนะนำ)'],['trusted','Trusted — ถามเฉพาะเรื่องเงิน ลบ ติดตั้ง ปิดแอป และปิดเครื่อง'],['blackwall','Blackwall — ไม่ถามเลย ทำทุกขั้นเอง']]){const o=el('option',text);o.value=value;this.security.append(o);}
    level.append(this.security);box.append(level);
    // the level's nine switches (on: she does it without asking), then images as the tenth
    const PRESETS={lockdown:[],guarded:['apps','media'],trusted:['apps','clicks','keys','windows','media','games','send'],blackwall:['apps','clicks','keys','windows','media','power','games','send','money']};
    const NAMES={apps:'เปิดแอป เว็บ และเพลง',clicks:'คลิกตามตำแหน่งบนภาพ',keys:'กดคีย์ลัด',windows:'ปิดแอปและหน้าต่าง',media:'ปรับเสียงและสั่งเพลง',power:'ปิด รีสตาร์ท ล็อก พักเครื่อง',games:'กดค้าง ลาก และปุ่มเกม',send:'ส่ง โพสต์ บันทึก ยืนยัน',money:'ซื้อ จ่าย ลบ ติดตั้ง'};
    const grid=el('div');grid.className='security-switches';this.switches={};
    Object.entries(NAMES).forEach(([key,text],i)=>{const box2=el('input');box2.type='checkbox';const l=el('label');l.append(box2,document.createTextNode(` ${i+1}. ${text}`));grid.append(l);this.switches[key]=box2;});
    const imageLabel=this.images.parentElement;imageLabel.lastChild.textContent=' 10. ส่งภาพหน้าต่างให้ AI — สำหรับแอปที่อ่านปุ่มไม่ได้ ต้องเลือก AI ที่รับภาพได้';grid.append(imageLabel);
    box.append(el('p','ติ๊ก = ทำเองโดยไม่ถาม · ไม่ติ๊ก = ถามก่อนทุกครั้ง'),grid);
    this.security.onchange=()=>{for(const [k,b] of Object.entries(this.switches))b.checked=PRESETS[this.security.value].includes(k);};
    box.append(el('p','ส่งเฉพาะข้อมูลของงานนี้ ไม่เก็บภาพลงไฟล์ · ทุกระดับไม่กรอกรหัสผ่านให้ และไม่พิมพ์คำสั่งใน Terminal หรือ PowerShell'));
    const actions=el('div');actions.className='speech-actions';this.start=el('button','▶ เริ่มทำงาน');this.start.onclick=()=>this.begin();const stop=el('button','■ หยุดงาน');stop.onclick=()=>host.computerStop();const save=el('button','บันทึกสิทธิ์');save.onclick=async()=>{try{await host.computerSave({consent:this.consent.checked,voice:this.voice.checked,images:this.images.checked,security:this.security.value,switches:Object.fromEntries(Object.entries(this.switches).map(([k,b])=>[k,b.checked]))});this.status.textContent='บันทึกสิทธิ์แล้ว';}catch(e){this.status.textContent=e.message;}};actions.append(this.start,stop,save);box.append(actions);
    this.status=el('p','พร้อมรับงาน');this.status.setAttribute('role','status');box.append(this.status);
    this.confirm=el('div');this.confirm.className='speech-actions';this.confirm.hidden=true;
    this.reply=el('input');this.reply.maxLength=1000;this.reply.placeholder='ตอบข้อมูลเพิ่มเติม หรือเข้าสู่ระบบเองแล้วกดยืนยัน';this.reply.setAttribute('aria-label','คำตอบเพิ่มเติม');this.confirm.append(this.reply);
    const yes=el('button','ยืนยันขั้นตอนนี้');yes.onclick=()=>this.answer(true);const no=el('button','ยกเลิกงาน');no.onclick=()=>this.answer(false);this.confirm.append(yes,no);box.append(this.confirm);
    this.log=el('ol');box.append(this.log);root.append(box);
    indicator.onclick=()=>host.computerStop();root.addEventListener('keydown',e=>{if(e.key==='Escape'){host.computerStop();this.hide();}if(e.key==='Tab'){const nodes=[...box.querySelectorAll('button,input,textarea')].filter(n=>!n.disabled&&!n.closest('[hidden]'));if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}});
    for(const event of ['mousedown','mouseup','click'])root.addEventListener(event,e=>e.stopPropagation());
    window.addEventListener('beforeunload',()=>host.computerStop());host.onComputerState(state=>this.update(state));
  }
  get open(){return !this.root.hidden;}
  async load(){const info=await this.host.computerInfo();this.consent.checked=info.settings.consent;this.voice.checked=info.settings.voice;this.images.checked=info.settings.images;this.security.value=info.settings.security||'guarded';for(const [k,b] of Object.entries(this.switches))b.checked=Boolean(info.settings.switches?.[k]);this.provider.textContent=`AI ที่ใช้: ${info.provider} — เปลี่ยนได้ในตั้งค่า AI`;return info;}
  async show(task){await this.load();if(task)this.task.value=task;this.root.hidden=false;this.onVisibility(true);this.task.focus();}
  hide(){this.root.hidden=true;this.onVisibility(false);}
  async request(task,{voice=false}={}){
    await this.load();this.task.value=task;
    if(this.consent.checked&&(!voice||this.voice.checked))return this.begin({voice});
    if(voice&&this.onPermission){this.onPermission({question:`อนุญาตให้อ่านหน้าต่าง ส่งข้อมูลให้ ${this.provider.textContent} และใช้เมาส์คีย์บอร์ดสำหรับงานนี้ พร้อมเปิดเริ่มงานด้วยเสียงครั้งต่อไปไหมคะ? งานคือ ${task}`,execute:async()=>{this.consent.checked=true;this.voice.checked=true;await this.begin({voice:true});},cancel:()=>this.hide()});return;}
    await this.show(task);
  }
  async begin({voice=false}={}){try{
    if(!this.task.value.trim()||!this.consent.checked)throw new Error('ระบุงานและอนุญาตอ่านหน้าจอก่อนเริ่ม');
    await this.host.computerSave({consent:this.consent.checked,voice:this.voice.checked,images:this.images.checked,security:this.security.value,switches:Object.fromEntries(Object.entries(this.switches).map(([k,b])=>[k,b.checked]))});
    this.onStart({voice});this.start.disabled=true;
    await this.host.computerStart({task:this.task.value,consent:true,images:this.images.checked,voice});this.hide();
  }catch(e){this.start.disabled=false;this.status.textContent=e.message;this.root.hidden=false;this.onVisibility(true);this.onState?.({status:'error',voice,message:e.message,steps:[]});}}
  async answer(yes){return this.answerState(this.state,yes,this.state?.answerNeeded?this.reply.value:'');}
  async answerState(state,yes,text=''){this.hide();await this.host.computerAnswer({yes,text,jobId:state.id,approvalId:state.approvalId});this.reply.value='';}
  update(state){this.state=state;this.onState?.(state);this.status.textContent=state.message;this.log.replaceChildren(...state.steps.map(s=>el('li',`${s.status==='done'?'✓':'…'} ${s.label}`)));const active=['running','confirm'].includes(state.status);this.start.disabled=active;this.indicator.hidden=!active;this.indicator.textContent=`■ หยุดงาน · ${state.message}`;this.confirm.hidden=state.status!=='confirm';
    this.reply.hidden=!state.answerNeeded;
    if(state.status==='confirm'){if(!this.onQuestion?.(state)){this.root.hidden=false;this.onVisibility(true);(state.answerNeeded?this.reply:this.confirm.querySelector('button')).focus();}}
    // the result in the dialog when it went wrong; one that worked she says in her bubble (app.js), one
    // started by voice she says aloud, and one you stopped needs nothing
    else if(!active&&!['stopped','done'].includes(state.status)&&!state.voice&&!state.remote){this.root.hidden=false;this.onVisibility(true);}
  }
}

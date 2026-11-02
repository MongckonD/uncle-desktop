const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {createPhone}=require('../src/main/phone');const {createAgentPhone}=require('../src/main/agent-phone');const {createVibe}=require('../src/main/vibe');

function fixture(t){
 const ws=fs.mkdtempSync(path.join(os.tmpdir(),'uncle-coding-'));t.after(()=>fs.rmSync(ws,{recursive:true,force:true}));
 const out=[],calls=[],sessions=[],states={};let next=0,project=null,approve=true;
 const tg={send:async(chat,text,buttons)=>{out.push({chat,text,buttons});return {message_id:out.length};},edit:async(chat,id,text)=>out.push({chat,id,text}),sendFile:async(chat,kind,bytes,name)=>out.push({chat,kind,name,text:bytes.toString()}),typing:async()=>{},download:async()=>Buffer.from('fixture text')};
 const settings=()=>({chatId:1,allowedUsers:[11,22],project,requirePin:true,switches:{chat:true,approve}});
 const vibe=createVibe({getSettings:()=>({workspace:ws}),saveState:(n,s)=>states[n]=s});
 const agents={start:o=>{const id='s'+(++next);sessions.push({...o,id,status:'idle'});calls.push(['start',id,o.title]);return id;},list:()=>sessions,send:async(id,text)=>calls.push(['send',id,text]),answer:()=>true,interrupt:id=>calls.push(['interrupt',id]),close:id=>{const at=sessions.findIndex(s=>s.id===id);if(at<0)return false;sessions.splice(at,1);return true;}};
 const hub=createAgentPhone({telegram:tg,agents,settings,projectDir:vibe.dirOf,setProject:n=>{project=n;},agentOf:n=>states[n]?.agent||'claude'});
 const coding={...vibe,shot:async url=>{calls.push(['shot',url]);return Buffer.from('PNG');},pullRequest:async n=>{calls.push(['pr',n]);return 'fake-pr';}};
 const phone=createPhone({telegram:tg,hub,coding,settings,setProject:n=>{project=n;},checkPin:p=>p==='9876',answer:async r=>{calls.push(['chat',r.text]);return 'chat reply';},media:async()=> 'd2F2',transcribe:async()=> 'voice task',speak:async()=>null});
 const text=(chatId,s)=>phone.onMessage({kind:'text',chatId,userId:chatId===1?11:22,text:s});
 return {ws,out,calls,sessions,phone,hub,vibe,text};
}

test('coding commands: create/list/select/open, per-chat routing, voice/photo/file and /chat',async t=>{
 const f=fixture(t);
 await f.text(1,'/create alpha');await f.text(2,'/create beta codex');
 await f.text(1,'/projects');assert.match(f.out.at(-1).text,/alpha/);
 await f.text(1,'task alpha');await f.text(2,'task beta');
 assert.deepEqual(f.calls.filter(c=>c[0]==='send').slice(-2),[['send','s1','task alpha'],['send','s2','task beta']]);
 await f.phone.onMessage({kind:'voice',chatId:2,userId:22,fileId:'v'});
 assert.deepEqual(f.calls.at(-1),['send','s2','voice task']);
 await f.phone.onMessage({kind:'photo',chatId:1,userId:11,fileId:'p',caption:'image task'});
 assert.match(f.calls.at(-1)[2],/image task/);assert.equal(f.calls.at(-1)[1],'s1');
 assert.equal(fs.readdirSync(path.join(f.ws,'alpha','.uncle','inbox')).length,1);
 await f.phone.onMessage({kind:'file',chatId:2,userId:22,fileId:'f',name:'spec.txt',mime:'text/plain',size:12});
 assert.equal(f.calls.at(-1)[1],'s2');assert.match(f.calls.at(-1)[2],/fixture text/);
 await f.text(1,'/chat');assert.match(f.out.at(-1).text,/กลับมาคุย/);
 await f.text(1,'hello');assert.deepEqual(f.calls.at(-1),['chat','hello']);
 await f.text(1,'/project beta');await f.text(1,'/code');assert.equal(f.hub.currentFor(1),'s2');
 await f.hub.onEvent({id:'s1',type:'turn',status:'done'});await f.hub.onEvent({id:'s2',type:'turn',status:'done'});
});

test('coding commands: real git diff/commit/undo, PIN gating, PR and screenshot dispatch',async t=>{
 const f=fixture(t);await f.text(1,'/create alpha');
 const dir=f.vibe.dirOf('alpha');
 execFileSync('git',['config','user.name','Hub Test'],{cwd:dir});execFileSync('git',['config','user.email','hub@example.invalid'],{cwd:dir});
 fs.writeFileSync(path.join(dir,'hello.txt'),'one');
 await f.text(1,'/diff');assert.ok(f.out.some(m=>m.name==='alpha.diff'&&m.text.includes('hello.txt')));
 await f.text(1,'/commit baseline');assert.match(f.out.at(-1).text,/baseline/);
 fs.writeFileSync(path.join(dir,'hello.txt'),'two');await f.text(1,'/commit second');
 await f.text(1,'/undo wrong');assert.match(f.out.at(-1).text,/PIN/);assert.equal(fs.readFileSync(path.join(dir,'hello.txt'),'utf8'),'two');
 await f.text(1,'/undo 9876');assert.equal(fs.readFileSync(path.join(dir,'hello.txt'),'utf8'),'one');
 await f.text(1,'/pr wrong');assert.equal(f.calls.some(c=>c[0]==='pr'),false);
 await f.text(1,'/pr 9876');assert.deepEqual(f.calls.at(-1),['pr','alpha']);
 await f.text(1,'/shot http://localhost:3000');assert.deepEqual(f.calls.at(-1),['shot','http://localhost:3000']);
 assert.equal(f.out.at(-1).kind,'photo');
});


test('coding commands: git mutations are blocked while the selected project is working',async t=>{
 const f=fixture(t);await f.text(1,'/create alpha');f.sessions[0].status='working';
 for(const cmd of ['/commit unsafe','/undo 9876','/pr 9876']){await f.text(1,cmd);assert.match(f.out.at(-1).text,/กำลังทำงาน/);}
 assert.equal(f.calls.some(c=>c[0]==='pr'),false);
});

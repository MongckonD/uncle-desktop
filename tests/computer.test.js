'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {actionFrom,needsConfirmation,createComputer}=require('../src/main/computer');
const view={app:{window:11,title:'Test editor',process:'editor',x:0,y:0,width:800,height:600},targets:[{id:1,role:'Edit',name:'Text',value:'สวัสดี',x:10,y:10},{id:2,role:'Button',name:'Send',value:'',x:10,y:80}]};
const wait=()=>new Promise(r=>setTimeout(r,10));

test('Windows volume prelude finishes before browser planning and still obeys permission gates',async()=>{
 const order=[];let last;
 const native={request:async a=>{if(a.action==='click')order.push('browser click');return a.action==='read'?structuredClone(view):a.action==='windows'?[view.app]:{};},stop(){}};
 let plans=0;const c=createComputer({native,system:async()=>{order.push('windows volume');return 'volume verified';},decide:async()=>JSON.stringify(plans++?{tool:'done',evidence:'สวัสดี',reason:'verified'}:{tool:'click',target:2,reason:'unmute browser'}),notify:s=>{last=s;}});
 const firstAction={tool:'media',action:'unmute',reason:'Windows first'};
 c.start({task:'unmute both',consent:true,firstAction,security:'blackwall'});while(c.busy)await wait();assert.deepEqual(order,['windows volume','browser click']);assert.equal(last.status,'done');
 order.length=0;c.start({task:'unmute both',consent:true,firstAction,security:'lockdown'});while(c.busy)await wait();assert.deepEqual(order,[]);assert.equal(last.status,'error');
});
test('computer actions reject invented tools, console keys, invalid URLs and control-character typing',()=>{
 for(const a of [{tool:'shell',reason:'test'},{tool:'key',text:'WIN+R',reason:'test'},{tool:'type',text:'x\u0001run',reason:'test'},{tool:'open_website',url:'file:///C:/a',reason:'test'},{tool:'done',reason:'test'}])assert.throws(()=>actionFrom(JSON.stringify(a)));
 assert.equal(actionFrom('{"tool":"type","text":"สวัสดี","target":1,"reason":"พิมพ์ไทย"}').text,'สวัสดี');
 assert.ok(needsConfirmation({tool:'click',target:2},view));assert.ok(needsConfirmation({tool:'click',x:1,y:1},view));assert.ok(needsConfirmation({tool:'key',text:'CTRL+S'},view));assert.equal(needsConfirmation({tool:'type',target:1},view),false);
});
function service(decisions,customNative){const states=[],actions=[];let calls=0;const native=customNative||{request:async a=>{actions.push(a);return a.action==='read'?structuredClone(view):a.action==='windows'?[view.app]:{ok:true}},stop(){}};const c=createComputer({native,decide:async()=>JSON.stringify(decisions[calls++]||{tool:'done',evidence:'สวัสดี',reason:'ตรวจข้อความแล้ว'}),openApp:async()=>{},openSite:async()=>{},notify:s=>states.push(structuredClone(s))});return {c,states,actions};}
test('computer refuses false success with no visible evidence',async()=>{const {c,states}=service([{tool:'done',evidence:'invented',reason:'สำเร็จ'}]);c.start({task:'ทดสอบ',consent:true});while(c.busy)await wait();assert.equal(states.at(-1).status,'error');assert.match(states.at(-1).message,/ยืนยัน/);});
test('computer performs Unicode type, re-observes, then finishes only with screen evidence',async()=>{const {c,states,actions}=service([{tool:'type',target:1,text:'สวัสดี',reason:'พิมพ์ไทย'}]);c.start({task:'พิมพ์ทดสอบ',consent:true});while(c.busy)await wait();assert.equal(states.at(-1).status,'done');assert.equal(actions.filter(a=>a.action==='type').length,1);assert.ok(actions.filter(a=>a.action==='read').length>=3);});
test('risky click waits for a real user answer; no cancels without input',async()=>{const {c,states,actions}=service([{tool:'click',target:2,reason:'ส่งข้อความ'}]);c.start({task:'ทดสอบ',consent:true});while(states.at(-1)?.status!=='confirm')await wait();assert.equal(actions.filter(a=>a.action==='click').length,0);c.answer(false);while(c.busy)await wait();assert.equal(actions.filter(a=>a.action==='click').length,0);assert.equal(states.at(-1).status,'error');});
test('foreground changes invalidate a planned action',async()=>{let reads=0;const native={request:async a=>a.action==='read'?{...structuredClone(view),app:{...view.app,window:++reads>2?22:11}}:a.action==='windows'?[view.app]:{ok:true},stop(){}};const {c,states}=service([{tool:'type',target:1,text:'test',reason:'test'}],native);c.start({task:'test',consent:true});while(c.busy)await wait();assert.equal(states.at(-1).status,'error');assert.match(states.at(-1).message,/หน้าต่างเปลี่ยน/);});
test('Stop cancels pending model output; a late answer never types',async()=>{let resolve;const {c,actions,states}=service([]); // Separate pending model to exercise cancellation.
 const native={request:async a=>{actions.push(a);return a.action==='read'?view:a.action==='windows'?[view.app]:{}},stop(){}};
 const pending=createComputer({native,decide:()=>new Promise(r=>resolve=r),openApp:async()=>{},openSite:async()=>{},notify:s=>states.push(s)});
 pending.start({task:'test',consent:true});while(!resolve)await wait();pending.stop();resolve('{"tool":"type","target":1,"text":"bad","reason":"late"}');await wait();assert.equal(actions.filter(a=>a.action==='type').length,0);assert.equal(states.at(-1).status,'stopped');assert.throws(()=>c.start({task:'test',consent:false}));
});

test('ask passes the user clarification back to the next model turn',async()=>{
 const states=[];let calls=0,history;const native={request:async a=>a.action==='read'?structuredClone(view):a.action==='windows'?[view.app]:{},stop(){}};
 const c=createComputer({native,decide:async request=>{history=request.history;return JSON.stringify(++calls===1?{tool:'ask',question:'ต้องการข้อความอะไร',reason:'ขอรายละเอียด'}:{tool:'done',evidence:'สวัสดี',reason:'เห็นข้อความแล้ว'})},openApp:async()=>{},openSite:async()=>{},notify:s=>states.push(s)});
 c.start({task:'test',consent:true});while(states.at(-1)?.status!=='confirm')await wait();assert.equal(states.at(-1).answerNeeded,true);c.answer({yes:true,text:'ทดสอบคำตอบ',jobId:states.at(-1).id,approvalId:states.at(-1).approvalId});while(c.busy)await wait();assert.equal(history.at(-1).user,'ทดสอบคำตอบ');assert.equal(states.at(-1).status,'done');
});
test('coordinate fallback requires image, approval and maps screenshot to window pixels',async()=>{
 let clicks=[],states=[];const native={request:async a=>{if(a.action==='click')clicks.push(a);return a.action==='read'?structuredClone(view):a.action==='windows'?[view.app]:{}},stop(){}};
 let calls=0;const c=createComputer({native,picture:async()=>({data:'fixture',width:400,height:300}),decide:async()=>JSON.stringify(++calls===1?{tool:'click',x:100,y:50,reason:'คลิกตามภาพ'}:{tool:'done',evidence:'สวัสดี',reason:'ตรวจแล้ว'}),openApp:async()=>{},openSite:async()=>{},notify:s=>states.push(s)});
 c.start({task:'test',consent:true,images:true});while(states.at(-1)?.status!=='confirm')await wait();assert.equal(clicks.length,0);c.answer(true);while(c.busy)await wait();assert.equal(clicks[0].x,200);assert.equal(clicks[0].y,100);
});

test('extended tool schemas reject malformed destinations, durations, power and note names',()=>{
 for(const a of [{tool:'drag',target:1,endX:-1,reason:'x'},{tool:'hold_key',text:'CTRL',seconds:50,reason:'x'},{tool:'note',name:'../file',text:'x',reason:'x'},{tool:'media',action:'volume_set',level:101,reason:'x'},{tool:'power',action:'format',reason:'x'},{tool:'shortcut',name:'run_command',reason:'x'}])assert.throws(()=>actionFrom(JSON.stringify(a)));
 assert.equal(actionFrom(JSON.stringify({tool:'type',target:1,text:'ไทย\nEnglish',reason:'หลายบรรทัด'})).text,'ไทย\nEnglish');
});
test('stale or duplicate job approval cannot authorize the next question',async()=>{
 const {c,states}=service([{tool:'ask',question:'one',reason:'one'},{tool:'ask',question:'two',reason:'two'}]);c.start({task:'test',consent:true});while(states.at(-1)?.status!=='confirm')await wait();const first={yes:true,jobId:states.at(-1).id,approvalId:states.at(-1).approvalId};c.answer(first);while(states.at(-1)?.approvalId===first.approvalId||states.at(-1)?.status!=='confirm')await wait();assert.throws(()=>c.answer(first),/หมดอายุ/);assert.equal(states.at(-1).status,'confirm');c.stop();
});
test('wait_for observes the same window and note substitution is bounded to seen text',async()=>{
 const {c,states,actions}=service([{tool:'wait_for',text:'สวัสดี',seconds:1,reason:'รอ'},{tool:'note',name:'greeting',text:'สวัสดี',reason:'จำ'},{tool:'type',target:1,text:'$greeting',reason:'พิมพ์'}]);c.start({task:'test',consent:true});while(c.busy)await wait();assert.equal(states.at(-1).status,'done');assert.equal(actions.find(a=>a.action==='type').text,'สวัสดี');
});
test('visual completion needs independent verification when UIA contains no evidence',async()=>{
 const states=[];let verified=0;const c=createComputer({native:{request:async a=>a.action==='read'?view:a.action==='windows'?[view.app]:{},stop(){}},picture:async()=>({data:'image',width:10,height:10}),verifyVisual:async()=>{verified++;return true},decide:async()=>JSON.stringify({tool:'done',visual:true,evidence:'green circle',reason:'สีเปลี่ยนแล้ว'}),openApp:async()=>{},openSite:async()=>{},notify:s=>states.push(s)});c.start({task:'test',consent:true,images:true});while(c.busy)await wait();assert.equal(verified,1);assert.equal(states.at(-1).status,'done');
});

test('read-only voice screen jobs cannot be turned into clicks by model output',async()=>{
 const {c,states,actions}=service([{tool:'click',target:2,reason:'click'}]);c.start({task:'read',consent:true,readOnly:true});while(c.busy)await wait();assert.equal(states.at(-1).status,'error');assert.match(states.at(-1).message,/ไม่อนุญาต/);assert.equal(actions.filter(a=>a.action==='click').length,0);
});
test('direct voice media actions use the shared job gates without a second planning model',async()=>{
 let modelCalls=0,tools=0,last;const native={request:async a=>a.action==='read'?structuredClone(view):a.action==='windows'?[view.app]:{},stop(){}};
 const c=createComputer({native,system:async a=>{tools++;assert.equal(a.action,'now_playing');return 'ไม่พบเพลง'},decide:async()=>{modelCalls++;throw Error('must not plan')},notify:s=>last=s});
 c.start({task:'current song',consent:true,voice:true,directAction:{tool:'media',action:'now_playing',reason:'ดูเพลง'}});while(c.busy)await wait();assert.equal(last.status,'done');assert.equal(tools,1);assert.equal(modelCalls,0);assert.equal(last.evidence,'ไม่พบเพลง');
});
test('security levels: trusted asks only for risky steps, blackwall never',()=>{
 const view={app:{process:'chrome',title:'Shop'},targets:[{id:1,role:'Button',name:'Send'},{id:2,role:'Button',name:'Buy now'}]};
 assert.ok(needsConfirmation({tool:'click',target:1},view,'guarded'));
 assert.ok(!needsConfirmation({tool:'click',target:1},view,'trusted'));assert.ok(needsConfirmation({tool:'click',target:2},view,'trusted'));
 assert.ok(needsConfirmation({tool:'power',action:'shutdown'},view,'trusted'));
 assert.ok(!needsConfirmation({tool:'click',target:2},view,'blackwall'));assert.ok(!needsConfirmation({tool:'power',action:'shutdown'},view,'blackwall'));
 const computer=createComputer({native:{request:async()=>({}),stop(){}},decide:async()=>''});
 assert.throws(()=>computer.start({task:'x',consent:true,security:'yolo'}));
});
test('what you say mid-job reaches her next step',async()=>{
 const view={app:{window:1,process:'notepad',title:'Notepad'},targets:[{id:1,role:'Document',name:'Text',value:'hi there'}]};
 let calls=0,seen=null,c;
 c=createComputer({native:{request:async a=>a.action==='windows'?[]:view,stop(){}},decide:async({history})=>{calls++;if(calls===1){c.tell('also say bye');return JSON.stringify({tool:'wait',reason:'wait',seconds:0.05});}seen=history;return JSON.stringify({tool:'done',reason:'ok',evidence:'hi there'});}});
 assert.equal(c.tell('nobody working'),false);
 c.start({task:'type hi',consent:true});
 for(let i=0;i<50&&c.busy;i++)await new Promise(r=>setTimeout(r,50));
 assert.ok(seen.some(h=>h.user==='also say bye'));
});
test('hold_and_press: two real keys, asks first when guarded',()=>{
 assert.equal(actionFrom(JSON.stringify({tool:'hold_and_press',reason:'jump forward',hold:'W',text:'SPACE',seconds:1})).hold,'W');
 assert.throws(()=>actionFrom(JSON.stringify({tool:'hold_and_press',reason:'x',hold:'W'})));
 assert.ok(needsConfirmation({tool:'hold_and_press',hold:'W',text:'SPACE'},{targets:[]}));
});
test('switches: each one lets her skip asking for its own kind of step',()=>{
 const view={app:{process:'chrome',title:'Shop'},targets:[{id:1,role:'Button',name:'Send'},{id:2,role:'Button',name:'Buy now'},{id:3,role:'Button',name:'Next'}]};
 const off={apps:false,clicks:false,keys:false,windows:false,media:false,power:false,games:false,send:false,money:false};
 assert.ok(needsConfirmation({tool:'click',target:1},view,off));assert.ok(!needsConfirmation({tool:'click',target:1},view,{...off,send:true}));
 assert.ok(needsConfirmation({tool:'click',target:2},view,{...off,send:true}));assert.ok(!needsConfirmation({tool:'click',target:2},view,{...off,money:true}));
 assert.ok(!needsConfirmation({tool:'click',target:3},view,off));
 assert.ok(needsConfirmation({tool:'media',action:'mute'},view,off));assert.ok(!needsConfirmation({tool:'media',action:'mute'},view,{...off,media:true}));
 assert.ok(needsConfirmation({tool:'open_app',name:'Terminal'},view,{...off,apps:true}));
});

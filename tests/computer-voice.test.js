'use strict';
const test=require('node:test'),assert=require('node:assert/strict');

test('Thai volume requests distinguish Windows changes and browser unmute',async()=>{
 const {volumeCommand,computerTask}=await import('../src/renderer/js/computer-intent.js');
 for(const [text,action] of [['เพิ่มเสียงหน่อย','volume_up'],['ลดเสียงหน่อย','volume_down'],['ปิดเสียง Windows','mute'],['เปิดเสียง Windows','unmute']]){
  assert.equal(volumeCommand(text).action,action);assert.equal(volumeCommand(text).browser,false);assert.ok(computerTask(text));
 }
 const both=volumeCommand('เปิดเสียงอีกหน่อยมันไม่ค่อยได้ยิน');assert.equal(both.action,'volume_up');assert.equal(both.windows,true);assert.equal(both.browser,true);
 assert.equal(volumeCommand('เปิดเสียงเบราว์เซอร์').windows,false);
 assert.equal(volumeCommand('ตั้งเสียง ๔๐ เปอร์เซ็นต์').level,40);
 assert.equal(volumeCommand('ตั้งเสียง 999 เปอร์เซ็นต์'),null);assert.equal(computerTask('อย่าเปิดเสียง'),null);
});
test('Thai multi-step and desktop commands route to jobs without a magic prefix',async()=>{
 const {computerTask}=await import('../src/renderer/js/computer-intent.js');
 for(const phrase of ['เปิด Notepad แล้วพิมพ์ สวัสดี','ช่วยลากไฟล์ไปที่โฟลเดอร์','กด Ctrl+A','ปรับเสียงเป็น 40 เปอร์เซ็นต์','ล็อกหน้าจอ','กำลังเล่นเพลงอะไร','ควบคุมเครื่อง: เปิดเว็บแล้วค้นหาแมว'])assert.ok(computerTask(phrase),phrase);
 for(const phrase of ['อย่าเปิดโปรแกรม','อย่าเปิดเพลง Paradox','ช่วยอย่าเปิดเพลง','เปิดเพลงทำยังไง','วิธีลากไฟล์ทำยังไง','อธิบายการควบคุมเครื่อง','วันนี้เป็นอย่างไร','เตือนฉันอีกห้านาที'])assert.equal(computerTask(phrase),null,phrase);
});
test('voice executes a multi-step request through the computer bridge',async()=>{
 const {Listening}=await import('../src/renderer/js/listening.js');const v=Object.create(Listening.prototype);let received;
 v.chat={onComputer:async(...args)=>received=args};await v.execute('เปิด Notepad แล้วพิมพ์ สวัสดี');assert.equal(received[1].voice,true);assert.match(received[0],/Notepad/);
});
test('a spoken no cancels the pending job callback once',async()=>{
 const {Listening}=await import('../src/renderer/js/listening.js');const v=Object.create(Listening.prototype);let canceled=0;
 Object.assign(v,{serial:1,settings:{mode:'push',followSeconds:10},speech:{stop(){}},respond:async()=>{},hide(){},releaseMic(){},confirmation:{until:Date.now()+1000,cancel:()=>canceled++}});
 await v.answerConfirmation('ไม่ใช่');assert.equal(canceled,1);assert.equal(v.confirmation,null);
});

test('voice approval closes its overlay before releasing the native action',async()=>{
 const {Listening}=await import('../src/renderer/js/listening.js');const v=Object.create(Listening.prototype);let hidden=false,executed=false;
 Object.assign(v,{serial:1,settings:{mode:'push',followSeconds:10},speech:{stop(){}},hide(){hidden=true},releaseMic(){},confirmation:{until:Date.now()+1000,execute:async()=>{assert.equal(hidden,true);executed=true;}}});
 await v.answerConfirmation('ใช่');assert.equal(executed,true);
});

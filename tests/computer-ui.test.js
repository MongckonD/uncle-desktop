'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
async function controller(){
 const {Computer}=await import('../src/renderer/js/computer.js');const c=Object.create(Computer.prototype);
 Object.assign(c,{root:{hidden:true},status:{},log:{replaceChildren(){}},start:{},indicator:{},confirm:{querySelector:()=>({focus(){}})},reply:{},onVisibility(){this.opened=(this.opened||0)+1;}});return c;
}
test('Telegram job completion updates results without opening desktop settings',async()=>{
 for(const status of ['done','error','stopped']){
  const c=await controller();c.update({status,remote:true,message:'remote result',steps:[]});
  assert.equal(c.root.hidden,true,status);assert.equal(c.opened,undefined);assert.equal(c.status.textContent,'remote result');assert.equal(c.indicator.hidden,true);
 }
 const c=await controller();c.root.hidden=false;c.update({status:'done',remote:true,message:'done',steps:[]});assert.equal(c.root.hidden,false,'Explicitly opened settings remain open');
});
test('local results and necessary Telegram confirmations retain their existing UI',async()=>{
 const local=await controller();local.update({status:'done',message:'local',steps:[]});assert.equal(local.root.hidden,false);
 const remote=await controller();remote.update({status:'confirm',remote:true,message:'confirm',steps:[],answerNeeded:false});assert.equal(remote.root.hidden,false);assert.equal(remote.confirm.hidden,false);
});

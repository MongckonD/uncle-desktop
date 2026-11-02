const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVibe } = require('../src/main/vibe');

// commits in the tests need a name, CI has none
Object.assign(process.env, { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' });

test('vibe: create a project, diff and commit it, refuse bad names', async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'uncle-vibe-'));
  const state = {};
  const vibe = createVibe({ getSettings: () => ({ workspace: ws }), saveState: (n, st) => { state[n] = { ...st }; } });
  try {
    assert.throws(() => vibe.dirOf('../etc'), /ชื่อโปรเจกต์/);
    await vibe.create('cafe-shop');
    assert.deepEqual(vibe.projects(), ['cafe-shop']);
    assert.equal(state['cafe-shop'].agent, 'claude');
    fs.writeFileSync(path.join(vibe.dirOf('cafe-shop'), 'index.html'), '<h1>cafe</h1>');
    assert.match((await vibe.diff('cafe-shop')).stat, /index\.html/);
    assert.match(await vibe.commit('cafe-shop', 'first page'), /first page/);
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
});


test('vibe: diff includes staged edits and failed PR without remote does not switch branches', async () => {
 const ws=fs.mkdtempSync(path.join(os.tmpdir(),'uncle-vibe-all-'));
 const {execFileSync}=require('node:child_process');
 const vibe=createVibe({getSettings:()=>({workspace:ws}),saveState:()=>{}});
 try{
  await vibe.create('demo');const dir=vibe.dirOf('demo');fs.writeFileSync(path.join(dir,'x.txt'),'one');await vibe.commit('demo','base');
  fs.writeFileSync(path.join(dir,'x.txt'),'two');execFileSync('git',['add','x.txt'],{cwd:dir});
  assert.match((await vibe.diff('demo')).text,/two/);
  const before=execFileSync('git',['branch','--show-current'],{cwd:dir}).toString();
  await assert.rejects(vibe.pullRequest('demo'));
  assert.equal(execFileSync('git',['branch','--show-current'],{cwd:dir}).toString(),before);
 }finally{fs.rmSync(ws,{recursive:true,force:true});}
});


test('vibe: PR pipeline pushes only to an isolated local bare remote and calls gh with fixed args',async()=>{
 const ws=fs.mkdtempSync(path.join(os.tmpdir(),'uncle-pr-'));const {execFile}=require('node:child_process');const calls=[];
 const runner=(file,args,cwd)=>{calls.push([file,args]);if(file==='gh')return Promise.resolve('https://example.invalid/pr/fixture');return new Promise((resolve,reject)=>execFile(file,args,{cwd,windowsHide:true},(e,out)=>e?reject(e):resolve(out.trim())));};
 const vibe=createVibe({getSettings:()=>({workspace:ws}),saveState:()=>{},runner});
 try{
  await vibe.create('demo');const dir=vibe.dirOf('demo');fs.writeFileSync(path.join(dir,'readme.txt'),'test');await vibe.commit('demo','baseline');
  const origin=path.join(ws,'.origin.git');await runner('git',['init','--bare',origin],ws);await runner('git',['remote','add','origin',origin],dir);
  assert.equal(await vibe.pullRequest('demo','QA only'),'https://example.invalid/pr/fixture');
  assert.deepEqual(calls.find(c=>c[0]==='gh')[1],['pr','create','--fill','--title','QA only']);
  assert.match(await runner('git',['--git-dir',origin,'branch','--list'],ws),/uncle\//);
 }finally{fs.rmSync(ws,{recursive:true,force:true});}
});

'use strict';
const { authHeaders } = require('../hooks/bridge-token');
const assert = require('node:assert/strict');
async function inspect(js) {
  const r = await fetch('http://127.0.0.1:47823/debug/eval', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ js: `(async()=>{try{return await (${js})}catch(e){return {error:e.stack}}})()` }) }).then(r => r.json());
  assert.ok(r.ok, JSON.stringify(r)); assert.ok(!r.value?.error, r.value?.error); return r.value;
}
(async () => {
  const liveTts = process.argv.includes('--live-tts');
  const existing = await inspect('host.findApp("notepad")');
  assert.equal(existing, null, 'Close test is skipped when a user Notepad is already open; never close user documents.');
  await inspect(`(async()=>{const v=window.dev.listening;window.__actionBackup={settings:(await host.listeningInfo()).settings,host:v.host,speech:v.speech,chatHost:v.chat.host,history:await host.chatMemory(),characterId:(await host.getConfig()).characterId};await v.show();if(!${liveTts}){v.speech={active:false,play:async()=>{},stop:()=>{}};}else {const original=v.speech;window.__voiceAudio=[];v.speech={get active(){return original.active},play:async text=>{await original.play(text);window.__voiceAudio.push({question:text.includes('ใช่ไหม'),duration:original.source?.buffer.duration||0})},stop:()=>original.stop()};}v.chat.host={...v.chat.host,chatStatus:async()=>{throw Error('Unexpected LLM fallback')}};v.host={...v.host,listeningTranscribe:async()=>({text:window.__actionHeard})};v.mode.value='wake';v.provider.value='local';v.review.checked=false;v.words.value='เฮ้ อังเคิล';await v.begin();v.processor.onaudioprocess=null;return true})()`);
  try {
    const opened = await inspect(`(async()=>{const v=window.dev.listening;window.__actionHeard='เฮ้ อังเคิล เปิด Notepad';await v.process(new Uint8Array());return {confirmation:Boolean(v.confirmation),status:v.status.textContent}})()`);
    assert.equal(opened.confirmation, false, JSON.stringify(opened));
    let app;
    for (let i = 0; i < 20; i++) { app = await inspect('host.findApp("notepad")'); if (app) break; await new Promise(r => setTimeout(r, 250)); }
    assert.ok(app, JSON.stringify(opened));
    const asked = await inspect(`(async()=>{const v=window.dev.listening;window.__actionHeard='เฮ้ อังเคิล ปิดโปรแกรม Notepad';await v.process(new Uint8Array());return {question:v.confirmation?.question,stillOpen:Boolean(await host.findApp('notepad'))}})()`);
    assert.ok(asked.question?.includes('ใช่ไหม') && asked.stillOpen);
    if (liveTts) assert.ok(await inspect('window.__voiceAudio.some(audio=>audio.question&&audio.duration>0)'), 'Confirmation must decode and play real Thai audio');
    await inspect(`(async()=>{window.__actionHeard='ไม่ใช่';await window.dev.listening.process(new Uint8Array());return true})()`);
    assert.ok(await inspect('Boolean(await host.findApp("notepad"))').catch(() => false));
    const closed = await inspect(`(async()=>{const v=window.dev.listening;window.__actionHeard='เฮ้ อังเคิล ปิดโปรแกรม Notepad';await v.process(new Uint8Array());window.__actionHeard='ใช่ครับ';await v.process(new Uint8Array());return {pending:Boolean(v.confirmation),app:await host.findApp('notepad'),status:v.status.textContent}})()`);
    assert.equal(closed.app, null); assert.equal(closed.pending, false);
    console.log('PASS real Chat parser -> native Notepad open; voice close waits, no cancels, yes closes. STT transcript mocked; TTS '+(liveTts?'real Edge Thai':'mocked')+'; no LLM request.');
  } finally {
    await inspect(`(async()=>{const v=window.dev.listening,b=window.__actionBackup;v.stop();v.host=b.host;v.speech=b.speech;v.chat.host=b.chatHost;v.chat.history=b.history;host.chatRemember(b.history,b.characterId);await host.listeningSave(b.settings);v.hide();delete window.__actionBackup;return true})()`);
    // Only our previously absent, empty Notepad can exist here.
    const remaining = await inspect('host.findApp("notepad")');
    if (remaining) await inspect('host.closeApp("notepad",false)');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

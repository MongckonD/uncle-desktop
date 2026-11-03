'use strict';
const { authHeaders } = require('../hooks/bridge-token');
const assert = require('node:assert/strict');
async function post(route, body) {
  const res = await fetch(`http://127.0.0.1:47823/debug/${route}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }).then(r => r.json());
  assert.ok(res.ok, JSON.stringify(res)); return res.value;
}
const inspect = async js => { const result = await post('eval', { js: `(async()=>{try{return await (${js})}catch(error){return {__failure:error.stack}}})()` }); assert.ok(!result?.__failure, result?.__failure); return result; };
(async () => {
  assert.ok(await inspect('Boolean(window.dev?.listening)'));
  await inspect('(async()=>{const v=window.dev.listening;await v.show();window.__listeningBackup={settings:(await host.listeningInfo()).settings,host:v.host,chat:v.chat};return true})()');
  try {
    // Open the actual selected microphone and capture graph. No ambient audio is submitted.
    const native = await inspect('(async()=>{const v=window.dev.listening;await v.begin(true);v.processor.onaudioprocess=null;const result={active:Boolean(v.stream),rate:v.context.sampleRate};v.stop();return {...result,stopped:v.stream===null}})()');
    assert.ok(native.active && native.stopped && native.rate >= 16000);
    await post('capture', { name: 'listening-settings' });
    // Inject STT transcripts only; never execute real PC commands during this smoke test.
    await inspect(`(()=>{const v=window.dev.listening;window.__voiceSent=[];v.chat={open:true,turn:0,asked:()=>null,start:async()=>{},send:async text=>window.__voiceSent.push(text)};v.host={...v.host,listeningTranscribe:async()=>({text:window.__heard})};return true})()`);
    const result = await inspect(`(async()=>{const v=window.dev.listening;v.mode.value='wake';v.words.value='ลุงเดฟ\\nHey Uncle';v.review.checked=true;await v.begin();v.processor.onaudioprocess=null;window.__heard='เปิดเพลง';await v.process(new Uint8Array());const ignored=!v.pending;window.__heard='ลุงเดฟ เปิดเพลง';await v.process(new Uint8Array());const reviewed=v.pending&&v.transcript.value==='เปิดเพลง'&&window.__voiceSent.length===0;await v.submit();const sent=window.__voiceSent.slice();const follow=v.followUntil>Date.now();v.stop();return {ignored,reviewed,sent,follow,stopped:v.stream===null}})()`);
    assert.ok(result.ignored && result.reviewed && result.follow && result.stopped); assert.deepEqual(result.sent, ['เปิดเพลง']);
    const wakeRegression = await inspect(`(async()=>{const v=window.dev.listening;await v.show();v.mode.value='wake';v.words.value='เฮ้ อังเคิล';v.review.checked=true;await v.begin();v.processor.onaudioprocess=null;window.__heard='เฮ้ อังเกิล เปิดเพลง';await v.process(new Uint8Array());v.idle();const visible=v.heard.value===window.__heard&&v.status.textContent.includes('ไม่พบคำเรียก')&&v.sendButton.disabled;window.__heard='เฮ อังเคิล เปิดเพลง';await v.process(new Uint8Array());const accepted=v.pending&&v.transcript.value==='เปิดเพลง';v.stop();return {visible,accepted}})()`);
    assert.ok(wakeRegression.visible && wakeRegression.accepted);
    const auto = await inspect(`(async()=>{const v=window.dev.listening;await v.show();v.mode.value='wake';v.words.value='ลุงเดฟ';v.review.checked=false;await v.begin();v.processor.onaudioprocess=null;window.__heard='ลุงเดฟ เตือนฉันอีก 5 นาที';await v.process(new Uint8Array());const sent=window.__voiceSent.slice();window.__heard='เพิ่มเสียง';await v.process(new Uint8Array());v.stop();return {sent,followSent:window.__voiceSent.at(-1),hidden:document.getElementById('listening-stop').hidden}})()`);
    assert.equal(auto.sent.at(-1), 'เตือนฉันอีก 5 นาที'); assert.equal(auto.followSent, 'เพิ่มเสียง'); assert.ok(auto.hidden);
    const canceled = await inspect(`(async()=>{const v=window.dev.listening;await v.show();v.mode.value='push';v.provider.value='local';await v.begin();v.processor.onaudioprocess=null;v.host.listeningTranscribe=()=>new Promise(resolve=>window.__late=resolve);const before=window.__voiceSent.length;const promise=v.process(new Uint8Array());v.stop();window.__late({text:'เปิดโปรแกรม'});await promise;return {same:window.__voiceSent.length===before,mic:v.stream===null}})()`);
    assert.ok(canceled.same && canceled.mic);
    console.log('PASS microphone capture/stop, custom wake words, review, send, follow-up, auto mode and stale-result cancellation; PC actions/STT responses mocked.');
  } finally {
    await inspect('(async()=>{const v=window.dev.listening;v.stop();v.host=window.__listeningBackup.host;v.chat=window.__listeningBackup.chat;await host.listeningSave(window.__listeningBackup.settings);await v.load();v.hide();delete window.__listeningBackup;return true})()');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

'use strict';
const { authHeaders } = require('../hooks/bridge-token');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:47823/debug/';
async function post(route, body) {
  const result = await fetch(base + route, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) }).then((r) => r.json());
  assert.ok(result.ok, JSON.stringify(result)); return result.value;
}
const inspect = (js) => post('eval', { js });
async function until(js) { for (let i = 0; i < 80; i++) { if (await inspect(js)) return; await new Promise((resolve) => setTimeout(resolve, 100)); } throw new Error(js); }
(async () => {
  await until('Boolean(window.dev?.speech)');
  await inspect('(async()=>{window.__speechSmoke={settings:(await window.host.speechInfo()).settings,muted:(await window.host.getConfig()).muted};return true})()');
  try {
    await inspect('window.host.setConfig({muted:false})');
    await post('command', { name: 'speech' });
    await until('window.dev.speech.open && Boolean(window.dev.speech.info)');
    const voices = await inspect('window.dev.speech.info.voices');
    assert.ok(voices.length);
    const english = voices.find((voice) => /^en/i.test(voice.lang));
    await inspect(`window.dev.speech.provider.value='windows';window.dev.speech.renderVoices();window.dev.speech.voice.value=${JSON.stringify(english.id)};window.dev.speech.auto.checked=false;window.dev.speech.sample.value='Hello. Uncle Desktop voice is ready. This is a test.';true`);
    await inspect('window.dev.speech.tryPlay(window.dev.speech.sample.value)');
    assert.ok(await inspect('Boolean(window.dev.speech.source?.buffer.duration>0 && !document.getElementById("speech-stop").hidden)'));
    await inspect('window.dev.speech.stop();true');
    assert.ok(await inspect('window.dev.speech.source===null && document.getElementById("speech-stop").hidden'));
    if (!voices.some((voice) => /^th/i.test(voice.lang))) {
      assert.ok(await inspect('window.host.speechSpeak("สวัสดี").then(()=>false,error=>/ไม่รองรับภาษาไทย/.test(error.message))'));
    }
    await post('capture', { name: 'speech-windows' });
    await inspect('window.dev.speech.provider.value="openai";window.dev.speech.renderVoices();window.dev.speech.consent.checked=false;true');
    await inspect('window.host.speechSave({provider:"openai",voice:"coral",volume:0.7,rate:1,auto:false,cloudConsent:false})');
    assert.ok(await inspect('window.host.speechSpeak("สวัสดี").then(()=>false,error=>/ยินยอม/.test(error.message))'));
    assert.ok(await inspect('window.dev.speech.cloud.hidden===false && window.dev.speech.key.type==="password"'));
    await post('capture', { name: 'speech-online' });
    console.log('PASS actual Windows synthesis/playback/stop, missing-Thai feedback, online UI and consent gate; no paid API call made');
  } finally {
    await inspect('(async()=>{window.dev.speech.stop();await window.host.speechSave(window.__speechSmoke.settings);await window.host.setConfig({muted:window.__speechSmoke.muted});window.dev.speech.hide();delete window.__speechSmoke;return true})()');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

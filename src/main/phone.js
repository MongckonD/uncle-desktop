'use strict';

// Her side of Telegram (telegram.js carries the messages): what you type, say, photograph or film
// on your phone, answered by her AI with her tools; tools that write ask you with buttons; her
// alerts sent on when you want them (always, or only while you're away from the computer).

const HELP = `คุยกับฉันได้เลย:
• พิมพ์ถาม — "พรุ่งนี้มีนัดอะไร", "สรุปเมลวันนี้"
• ส่งข้อความเสียง — ฉันฟังภาษาไทยได้
• ส่งรูป — "อ่านใบเสร็จนี้", "นี่คืออะไร"
• ส่งวิดีโอสั้น — ฉันดูภาพและฟังเสียงในคลิป
• ส่งไฟล์ข้อความ (txt md csv json โค้ด) — ฉันอ่านแล้วสรุปให้
/new เริ่มเรื่องใหม่ · /help ดูวิธีใช้ · /status ดูสถานะคอม · /hide ซ่อนตัวละครบนคอม (ยังทำงานอยู่) · /show เรียกกลับ

💻 Vibecode (สั่ง Claude Code / Codex บนคอม):
/projects รายชื่อโปรเจกต์ · /create ชื่อ [codex] สร้างใหม่ · /project ชื่อ เลือก
/code เปิด session สดของโปรเจกต์ที่เลือก (ข้อความ เสียง รูป ส่งให้ Agent) · /chat กลับมาคุยปกติ
/diff ดูสิ่งที่แก้ · /commit ข้อความ · /interrupt หยุด · /shot url ดูหน้าเว็บ
/pr PIN เปิด pull request · /undo PIN ย้อน commit ล่าสุด

🔊 เปิดได้ในตั้งค่า Telegram (สวิตช์สั่งงานคอม): /say ข้อความ ให้ตัวละครพูดบนคอม · /music play|pause|next|prev|volup|voldown|mute

🖥 คอม (เปิดได้ในตั้งค่า Telegram ต้องใส่ PIN):
/screen PIN ดูหน้าจอ · /pc PIN งาน สั่งงานคอม (หรือ /pc PIN แล้วส่งเสียงบอกงาน)
/tell ข้อความ บอกเพิ่มระหว่างทำ · /pcstop หยุดงานบนคอม · /lock /sleep /shutdown /restart PIN`;

const TEXT_EXT = new Set(['txt', 'md', 'csv', 'json', 'log', 'js', 'ts', 'py', 'html', 'css', 'xml', 'yaml', 'yml', 'toml', 'ini', 'sql', 'sh']);
const FILE_CHARS = 30000;

// coding: her Vibecode (vibe.js, plus shot(url)); checkPin(pin) for the risky ones (PR, undo)
// remote: { screen() -> png, pc(task) -> text, answer({ jobId, approvalId, yes, text }), tell(text), stop(), power(action) -> text }
// for the switches screen, control, power
function createPhone({ telegram, settings, answer, transcribe, speak, media, coding = null, remote = null, checkPin = () => false, setProject = () => {}, setGhost = () => {}, hub = null, status = async () => '', player = async () => {}, say = () => {}, idleSeconds = () => 0, onReply = null, log = () => {} }) {
  const history = []; // the last turns with your phone, for follow-ups
  const asks = new Map(); // a tool waiting for your tap: id -> resolve
  const remember = (role, content) => { history.push({ role, content }); while (history.length > 12) history.shift(); };

  // a tool that writes: buttons on your phone (or no, if approving from the phone is off)
  function confirm(chatId, tool, args) {
    if (!settings().switches.approve) return Promise.resolve(false);
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2, 10);
      asks.set(id, resolve);
      const detail = Object.entries(args).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n').slice(0, 600);
      telegram.send(chatId, `ขออนุญาตใช้ ${tool.server}/${tool.name}\n${detail}`, [[{ text: '✓ อนุญาต', data: `ask:${id}:yes` }, { text: '✗ ไม่ต้อง', data: `ask:${id}:no` }]]).catch(() => resolve(false));
      setTimeout(() => { if (asks.delete(id)) resolve(false); }, 5 * 60000).unref?.();
    });
  }

  // her answer to you, in words (and in her voice, when you'd like that)
  async function reply(chatId, question, { images = [], heardVoice = false } = {}) {
    await telegram.typing(chatId);
    const text = await answer({ history: [...history], text: question, images, confirm: (tool, args) => confirm(chatId, tool, args) });
    remember('user', question); remember('assistant', text);
    await telegram.send(chatId, text || '…');
    if (text) onReply?.(question, text); // also on the computer, aloud, when you like that
    const voice = settings().voiceReply;
    if (text && (voice === 'always' || (voice === 'voice' && heardVoice))) {
      try {
        const audio = await speak(text);
        if (audio) await telegram.sendFile(chatId, 'audio', audio.bytes, `uncle.${audio.ext}`, audio.mime);
      } catch (err) { log(`[phone] voice reply: ${err.message}`); }
    }
  }

  // the Vibecode commands; true when the text was one
  async function codeCommand(chatId, text) {
    const [cmd, ...rest] = text.split(/\s+/), arg = rest.join(' ');
    const project = settings().project;
    const need = () => { if (!project) throw new Error('ยังไม่ได้เลือกโปรเจกต์ · /project ชื่อ'); return project; };
    const pinned = async (run) => (checkPin(rest.at(-1) || '') ? run() : telegram.send(chatId, 'คำสั่งนี้ต้องใส่ PIN ต่อท้าย เช่น /pr 1234 (ตั้ง PIN ได้ในแท็บ Telegram บนคอม)'));
    switch (cmd) {
      case '/projects': { const list = coding.projects(); return telegram.send(chatId, list.length ? list.map((p) => `${p === project ? '▶' : '•'} ${p}${hub?.busy(p) ? ' (กำลังทำงาน)' : ''}`).join('\n') : 'ยังไม่มีโปรเจกต์ · /create ชื่อ'); }
      case '/create': { const [name, agent] = rest; await coding.create(name, agent); setProject(name); return hub.open(chatId, name, agent === 'codex' ? 'codex' : 'claude'); }
      case '/project': { if (!coding.projects().includes(arg)) return telegram.send(chatId, `ไม่มีโปรเจกต์ ${arg}`); setProject(arg); return telegram.send(chatId, `เลือก ${arg} แล้ว · /code เพื่อสั่งงาน`); }
      case '/code': return project ? hub.open(chatId, project) : telegram.send(chatId, 'ยังไม่ได้เลือกโปรเจกต์ · /projects ดูรายชื่อ หรือ /create ชื่อ');
      case '/diff': { const d = await coding.diff(need()); await telegram.send(chatId, `📝 ${d.stat}`); if (d.text) await telegram.sendFile(chatId, 'document', Buffer.from(d.text), `${project}.diff`, 'text/plain'); return undefined; }
      case '/commit': return telegram.send(chatId, `✅ ${await coding.commit(need(), arg)}`);
      case '/pr': return pinned(async () => telegram.send(chatId, `🚀 ${await coding.pullRequest(need())}`));
      case '/undo': return pinned(async () => telegram.send(chatId, `↩️ ${await coding.undo(need())}`));
      case '/shot': { const png = await coding.shot(arg || 'http://localhost:3000'); return telegram.sendFile(chatId, 'photo', png, 'page.png', 'image/png', arg || 'http://localhost:3000'); }
      default: return false;
    }
  }

  // a job your phone started on the computer: its questions, steps and end, back to your phone
  let pcAsk = null, pcSteps = 0, pcLines = [], pcLast = 0, pcArmed = 0;
  const pcFlush = (chatId) => { if (pcLines.length) { telegram.send(chatId, pcLines.join('\n')).catch(() => {}); pcLines = []; pcLast = Date.now(); } };
  async function pcState(state) {
    const s = settings(), chatId = s.chatId;
    if (!chatId) return undefined;
    if (s.pcSteps) {
      for (const step of (state.steps || []).slice(pcSteps)) pcLines.push(`🔧 ${step.label}`);
      if (pcLines.length >= 5 || Date.now() - pcLast > 8000) pcFlush(chatId);
    }
    pcSteps = state.steps?.length || 0;
    if (state.status === 'confirm') {
      pcFlush(chatId);
      if (!s.pcAsk) return undefined; // answered on the computer only
      pcAsk = state;
      return state.answerNeeded
        ? telegram.send(chatId, `❓ ${state.question}\nพิมพ์หรือส่งเสียงตอบได้เลย (5 นาที)`, [[{ text: '✗ ยกเลิกงาน', data: 'pc:no' }]])
        : telegram.send(chatId, `🖥 ${state.question}`, [[{ text: '✓ อนุญาต', data: 'pc:yes' }, { text: '✗ ไม่ต้อง', data: 'pc:no' }]]);
    }
    pcAsk = null;
    if (!['done', 'error', 'stopped'].includes(state.status)) return undefined;
    pcFlush(chatId); pcSteps = 0;
    await telegram.send(chatId, `${state.status === 'done' ? '✅' : '⚠️'} งานบนคอม: ${state.message}${state.evidence ? `\n${state.evidence}` : ''}`);
    if (s.pcShot && s.switches.screen) await telegram.sendFile(chatId, 'photo', await remote.screen(), 'screen.jpg', 'image/jpeg', 'หน้าจอตอนงานจบ').catch((err) => log(`[phone] shot: ${err.message}`));
    return undefined;
  }
  // your answer to the computer's question (a tap, or what you typed or said)
  async function pcAnswer(chatId, yes, text = '') {
    const asked = pcAsk; pcAsk = null;
    if (!asked) return telegram.send(chatId, 'ไม่มีคำถามจากคอมค้างอยู่');
    const ok = remote.answer({ jobId: asked.id, approvalId: asked.approvalId, yes, text });
    return telegram.send(chatId, !ok ? 'คำถามนี้หมดอายุแล้ว' : yes ? 'ส่งให้คอมแล้ว กำลังทำต่อ…' : 'ไม่ทำแล้ว');
  }

  // the computer from your phone: each behind its switch and your PIN ("/screen 1234", "/pc 1234 เปิด Spotify", "/lock 1234")
  async function remoteCommand(chatId, text) {
    const [cmd, pin, ...rest] = text.split(/\s+/), sw = settings().switches;
    const need = { '/screen': 'screen', '/pc': 'control', '/pcstop': 'control', '/tell': 'control' }[cmd] || 'power';
    if (!sw[need]) return telegram.send(chatId, `คำสั่งนี้ปิดอยู่ เปิดได้ที่ ตั้งค่า › Telegram บนคอม (${need === 'screen' ? 'ดูหน้าจอ' : need === 'control' ? 'สั่งงานคอม' : 'ปิด/ล็อกเครื่อง'})`);
    // a job already started with your PIN: stop it, or tell it more
    if (cmd === '/pcstop') return telegram.send(chatId, remote.stop() ? 'หยุดงานบนคอมแล้ว' : 'ไม่มีงานบนคอมที่สั่งจากมือถือ');
    if (cmd === '/tell') return telegram.send(chatId, remote.tell(text.slice(5).trim()) ? 'บอกคอมแล้ว' : 'ไม่มีงานบนคอมที่กำลังทำ');
    if (!checkPin(pin || '')) return telegram.send(chatId, `ต้องใส่ PIN เช่น ${cmd} 1234${cmd === '/pc' ? ' เปิด Spotify' : ''}`);
    if (cmd === '/screen') return telegram.sendFile(chatId, 'photo', await remote.screen(), 'screen.jpg', 'image/jpeg', 'หน้าจอตอนนี้');
    if (cmd === '/pc' && !rest.length) { pcArmed = Date.now(); return telegram.send(chatId, '🎙 ส่งข้อความเสียงบอกงานได้เลย (ภายใน 2 นาที)'); }
    if (cmd === '/pc') { pcSteps = 0; return telegram.send(chatId, await remote.pc(rest.join(' '))); }
    return telegram.send(chatId, await remote.power(cmd.slice(1)));
  }

  // the computer's speakers from your phone, behind the computer switch (no PIN: it only talks and presses media keys)
  const MUSIC = { play: 'play', pause: 'pause', next: 'next', prev: 'previous', previous: 'previous', volup: 'volup', voldown: 'voldown', mute: 'mute' };
  async function computerSpeakers(chatId, text) {
    if (!settings().switches.control) return telegram.send(chatId, 'คำสั่งนี้ปิดอยู่ เปิดได้ที่ ตั้งค่า › Telegram บนคอม (สั่งงานคอม)');
    const [cmd, ...rest] = text.split(/\s+/), arg = rest.join(' ').trim();
    if (cmd === '/say') {
      if (!arg) return telegram.send(chatId, 'ใช้แบบนี้: /say ข้อความที่จะให้พูดบนคอม');
      say(arg.slice(0, 300));
      return telegram.send(chatId, '🔊 ส่งให้ตัวละครพูดบนคอมแล้ว');
    }
    const action = MUSIC[arg.toLowerCase()];
    if (!action) return telegram.send(chatId, 'ใช้แบบนี้: /music play | pause | next | prev | volup | voldown | mute');
    await player(action);
    return telegram.send(chatId, `🎵 ${action}`);
  }

  async function onMessage(m) {
    const { chatId } = m;
    try {
      if (m.kind === 'callback') {
        if (remote && /^pc:(yes|no)$/.test(m.data || '')) return await pcAnswer(chatId, m.data === 'pc:yes');
        const [, id, yes] = /^ask:(\w+):(yes|no)$/.exec(m.data) || [];
        const resolve = asks.get(id);
        if (resolve) { asks.delete(id); resolve(yes === 'yes'); await telegram.send(chatId, yes === 'yes' ? 'อนุญาตแล้ว กำลังทำ…' : 'ไม่ทำนะ'); }
        const quick = /^m:(s|r|t):(\w{6,40})$/.exec(m.data || '');
        if (quick) return await reply(chatId, { s: `สรุปเมล id ${quick[2]} ให้หน่อย`, r: `ร่างคำตอบเมล id ${quick[2]} ให้หน่อย ยังไม่ต้องส่ง`, t: `อ่านเมล id ${quick[2]} แล้วเพิ่มสิ่งที่ฉันต้องทำลงรายการงาน` }[quick[1]]);
        if (hub && (await hub.callback(chatId, m.data))) return undefined;
        if (coding && m.data === 'code:diff') await codeCommand(chatId, '/diff');
        if (coding && m.data === 'code:commit') await codeCommand(chatId, '/commit');
        return;
      }
      if (!settings().switches.chat) return telegram.send(chatId, 'การคุยผ่าน Telegram ปิดอยู่ เปิดได้ที่ ตั้งค่า › Telegram บนคอม');
      if (m.kind === 'text') {
        if (/^\/(start|help)\b/.test(m.text)) return telegram.send(chatId, hub ? `${HELP}\n\n${hub.HELP}` : HELP);
        if (hub && (await hub.command(chatId, m.text))) return undefined;
        if (/^\/new\b/.test(m.text)) { history.length = 0; return telegram.send(chatId, 'เริ่มเรื่องใหม่แล้ว'); }
        if (/^\/status\b/.test(m.text)) return telegram.send(chatId, await status());
        if (/^\/(say|music)\b/.test(m.text)) return await computerSpeakers(chatId, m.text);
        if (/^\/(show|hide)\b/.test(m.text)) { setGhost(m.text.startsWith('/hide')); return telegram.send(chatId, m.text.startsWith('/hide') ? 'ซ่อนตัวละครบนคอมแล้ว ยังทำงานอยู่' : 'ตัวละครกลับมาบนคอมแล้ว'); }
        if (remote && /^\/(screen|pc|pcstop|tell|lock|sleep|shutdown|restart)\b/.test(m.text)) return await remoteCommand(chatId, m.text);
        if (remote && pcAsk?.answerNeeded && !m.text.startsWith('/')) return await pcAnswer(chatId, true, m.text);
        if (coding && m.text.startsWith('/') && (await codeCommand(chatId, m.text)) !== false) return undefined;
        return await reply(chatId, m.text);
      }
      if (m.kind === 'voice') {
        await telegram.typing(chatId, 'record_voice');
        const wav = await media('toWav', { data: (await telegram.download(m.fileId)).toString('base64'), mime: m.mime });
        const heard = (await transcribe(Buffer.from(wav, 'base64'))).trim();
        if (!heard) return telegram.send(chatId, 'ไม่ได้ยินอะไรเลย ลองอัดใหม่อีกทีนะ');
        await telegram.send(chatId, `🎙 ได้ยินว่า: ${heard}`);
        if (remote && pcAsk?.answerNeeded) return await pcAnswer(chatId, true, heard);
        if (remote && settings().switches.control && Date.now() - pcArmed < 120000) { pcArmed = 0; pcSteps = 0; return telegram.send(chatId, await remote.pc(heard)); }
        if (hub?.current && (await hub.command(chatId, heard))) return undefined;
        return await reply(chatId, heard, { heardVoice: true });
      }
      if (m.kind === 'photo') {
        if (hub?.current) { // a mockup or a screenshot: saved in the project, the agent told where to look
          const file = coding.saveImage(hub.project, await telegram.download(m.fileId));
          return await hub.say(chatId, `${m.caption || 'ทำให้หน้าตาเหมือนรูปนี้'}\n(ดูรูปที่ ${file})`);
        }
        const image = (await telegram.download(m.fileId)).toString('base64');
        return await reply(chatId, m.caption || 'ดูรูปนี้แล้วบอกหน่อยว่าเป็นอะไร มีอะไรน่าสนใจ', { images: [image] });
      }
      if (m.kind === 'file') { // a text file: read out and asked about (a PDF or other binary: not yet)
        const ext = (m.name.match(/\.(\w{1,8})$/) || [])[1]?.toLowerCase() || '';
        if (!(m.mime.startsWith('text/') || TEXT_EXT.has(ext) || /json|xml|yaml|javascript/.test(m.mime))) return telegram.send(chatId, `อ่านไฟล์ .${ext || '?'} ไม่ได้ (PDF และไฟล์ไบนารียังไม่รองรับ) · ส่งไฟล์ข้อความได้ เช่น ${[...TEXT_EXT].slice(0, 8).join(' ')}`);
        if (m.size > 2 * 1024 * 1024) return telegram.send(chatId, 'ไฟล์ใหญ่เกิน 2 MB ลองส่งเฉพาะส่วนที่ต้องการ');
        await telegram.typing(chatId);
        const bytes = await telegram.download(m.fileId);
        if (bytes.includes(0)) return telegram.send(chatId, 'ไฟล์นี้ไม่ใช่ข้อความ อ่านไม่ได้');
        const body = bytes.toString('utf8'), cut = body.length > FILE_CHARS;
        return await reply(chatId, `${m.caption || 'สรุปไฟล์นี้ให้หน่อย'}\n\n--- ${m.name}${cut ? ` (ตัดเหลือ ${FILE_CHARS} ตัวอักษรแรก)` : ''} ---\n${body.slice(0, FILE_CHARS)}`);
      }
      if (m.kind === 'video') {
        if (m.size > 20 * 1024 * 1024) return telegram.send(chatId, 'คลิปใหญ่เกิน 20 MB Telegram ไม่ให้ bot ดาวน์โหลด ลองส่งคลิปสั้นลง');
        await telegram.typing(chatId);
        const parts = await media('videoParts', { data: (await telegram.download(m.fileId)).toString('base64'), mime: m.mime });
        const heard = parts.wav ? (await transcribe(Buffer.from(parts.wav, 'base64')).catch(() => '')).trim() : '';
        const ask = `${m.caption || 'ดูคลิปนี้แล้วสรุปว่าเกิดอะไรขึ้น'}\n(ภาพ ${parts.frames.length} เฟรมจากคลิป ${Math.round(parts.duration)} วินาที${heard ? `, เสียงในคลิปว่า: "${heard}"` : ''})`;
        return await reply(chatId, ask, { images: parts.frames });
      }
    } catch (err) {
      log(`[phone] ${err.message}`);
      await telegram.send(chatId, `ขอโทษนะ ทำไม่สำเร็จ: ${err.message}`.slice(0, 500)).catch(() => {});
    }
    return undefined;
  }

  // one of her alerts, to your phone: always, or only while you're away (5 minutes without input)
  async function notify(alert) {
    const s = settings(), chatId = s.chatId;
    if (!chatId || s.notify === 'off' || (s.notify === 'away' && idleSeconds() < 300)) return;
    const link = /^https:\/\//.test(alert.link || '') ? alert.link : '';
    const text = alert.kind === 'mail' ? `📧 เมลสำคัญจาก ${alert.from}\n${alert.subject}`
      : alert.kind === 'event' ? `📅 อีก ${alert.minutes} นาที: ${alert.summary}`
        : alert.kind === 'news' || alert.kind === 'brief' ? `${alert.title}\n${alert.text || ''}${alert.links?.length ? `\n\n${alert.links.map((l) => `• ${l.title}\n${l.link}`).join('\n')}` : ''}`
          : alert.kind === 'agent' ? `🤖 ${alert.message}`
            : `${alert.kind === 'error' ? '⚠️' : '💬'} ${alert.message || alert.text || ''}`;
    const quick = alert.kind === 'mail' && /^\w{6,40}$/.test(alert.id || '') ? [[{ text: 'สรุปให้', data: `m:s:${alert.id}` }, { text: 'ร่างตอบ', data: `m:r:${alert.id}` }, { text: 'เพิ่มเป็นงาน', data: `m:t:${alert.id}` }]] : [];
    const buttons = [...(link ? [[{ text: alert.kind === 'mail' ? 'เปิดเมล' : alert.kind === 'event' ? 'เข้าประชุม' : 'เปิด', url: link }]] : []), ...quick];
    await telegram.send(chatId, alert.kind === 'event' && alert.prep ? `${text}\n\n${alert.prep}` : text, buttons.length ? buttons : undefined);
  }

  return { onMessage, notify, confirm, pcState, history };
}

module.exports = { createPhone, HELP };

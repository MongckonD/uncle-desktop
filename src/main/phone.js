'use strict';

// Her side of Telegram (telegram.js carries the messages): what you type, say, photograph or film
// on your phone, answered by her AI with her tools; tools that write ask you with buttons; her
// alerts sent on when you want them (always, or only while you're away from the computer).

const HELP = `คุยกับฉันได้เลย:
• พิมพ์ถาม — "พรุ่งนี้มีนัดอะไร", "สรุปเมลวันนี้"
• ส่งข้อความเสียง — ฉันฟังภาษาไทยได้
• ส่งรูป — "อ่านใบเสร็จนี้", "นี่คืออะไร"
• ส่งวิดีโอสั้น — ฉันดูภาพและฟังเสียงในคลิป
/new เริ่มเรื่องใหม่ · /help ดูวิธีใช้

💻 Vibecode (สั่ง Claude Code / Codex บนคอม):
/projects รายชื่อโปรเจกต์ · /create ชื่อ [codex] สร้างใหม่ · /project ชื่อ เลือก
/code โหมดเขียนโค้ด (ข้อความ เสียง รูป ส่งให้ Agent) · /chat กลับมาคุยปกติ
/diff ดูสิ่งที่แก้ · /commit ข้อความ · /stop หยุด · /shot url ดูหน้าเว็บ
/pr PIN เปิด pull request · /undo PIN ย้อน commit ล่าสุด

🖥 คอม (เปิดได้ในตั้งค่า Telegram ต้องใส่ PIN):
/screen PIN ดูหน้าจอ · /pc PIN งาน สั่งงานคอม · /lock /sleep /shutdown /restart PIN`;

// coding: her Vibecode (vibe.js, plus shot(url)); checkPin(pin) for the risky ones (PR, undo)
// remote: { screen() -> png, pc(task) -> text, power(action) -> text } for the switches screen, control, power
function createPhone({ telegram, settings, answer, transcribe, speak, media, coding = null, remote = null, checkPin = () => false, setProject = () => {}, idleSeconds = () => 0, log = () => {} }) {
  const modes=new Map(); // 'code': what you send goes to the project's coding agent
  const history = []; // the last turns with your phone, for follow-ups
  const asks = new Map(); // a tool waiting for your tap: id -> resolve
  const voiceJobs=new Map(); // one task-bound, short-lived PIN challenge per paired chat
  const histories=new Map();
  const historyFor=chatId=>{if(chatId===settings().chatId)return history;if(!histories.has(chatId))histories.set(chatId,[]);return histories.get(chatId);};
  const remember=(chatId,role,content)=>{const h=historyFor(chatId);h.push({role,content});while(h.length>12)h.shift();};

  // a tool that writes: buttons on your phone (or no, if approving from the phone is off)
  function confirm(chatId, tool, args) {
    if (!settings().switches.approve) return Promise.resolve(false);
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2, 10);
      asks.set(id, {chatId,resolve});
      const detail = Object.entries(args).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n').slice(0, 600);
      telegram.send(chatId, `ขออนุญาตใช้ ${tool.server}/${tool.name}\n${detail}`, [[{ text: '✓ อนุญาต', data: `ask:${id}:yes` }, { text: '✗ ไม่ต้อง', data: `ask:${id}:no` }]]).catch(() => resolve(false));
      setTimeout(() => { if (asks.delete(id)) resolve(false); }, 5 * 60000).unref?.();
    });
  }

  // her answer to you, in words (and in her voice, when you'd like that)
  async function reply(chatId, question, { images = [], heardVoice = false } = {}) {
    await telegram.typing(chatId);
    const text = await answer({ history: [...historyFor(chatId)], text: question, images, confirm: (tool, args) => confirm(chatId, tool, args) });
    remember(chatId,'user', question); remember(chatId,'assistant', text);
    await telegram.send(chatId, text || '…');
    const voice = settings().voiceReply;
    if (text && (voice === 'always' || (voice === 'voice' && heardVoice))) {
      try {
        const audio = await speak(text);
        if (audio) await telegram.sendFile(chatId, 'audio', audio.bytes, `uncle.${audio.ext}`, audio.mime);
      } catch (err) { log(`[phone] voice reply: ${err.message}`); }
    }
  }

  // a prompt to the project's agent, its steps sent as they come (a few lines at a time)
  async function code(chatId, prompt) {
    const project = settings().project;
    if (!project) return telegram.send(chatId, 'ยังไม่ได้เลือกโปรเจกต์ · /projects ดูรายชื่อ หรือ /create ชื่อ สร้างใหม่');
    await telegram.send(chatId, `💻 ${project}: รับงานแล้ว กำลังทำ…`);
    let lines = [], last = Date.now();
    const flush = () => { if (lines.length) { telegram.send(chatId, lines.join('\n')).catch(() => {}); lines = []; last = Date.now(); } };
    const answerText = await coding.send(project, prompt, (line) => { lines.push(line); if (lines.length >= 5 || Date.now() - last > 8000) flush(); });
    flush();
    await telegram.send(chatId, `✅ ${project}\n${answerText}`.slice(0, 4000), [[{ text: 'ดูสิ่งที่แก้', data: 'code:diff' }, { text: 'commit', data: 'code:commit' }]]);
  }
  // the Vibecode commands; true when the text was one
  async function codeCommand(chatId, text) {
    const [cmd, ...rest] = text.split(/\s+/), arg = rest.join(' ');
    const project = settings().project;
    const need = () => { if (!project) throw new Error('ยังไม่ได้เลือกโปรเจกต์ · /project ชื่อ'); return project; };
    const pinned = async (run) => ((settings().requirePin===false||checkPin(rest.at(-1) || '')) ? run() : telegram.send(chatId, 'คำสั่งนี้ต้องใส่ PIN ต่อท้าย เช่น /pr 1234 (ตั้ง PIN ได้ในแท็บ Telegram บนคอม)'));
    switch (cmd) {
      case '/projects': { const list = coding.projects(); return telegram.send(chatId, list.length ? list.map((p) => `${p === project ? '▶' : '•'} ${p}${coding.busy(p) ? ' (กำลังทำงาน)' : ''}`).join('\n') : 'ยังไม่มีโปรเจกต์ · /create ชื่อ'); }
      case '/create': { const [name, agent] = rest; await coding.create(name, agent); setProject(name); modes.set(chatId,'code'); return telegram.send(chatId, `สร้าง ${name} แล้ว (${agent === 'codex' ? 'Codex' : 'Claude Code'}) · อยู่ในโหมดเขียนโค้ด บอกได้เลยว่าจะทำอะไร`); }
      case '/project': { if (!coding.projects().includes(arg)) return telegram.send(chatId, `ไม่มีโปรเจกต์ ${arg}`); setProject(arg); return telegram.send(chatId, `เลือก ${arg} แล้ว · /code เพื่อสั่งงาน`); }
      case '/code': modes.set(chatId,'code'); return telegram.send(chatId, `💻 โหมดเขียนโค้ด${project ? `: ${project}` : ''} · ข้อความ เสียง และรูปจะส่งให้ Agent · /chat เพื่อกลับ`);
      case '/chat': modes.set(chatId,'chat'); return telegram.send(chatId, 'กลับมาคุยปกติแล้ว');
      case '/stop': return telegram.send(chatId, coding.stop(need()) ? 'หยุดแล้ว' : 'ไม่มีงานที่กำลังทำ');
      case '/diff': { const d = await coding.diff(need()); await telegram.send(chatId, `📝 ${d.stat}`); if (d.text) await telegram.sendFile(chatId, 'document', Buffer.from(d.text), `${project}.diff`, 'text/plain'); return undefined; }
      case '/commit': return telegram.send(chatId, `✅ ${await coding.commit(need(), arg)}`);
      case '/pr': return pinned(async () => telegram.send(chatId, `🚀 ${await coding.pullRequest(need())}`));
      case '/undo': return pinned(async () => telegram.send(chatId, `↩️ ${await coding.undo(need())}`));
      case '/shot': { const png = await coding.shot(arg || 'http://localhost:3000'); return telegram.sendFile(chatId, 'photo', png, 'page.png', 'image/png', arg || 'http://localhost:3000'); }
      default: return false;
    }
  }

  // the computer from your phone: each behind its switch and your PIN ("/screen 1234", "/pc 1234 เปิด Spotify", "/lock 1234")
  async function remoteCommand(chatId, text) {
    const [cmd,...rest]=text.split(/\s+/),sw=settings().switches;
    const pin=settings().requirePin!==false?rest.shift():undefined;
    if(settings().requirePin===false && /^\d{4,8}$/.test(rest[0]||''))rest.shift();
    const need = { '/screen': 'screen', '/pc': 'control' }[cmd] || 'power';
    if (!sw[need]) return telegram.send(chatId, `คำสั่งนี้ปิดอยู่ เปิดได้ที่ ตั้งค่า › Telegram บนคอม (${need === 'screen' ? 'ดูหน้าจอ' : need === 'control' ? 'สั่งงานคอม' : 'ปิด/ล็อกเครื่อง'})`);
    if (settings().requirePin!==false && !checkPin(pin || '')) return telegram.send(chatId, `ต้องใส่ PIN เช่น ${cmd} 1234${cmd === '/pc' ? ' เปิด Spotify' : ''}`);
    if (cmd === '/screen') return telegram.sendFile(chatId, 'photo', await remote.screen(), 'screen.jpg', 'image/jpeg', 'หน้าจอตอนนี้');
    if (cmd === '/pc') return telegram.send(chatId, await remote.pc(rest.join(' '),chatId));
    return telegram.send(chatId, await remote.power(cmd.slice(1)));
  }

  async function onMessage(m) {
    const { chatId } = m; const actor=String(chatId)+':'+String(m.userId||'');
    try {
      if(Array.isArray(settings().allowedUsers)&&!settings().allowedUsers.includes(m.userId))return;
      if (m.kind === 'callback') {
        const [, id, yes] = /^ask:(\w+):(yes|no)$/.exec(m.data) || [];
        const request = asks.get(id),resolve=request?.chatId===chatId?request.resolve:null;
        if (resolve) { asks.delete(id); resolve(yes === 'yes'); await telegram.send(chatId, yes === 'yes' ? 'อนุญาตแล้ว กำลังทำ…' : 'ไม่ทำนะ'); }
        const quick = /^m:(s|r|t):(\w{6,40})$/.exec(m.data || '');
        if (quick) return await reply(chatId, { s: `สรุปเมล id ${quick[2]} ให้หน่อย`, r: `ร่างคำตอบเมล id ${quick[2]} ให้หน่อย ยังไม่ต้องส่ง`, t: `อ่านเมล id ${quick[2]} แล้วเพิ่มสิ่งที่ฉันต้องทำลงรายการงาน` }[quick[1]]);
        if (coding && m.data === 'code:diff') await codeCommand(chatId, '/diff');
        if (coding && m.data === 'code:commit') await codeCommand(chatId, '/commit');
        return;
      }
      if (!settings().switches.chat) {voiceJobs.delete(actor);return telegram.send(chatId, 'การคุยผ่าน Telegram ปิดอยู่ เปิดได้ที่ ตั้งค่า › Telegram บนคอม');}
      if (m.kind === 'text') {
        const pending=voiceJobs.get(actor);
        if(pending && Date.now()>=pending.until){voiceJobs.delete(actor);return telegram.send(chatId,'คำสั่งเสียงหมดเวลาแล้ว กรุณาส่งคำสั่งใหม่');}
        if(pending && /^(?:\/cancel|ยกเลิก|ไม่ต้อง)$/i.test(m.text.trim())){voiceJobs.delete(actor);return telegram.send(chatId,'ยกเลิกคำสั่งเสียงแล้ว');}
        if(pending && /^\d{4,8}$/.test(m.text.trim())){
          if(!checkPin(m.text.trim())){if(++pending.attempts>=3)voiceJobs.delete(actor);return telegram.send(chatId,pending.attempts>=3?'PIN ไม่ถูกต้อง ยกเลิกคำสั่งแล้ว กรุณาสั่งใหม่':'PIN ไม่ถูกต้อง ลองใหม่หรือส่ง /cancel');}
          voiceJobs.delete(actor);
          if(!settings().switches.control)return telegram.send(chatId,'การสั่งงานคอมจากมือถือปิดอยู่ จึงยังไม่ได้ทำงาน');
          return telegram.send(chatId,await remote.pc(pending.task,chatId));
        }
        if(m.text.startsWith('/'))voiceJobs.delete(actor);
        if(/^\d{4,8}$/.test(m.text.trim()))return telegram.send(chatId,'ไม่มีคำสั่งเสียงรอยืนยัน กรุณาส่งคำสั่งก่อน');
        if (/^\/(start|help)\b/.test(m.text)) return telegram.send(chatId, HELP);
        if (/^\/new\b/.test(m.text)) { historyFor(chatId).length = 0; return telegram.send(chatId, 'เริ่มเรื่องใหม่แล้ว'); }
        if (remote && /^\/(screen|pc|lock|sleep|shutdown|restart)\b/.test(m.text)) return await remoteCommand(chatId, m.text);
        if (coding && m.text.startsWith('/') && (await codeCommand(chatId, m.text)) !== false) return undefined;
        if (coding && modes.get(chatId) === 'code') return await code(chatId, m.text);
        return await reply(chatId, m.text);
      }
      if (m.kind === 'voice') {
        await telegram.typing(chatId, 'record_voice');
        const wav = await media('toWav', { data: (await telegram.download(m.fileId)).toString('base64'), mime: m.mime });
        const heard = (await transcribe(Buffer.from(wav, 'base64'))).trim();
        if (!heard) return telegram.send(chatId, 'ไม่ได้ยินอะไรเลย ลองอัดใหม่อีกทีนะ');
        if(/^\d{4,8}$/.test(heard))return telegram.send(chatId,'กรุณาพิมพ์ PIN ในแชตเพื่อยืนยันคำสั่ง ไม่ต้องอัดเสียงรหัส');
        await telegram.send(chatId, `🎙 ได้ยินว่า: ${heard}`);
        if(voiceJobs.has(actor)&&/^(?:ยกเลิก|ไม่ต้อง|หยุด)(?:ครับ|ค่ะ|คะ)?$/.test(heard)){voiceJobs.delete(actor);return telegram.send(chatId,'ยกเลิกคำสั่งเสียงแล้ว');}
        if (coding && modes.get(chatId) === 'code') return await code(chatId, heard);
        if(remote){
          const {computerTask}=await import('../renderer/js/computer-intent.js');
          const task=computerTask(heard);
          if(task){
            if(Array.isArray(settings().allowedUsers)&&!settings().allowedUsers.includes(m.userId))return;
            if(!settings().switches.control)return telegram.send(chatId,'คำสั่งนี้ต้องเปิด ตั้งค่า › Telegram › สั่งงานคอมจากมือถือ ก่อนค่ะ');
            if(settings().requirePin===false)return telegram.send(chatId,await remote.pc(task,chatId));
            voiceJobs.set(actor,{task,until:Date.now()+90000,attempts:0});
            return telegram.send(chatId,`ต้องการทำงานบนคอม: ${task}\nพิมพ์ PIN ของคุณภายใน 90 วินาทีเพื่อยืนยันคำสั่งนี้ หรือส่ง /cancel เพื่อยกเลิก`);
          }
        }
        return await reply(chatId, heard, { heardVoice: true });
      }
      if (m.kind === 'photo') {
        if (coding && modes.get(chatId) === 'code') { // a mockup or a screenshot: saved in the project for the agent to look at
          const file = coding.saveImage(settings().project, await telegram.download(m.fileId));
          return await code(chatId, `${m.caption || 'ทำให้หน้าตาเหมือนรูปนี้'}\n(ดูรูปที่ ${file})`);
        }
        const image = (await telegram.download(m.fileId)).toString('base64');
        return await reply(chatId, m.caption || 'ดูรูปนี้แล้วบอกหน่อยว่าเป็นอะไร มีอะไรน่าสนใจ', { images: [image] });
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
    const s = settings(), chatId = alert.chatId || s.chatId;
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

  return { onMessage, notify, confirm, history, get mode() { return mode; } };
}

module.exports = { createPhone, HELP };

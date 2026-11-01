'use strict';

// The agent hub (agents.js) from your phone, like Claude Code's Remote Control but for any agent:
// /agents lists the live sessions, /new claude|codex project starts one, /use picks one; then what
// you type or say goes to it (while it works: added to the turn under way). Its work shows in one
// message rewritten as it goes; permissions and questions come with buttons; then its answer.

const HELP = `🧠 Agent สด (Claude Code / Codex แบบ Remote Control):
/agents ดู session ที่เปิดอยู่ · /use รหัส เลือก session
/new claude ชื่อโปรเจกต์ [งาน] (หรือ codex) เริ่ม session ใหม่
/resume claude ชื่อโปรเจกต์ ต่อจาก session ครั้งก่อน
เลือกแล้ว ข้อความและเสียงจะส่งเข้า session (ระหว่างทำงาน = พิมพ์แทรก)
/interrupt หยุดงานรอบนี้ · /end ปิด session · /chat กลับมาคุยปกติ`;

const short = (v, n) => { const s = String(v ?? '').trim(); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };

// setProject(name): the session you pick is Vibecode's project too (/diff, /commit, /pr, /undo on it);
// agentOf(project): the agent a Vibecode project was made with
function createAgentPhone({ telegram, agents, settings, projectDir, getResume = () => null, saveResume = () => {}, setProject = () => {}, agentOf = () => 'claude', log = () => {} }) {
  let current = null; // the session what you send goes to
  let typed = null;   // a question of its that your next message answers: an asks key
  const live = new Map(); // session -> { lines, last, messageId, timer, sending }
  const asks = new Map(); // short key (for the buttons) -> { id, askId, kind, options, messageId }
  let next = 0;
  const chat = () => settings().chatId;
  const info = (id) => agents.list().find((s) => s.id === id);
  const label = (id) => { const s = info(id); return s ? `${s.agent} · ${s.title}` : id; };

  // her live message for a session's turn: written once, then rewritten (at most every 1.5 s)
  async function flush(id) {
    const l = live.get(id);
    if (!l || !chat()) return;
    l.timer = null;
    if (l.sending) { l.timer = setTimeout(() => flush(id), 500); return; }
    const body = [`🧠 ${label(id)} · กำลังทำ`, ...l.lines.slice(-14)].join('\n');
    l.sending = true;
    try {
      if (l.messageId) await telegram.edit(chat(), l.messageId, body).catch(() => {});
      else l.messageId = (await telegram.send(chat(), body))?.message_id;
    } catch (err) { log(`[agent-phone] ${err.message}`); } finally { l.sending = false; }
  }
  const line = (id, text) => {
    const l = live.get(id) || { lines: [] };
    live.set(id, l);
    l.lines.push(text);
    if (!l.timer) l.timer = setTimeout(() => flush(id), 1500);
  };

  async function onEvent(e) {
    const { id } = e;
    if (e.type === 'session') { const s = info(id); if (s) saveResume(s.title, s.agent, e.resume); return; }
    if (!chat()) return;
    if (e.type === 'text') { line(id, `💬 ${short(e.text, 300)}`); live.get(id).last = e.text; return; }
    if (e.type === 'tool') { line(id, `🔧 ${short(e.label, 140)}`); return; }
    if (e.type === 'ask') {
      clearTimeout(live.get(id)?.timer); await flush(id);
      const key = (++next).toString(36);
      const ask = { id, askId: e.askId, kind: e.kind, options: e.options || [] };
      asks.set(key, ask);
      if (e.kind === 'question') {
        typed = key;
        const buttons = ask.options.slice(0, 6).map((o, i) => [{ text: short(o, 40), data: `ag:${key}:o${i}` }]);
        ask.messageId = (await telegram.send(chat(), `❓ ${label(id)} ถาม:\n${short(e.title, 1500)}\n\nกดตัวเลือก หรือพิมพ์ตอบได้เลย`, buttons))?.message_id;
      } else if (!settings().switches?.approve) {
        await telegram.send(chat(), `🔐 ${label(id)} ขออนุญาต: ${short(e.title, 600)}\n(อนุมัติจากมือถือปิดอยู่ ตอบบนคอม)`);
      } else {
        ask.messageId = (await telegram.send(chat(), `🔐 ${label(id)} ขออนุญาต:\n${short(e.title, 1500)}`,
          [[{ text: '✓ อนุญาต', data: `ag:${key}:a` }, { text: '✓ ตลอด session', data: `ag:${key}:s` }], [{ text: '✗ ไม่อนุญาต', data: `ag:${key}:d` }]]))?.message_id;
      }
      return;
    }
    if (e.type === 'turn') {
      const l = live.get(id);
      clearTimeout(l?.timer); live.delete(id);
      if (l?.messageId) await telegram.edit(chat(), l.messageId, [`🧠 ${label(id)} · จบรอบ`, ...l.lines.slice(-14)].join('\n')).catch(() => {});
      await telegram.send(chat(), e.status === 'error' ? `⚠️ ${label(id)}: ${e.text || 'ทำไม่สำเร็จ'}` : `✅ ${label(id)}\n${short(l?.last || 'เสร็จแล้ว', 3500)}`).catch(() => {});
      return;
    }
    if (e.type === 'answered') { // answered on the computer: its buttons here go
      for (const [key, a] of asks) {
        if (a.id !== id || a.askId !== e.askId) continue;
        asks.delete(key); if (typed === key) typed = null;
        if (a.messageId) await telegram.edit(chat(), a.messageId, `${a.kind === 'question' ? '❓' : '🔐'} ${label(id)}
→ ตอบบนคอมแล้ว`).catch(() => {});
      }
      return;
    }
    if (e.type === 'closed') {
      live.delete(id);
      for (const [key, a] of asks) if (a.id === id) asks.delete(key);
      if (current === id) current = null;
      await telegram.send(chat(), `⏹ ปิด session ${id} แล้ว`).catch(() => {});
    }
  }

  // your answer (a button, or what you typed): to its session, and the question marked answered
  async function answer(chatId, key, value, shown) {
    const ask = asks.get(key);
    if (!ask) return telegram.send(chatId, 'คำถามนี้ตอบไปแล้ว หรือ session ปิดไปแล้ว');
    asks.delete(key);
    if (typed === key) typed = null;
    agents.answer(ask.id, ask.askId, value);
    if (ask.messageId) await telegram.edit(chatId, ask.messageId, `${ask.kind === 'question' ? '❓' : '🔐'} ${label(ask.id)}\n→ ${shown}`).catch(() => {});
    return true;
  }

  async function callback(chatId, data) {
    const m = /^ag:(\w+):(a|s|d|o\d+)$/.exec(data || '');
    if (!m) return false;
    const [, key, pick] = m, ask = asks.get(key);
    if (pick[0] === 'o') { const text = ask?.options[Number(pick.slice(1))] || ''; await answer(chatId, key, { decision: 'allow', text }, text); }
    else await answer(chatId, key, { decision: { a: 'allow', s: 'always', d: 'deny' }[pick] }, { a: 'อนุญาตแล้ว', s: 'อนุญาตตลอด session นี้', d: 'ไม่อนุญาต' }[pick]);
    return true;
  }

  // a command of the hub's, or (with a session picked) what you said to it; false: not for the hub
  async function command(chatId, text) {
    const [cmd, ...rest] = text.trim().split(/\s+/);
    switch (cmd) {
      case '/agents': {
        const list = agents.list();
        await telegram.send(chatId, list.length ? list.map((s) => `${s.id === current ? '▶' : '•'} ${s.id} · ${s.agent} · ${s.title} · ${s.status}`).join('\n') : 'ยังไม่มี session · /new claude ชื่อโปรเจกต์');
        return true;
      }
      case '/new': case '/resume': {
        const [agent, project, ...task] = rest;
        if (cmd === '/new' && !['claude', 'codex'].includes(agent)) return false; // her own /new: a new topic
        if (!['claude', 'codex'].includes(agent) || !project) { await telegram.send(chatId, `ใช้แบบนี้: ${cmd} claude ชื่อโปรเจกต์ (หรือ codex)`); return true; }
        const resume = cmd === '/resume' ? getResume(project, agent) : null;
        if (cmd === '/resume' && !resume) { await telegram.send(chatId, `ยังไม่เคยมี session ${agent} ของ ${project} · ใช้ /new`); return true; }
        current = agents.start({ agent, cwd: projectDir(project), title: project, resume }); setProject(project);
        await telegram.send(chatId, `🧠 ${cmd === '/resume' ? 'ต่อ' : 'เริ่ม'} ${agent} ใน ${project} แล้ว (${current}) · พิมพ์หรือส่งเสียงสั่งงานได้เลย`);
        if (task.length) await agents.send(current, task.join(' '));
        return true;
      }
      case '/use':
        if (!info(rest[0])) { await telegram.send(chatId, 'ไม่มี session นี้ · /agents ดูรายชื่อ'); return true; }
        current = rest[0]; setProject(info(current).title); await telegram.send(chatId, `▶ ${label(current)}`); return true;
      case '/interrupt':
        if (current) agents.interrupt(current);
        await telegram.send(chatId, current ? 'สั่งหยุดรอบนี้แล้ว' : 'ยังไม่ได้เลือก session'); return true;
      case '/end':
        await telegram.send(chatId, current && agents.close(current) ? 'กำลังปิด session…' : 'ยังไม่ได้เลือก session'); return true;
      case '/chat': current = null; return false; // and her usual chat takes it from there
      default: break;
    }
    if (!current || text.startsWith('/')) return false;
    if (typed && asks.get(typed)?.id === current) { await answer(chatId, typed, { decision: 'allow', text }, text); return true; }
    const working = info(current)?.status === 'working';
    await agents.send(current, text);
    if (working) await telegram.send(chatId, '➕ ส่งแทรกให้ Agent แล้ว');
    else line(current, `👤 ${short(text, 200)}`);
    return true;
  }

  // Vibecode's /code and /create: the project's live session (open already, or picked up again, or new)
  async function open(chatId, project, agent = agentOf(project)) {
    const live = agents.list().find((s) => s.title === project && s.agent === agent);
    if (live) { current = live.id; setProject(project); return telegram.send(chatId, `▶ ${label(current)} · พิมพ์หรือส่งเสียงสั่งงานได้เลย · /chat เพื่อกลับ`); }
    return command(chatId, `${getResume(project, agent) ? '/resume' : '/new'} ${agent} ${project}`);
  }

  return { onEvent, command, callback, open, get current() { return current; }, HELP };
}

module.exports = { createAgentPhone, HELP };

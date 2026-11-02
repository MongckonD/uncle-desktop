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
  const chats = new Map(), subscribers = new Map();
  const state = chatId => { if (!chats.has(chatId)) chats.set(chatId, { current: null }); return chats.get(chatId); };
  const pick = (chatId, id) => { state(chatId).current = id; if (!subscribers.has(id)) subscribers.set(id, new Set()); subscribers.get(id).add(chatId); };
  const keyFor = (id, chatId) => `${id}:${chatId}`;
  const live = new Map(); // session -> { lines, last, messageId, timer, sending }
  const asks = new Map(); // short key (for the buttons) -> { id, askId, kind, options, messageId }
  let next = 0;
  const chat = () => settings().chatId;
  const projectPicked = (chatId, project) => { if (chatId === chat()) setProject(project); };
  const info = (id) => agents.list().find((s) => s.id === id);
  const label = (id) => { const s = info(id); return s ? `${s.agent} · ${s.title}` : id; };

  // her live message for a session's turn: written once, then rewritten (at most every 1.5 s)
  async function flush(id, chatId) {
    const l = live.get(keyFor(id, chatId));
    if (!l || !chatId) return;
    l.timer = null;
    if (l.sending) { l.timer = setTimeout(() => flush(id, chatId), 500); return; }
    const body = [`🧠 ${label(id)} · กำลังทำ`, ...l.lines.slice(-14)].join('\n');
    l.sending = true;
    try {
      if (l.messageId) await telegram.edit(chatId, l.messageId, body).catch(() => {});
      else l.messageId = (await telegram.send(chatId, body))?.message_id;
    } catch (err) { log(`[agent-phone] ${err.message}`); } finally { l.sending = false; }
  }
  const line = (id, text, chatId) => {
    const l = live.get(keyFor(id, chatId)) || { lines: [] };
    live.set(keyFor(id, chatId), l);
    l.lines.push(text); if (l.lines.length > 14) l.lines.shift();
    if (!l.timer) l.timer = setTimeout(() => flush(id, chatId), 1500);
  };

  async function onEvent(e) {
    const { id } = e;
    if (e.type === 'session') {
      const s = info(id); if (s) saveResume(s.title, s.agent, e.resume);
      if (e.model) await Promise.all([...(subscribers.get(id) || (chat() ? [chat()] : []))].map(chatId => telegram.send(chatId, `🧠 ${label(id)} · พร้อมใช้โมเดล ${e.model}`)));
      return;
    }
    const targets = [...(subscribers.get(id) || (chat() ? [chat()] : []))];
    await Promise.all(targets.map(chatId => onChatEvent(e, chatId)));
    if (e.type === 'closed') subscribers.delete(id);
  }

  async function onChatEvent(e, chatId) {
    const { id } = e;
    if (e.type === 'text') { line(id, `💬 ${short(e.text, 300)}`, chatId); live.get(keyFor(id, chatId)).last = e.text; return; }
    if (e.type === 'tool') { line(id, `🔧 ${short(e.label, 140)}`, chatId); return; }
    if (e.type === 'ask') {
      const key = (++next).toString(36);
      const ask = { id, chatId, askId: e.askId, kind: e.kind, options: e.options || [], allowSession: e.allowSession !== false };
      asks.set(key, ask);
      clearTimeout(live.get(keyFor(id, chatId))?.timer); await flush(id, chatId);
      if (!asks.has(key)) return;
      if (e.kind === 'question') {
        const buttons = ask.options.slice(0, 6).map((o, i) => [{ text: short(o, 40), data: `ag:${key}:o${i}` }]);
        ask.messageId = (await telegram.send(chatId, `❓ ${label(id)} ถาม:\n${short(e.title, 1500)}\n\nกดตัวเลือก หรือพิมพ์ตอบได้เลย`, buttons))?.message_id;
      } else if (!settings().switches?.approve) {
        await telegram.send(chatId, `🔐 ${label(id)} ขออนุญาต: ${short(e.title, 600)}\n(อนุมัติจากมือถือปิดอยู่ ตอบบนคอม)`);
      } else {
        ask.messageId = (await telegram.send(chatId, `🔐 ${label(id)} ขออนุญาต:\n${short(e.title, 1500)}`,
          [[{ text: '✓ อนุญาต', data: `ag:${key}:a` }, ...(ask.allowSession ? [{ text: '✓ ตลอด session', data: `ag:${key}:s` }] : [])], [{ text: '✗ ไม่อนุญาต', data: `ag:${key}:d` }]]))?.message_id;
      }
      if (!asks.has(key) && ask.messageId) await telegram.edit(chatId, ask.messageId, 'คำถามหมดอายุแล้ว').catch(() => {});
      return;
    }
    if (e.type === 'turn') {
      const l = live.get(keyFor(id, chatId));
      clearTimeout(l?.timer); live.delete(keyFor(id, chatId));
      if (l?.messageId) await telegram.edit(chatId, l.messageId, [`🧠 ${label(id)} · จบรอบ`, ...l.lines.slice(-14)].join('\n')).catch(() => {});
      await telegram.send(chatId, e.status === 'interrupted' ? `⏹ ${label(id)} · หยุดโดยผู้ใช้` : e.status === 'error' ? `⚠️ ${label(id)}: ${e.text || 'ทำไม่สำเร็จ'}` : `✅ ${label(id)}\n${short(l?.last || 'เสร็จแล้ว', 3500)}`).catch(() => {});
      return;
    }
    if (e.type === 'answered') { // answered on the computer: its buttons here go
      for (const [key, a] of asks) {
        if (a.chatId !== chatId || a.id !== id || a.askId !== e.askId) continue;
        asks.delete(key);
        if (a.messageId) await telegram.edit(chatId, a.messageId, `${a.kind === 'question' ? '❓' : '🔐'} ${label(id)}
→ ${e.expired ? 'คำถามหมดอายุแล้ว' : 'ตอบบนคอมแล้ว'}`).catch(() => {});
      }
      return;
    }
    if (e.type === 'closed') {
      clearTimeout(live.get(keyFor(id, chatId))?.timer); live.delete(keyFor(id, chatId));
      for (const [key, a] of asks) if (a.id === id && a.chatId === chatId) { asks.delete(key); }
      if (state(chatId).current === id) state(chatId).current = null;
      await telegram.send(chatId, `⏹ ปิด session ${id} แล้ว`).catch(() => {});
    }
  }

  // your answer (a button, or what you typed): to its session, and the question marked answered
  async function answer(chatId, key, value, shown) {
    const ask = asks.get(key);
    if (!ask || ask.chatId !== chatId) return telegram.send(chatId, 'คำถามนี้ตอบไปแล้ว หรือไม่ใช่คำถามของแชตนี้');
    if (ask.kind === 'permission' && !settings().switches?.approve) return telegram.send(chatId, 'อนุมัติจากมือถือปิดอยู่ ตอบบนคอม');
    asks.delete(key);

    if (!agents.answer(ask.id, ask.askId, value)) return telegram.send(chatId, 'คำถามนี้ตอบไปแล้ว หรือหมดอายุแล้ว');
    if (ask.messageId) await telegram.edit(chatId, ask.messageId, `${ask.kind === 'question' ? '❓' : '🔐'} ${label(ask.id)}\n→ ${shown}`).catch(() => {});
    return true;
  }

  async function callback(chatId, data) {
    const m = /^ag:(\w+):(a|s|d|o\d+)$/.exec(data || '');
    if (!m) return false;
    const [, key, pick] = m, ask = asks.get(key);
    if (!ask || ask.chatId !== chatId) { await telegram.send(chatId, 'ไม่มีคำถามของแชตนี้'); return true; }
    if (pick === 's' && !ask.allowSession) { await telegram.send(chatId, 'Agent ไม่รองรับอนุมัติตลอด session สำหรับคำขอนี้'); return true; }
    if ((pick[0] === 'o' && (ask.kind !== 'question' || !ask.options[Number(pick.slice(1))])) || (pick[0] !== 'o' && ask.kind !== 'permission')) { await telegram.send(chatId, 'ตัวเลือกไม่ถูกต้อง'); return true; }
    if (pick[0] === 'o') { const text = ask?.options[Number(pick.slice(1))] || ''; await answer(chatId, key, { decision: 'allow', text }, text); }
    else await answer(chatId, key, { decision: { a: 'allow', s: 'always', d: 'deny' }[pick] }, { a: 'อนุญาตแล้ว', s: 'อนุญาตตลอด session นี้', d: 'ไม่อนุญาต' }[pick]);
    return true;
  }

  // a command of the hub's, or (with a session picked) what you said to it; false: not for the hub
  async function command(chatId, text) {
    let current = state(chatId).current;
    const [cmd, ...rest] = text.trim().split(/\s+/);
    switch (cmd) {
      case '/agents': {
        const list = agents.list();
        await telegram.send(chatId, list.length ? list.map((s) => `${s.id === current ? '▶' : '•'} ${s.id} · ${s.agent} · ${s.title} · ${s.status}`).join('\n') : 'ยังไม่มี session · /new claude ชื่อโปรเจกต์');
        return true;
      }
      case '/new': case '/resume': {
        const [agent, project, ...task] = rest;
        if (cmd === '/new' && !agent) { state(chatId).current = null; return false; }
        if (!['claude', 'codex'].includes(agent) || !project) { await telegram.send(chatId, `ใช้แบบนี้: ${cmd} claude ชื่อโปรเจกต์ (หรือ codex)`); return true; }
        const resume = cmd === '/resume' ? getResume(project, agent) : null;
        if (cmd === '/resume' && !resume) { await telegram.send(chatId, `ยังไม่เคยมี session ${agent} ของ ${project} · ใช้ /new`); return true; }
        current = agents.start({ agent, cwd: projectDir(project), title: project, resume }); pick(chatId, current); projectPicked(chatId, project);
        await telegram.send(chatId, `🧠 ${cmd === '/resume' ? 'ต่อ' : 'เริ่ม'} ${agent} ใน ${project} แล้ว (${current}) · พิมพ์หรือส่งเสียงสั่งงานได้เลย`);
        if (task.length) await agents.send(current, task.join(' '));
        return true;
      }
      case '/use':
        if (!info(rest[0])) { await telegram.send(chatId, 'ไม่มี session นี้ · /agents ดูรายชื่อ'); return true; }
        current = rest[0]; pick(chatId, current); projectPicked(chatId, info(current).title); await telegram.send(chatId, `▶ ${label(current)}`); return true;
      case '/interrupt':
        if (current) agents.interrupt(current);
        await telegram.send(chatId, current ? 'สั่งหยุดรอบนี้แล้ว' : 'ยังไม่ได้เลือก session'); return true;
      case '/end':
        await telegram.send(chatId, current && agents.close(current) ? 'กำลังปิด session…' : 'ยังไม่ได้เลือก session'); return true;
      case '/chat': state(chatId).current = null; await telegram.send(chatId, 'กลับมาคุยกับตัวละครแล้ว'); return true;
      default: break;
    }
    if (!current || text.startsWith('/')) return false;
    await say(chatId, text);
    return true;
  }
  // what you said to the picked session: the answer to its question, else a message (added to the turn under way while it works)
  async function say(chatId, text) {
    const { current } = state(chatId);
    const typed = [...asks].find(([, a]) => a.chatId === chatId && a.id === current && a.kind === 'question')?.[0];
    if (typed && asks.get(typed)?.id === current) return answer(chatId, typed, { decision: 'allow', text }, text);
    const working = info(current)?.status === 'working';
    await agents.send(current, text);
    return working ? telegram.send(chatId, '➕ ส่งแทรกให้ Agent แล้ว') : line(current, `👤 ${short(text, 200)}`, chatId);
  }

  // Vibecode's /code and /create: the project's live session (open already, or picked up again, or new)
  async function open(chatId, project, agent = agentOf(project)) {
    const live = agents.list().find((s) => s.title === project && s.agent === agent);
    if (live) { const current = live.id; pick(chatId, current); projectPicked(chatId, project); return telegram.send(chatId, `▶ ${label(current)} · พิมพ์หรือส่งเสียงสั่งงานได้เลย · /chat เพื่อกลับ`); }
    return command(chatId, `${getResume(project, agent) ? '/resume' : '/new'} ${agent} ${project}`);
  }

  return { onEvent, command, callback, open, say, leave: chatId => { state(chatId).current = null; }, busy: (project) => agents.list().some((s) => s.title === project && s.status !== 'idle'), projectFor: chatId => info(state(chatId).current)?.title, currentFor: chatId => state(chatId).current, get project() { return info(state(chat()).current)?.title; }, get current() { return state(chat()).current; }, HELP };
}

module.exports = { createAgentPhone, HELP };

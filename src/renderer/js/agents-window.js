'use strict';

// Her coding-agent sessions on the computer: the list, one session's work, its questions with
// buttons, and a box to talk to it. The same sessions as your phone's; answer either side.
const host = window.agentsHost;
const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
let current = null, sessions = [];
const pending = new Map(); // askId -> its card, while unanswered

const fail = (err) => { $('error').textContent = String(err?.message || err).replace(/^Error invoking remote method '[^']+': (?:Error: )?/, ''); };
const run = (fn) => (...args) => { $('error').textContent = ''; return Promise.resolve(fn(...args)).catch(fail); };

async function refresh() {
  sessions = await host.list();
  $('list').replaceChildren(...sessions.map((s) => {
    const li = el('li', s.id === current ? 'on' : '');
    const b = el('button', '', `${s.agent} · ${s.title}`);
    b.append(el('small', `status ${s.status}`, s.status === 'asking' ? 'รอคุณตอบ' : s.status === 'working' ? 'กำลังทำ' : 'รอสั่ง'));
    b.onclick = run(() => pick(s.id));
    li.append(b); return li;
  }));
  const s = sessions.find((x) => x.id === current);
  for (const id of ['interrupt', 'end', 'text']) $(id).disabled = !s;
  document.querySelector('#say button').disabled = !s;
  $('title').textContent = s ? `${s.agent} · ${s.title}` : 'เลือกหรือเริ่ม session';
}

function show(e) {
  const log = $('log');
  if (e.type === 'text') log.append(el('li', 'text', e.text));
  else if (e.type === 'user') log.append(el('li', 'user', e.text));
  else if (e.type === 'tool') log.append(el('li', 'tool', `🔧 ${e.label}`));
  else if (e.type === 'turn') log.append(el('li', `turn ${e.status}`, e.status === 'error' ? `⚠️ ${e.text || 'ทำไม่สำเร็จ'}` : '— จบรอบ —'));
  else if (e.type === 'ask') {
    const card = el('li', 'ask');
    card.append(el('div', 'q', `${e.kind === 'question' ? '❓' : '🔐'} ${e.title}`));
    const row = el('div', 'row');
    const reply = (decision, text = '') => run(() => host.answer(current, e.askId, decision, text))();
    if (e.kind === 'question') {
      for (const o of e.options || []) { const b = el('button', '', o); b.onclick = () => reply('allow', o); row.append(b); }
      row.append(el('span', 'hint', 'หรือพิมพ์ตอบในช่องด้านล่าง'));
    } else {
      for (const [d, t] of [['allow', '✓ อนุญาต'], ['always', '✓ ตลอด session'], ['deny', '✗ ไม่อนุญาต']]) { const b = el('button', d, t); b.onclick = () => reply(d); row.append(b); }
    }
    card.append(row); log.append(card); pending.set(e.askId, card);
  } else if (e.type === 'answered') {
    const card = pending.get(e.askId);
    if (card) { card.querySelector('.row').replaceChildren(el('span', 'done', `→ ${e.decision === 'deny' ? 'ไม่อนุญาต' : e.text || (e.decision === 'always' ? 'อนุญาตตลอด session' : 'อนุญาตแล้ว')}`)); pending.delete(e.askId); }
  } else return;
  log.scrollTop = log.scrollHeight;
}

async function pick(id) {
  current = id; pending.clear(); $('log').replaceChildren();
  for (const e of await host.history(id)) show(e);
  await refresh(); $('text').focus();
}

host.onEvent((e) => { if (e.id === current) show(e); if (['ask', 'answered', 'turn', 'closed', 'session'].includes(e.type)) refresh(); if (e.type === 'closed' && e.id === current) { current = null; refresh(); } });

$('new').onsubmit = run(async (ev) => { ev.preventDefault(); await pick(await host.start($('agent').value, $('project').value, false)); });
$('resume').onclick = run(async () => pick(await host.start($('agent').value, $('project').value, true)));
$('say').onsubmit = run(async (ev) => {
  ev.preventDefault();
  const text = $('text').value.trim();
  if (!text || !current) return;
  $('text').value = '';
  // its question open: what you typed answers it; else it's a message (added to the turn while it works)
  const open = [...pending.entries()].find(([, card]) => card.querySelector('.hint'));
  if (open) await host.answer(current, open[0], 'allow', text);
  else { show({ type: 'user', text }); await host.send(current, text); }
});
$('text').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('say').requestSubmit(); } });
$('interrupt').onclick = run(() => host.interrupt(current));
$('end').onclick = run(() => host.close(current));

run(async () => {
  const projects = await host.projects();
  $('project').replaceChildren(...projects.map((p) => { const o = el('option', '', p); o.value = p; return o; }));
  if (!projects.length) fail('ยังไม่มีโปรเจกต์ในโฟลเดอร์ Vibecode (สร้างด้วย /create ชื่อ ใน Telegram หรือสร้างโฟลเดอร์เอง)');
  await refresh();
  if (sessions[0]) await pick(sessions[0].id);
})();

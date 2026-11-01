'use strict';

// Your to-do list, kept on this computer (tasks.json beside her settings): her AI adds, lists and
// ticks off tasks as chat tools, and she nags you about one due within the hour. Nothing to set up;
// Todoist or Google Tasks can still come in as MCP servers.

const fs = require('node:fs');

function createTasks({ file, now = () => Date.now() }) {
  const load = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return []; } };
  const save = (list) => fs.writeFileSync(file, JSON.stringify(list.slice(-300), null, 1));

  function add(text, due) {
    text = String(text || '').trim().slice(0, 300);
    if (!text) throw new Error('ไม่มีชื่องาน');
    const when = due ? Date.parse(due) : NaN;
    const task = { id: now().toString(36) + Math.random().toString(36).slice(2, 6), text, due: Number.isFinite(when) ? when : null, done: false, nagged: false };
    save([...load(), task]);
    return task;
  }
  const open = () => load().filter((t) => !t.done).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
  // by its id, else the first open task whose text contains what you said
  function done(which) {
    const list = load(), key = String(which || '').toLowerCase();
    const task = list.find((t) => !t.done && t.id === which) || list.find((t) => !t.done && t.text.toLowerCase().includes(key));
    if (!task) throw new Error(`ไม่พบงาน "${which}"`);
    task.done = true; save(list);
    return task;
  }
  // open tasks due within the hour that she hasn't nagged about yet (now marked nagged)
  function dueSoon() {
    const list = load(), soon = list.filter((t) => !t.done && !t.nagged && t.due && t.due - now() < 3600000);
    for (const t of soon) t.nagged = true;
    if (soon.length) save(list);
    return soon;
  }
  const line = (t) => `- [${t.id}] ${t.text}${t.due ? ` (ครบกำหนด ${new Date(t.due).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })})` : ''}`;

  return { add, open, done, dueSoon, line };
}

module.exports = { createTasks };

'use strict';

// Her background jobs: a news brief at 8:00, a check every 3 hours… Each job runs at a time of day
// ("HH:MM", once a day) or every so many minutes, never twice at once, and only while it's on.
// What they find goes to notify() (her bubble, and Telegram when that's set up).

function createJobs({ now = () => new Date(), log = () => {} } = {}) {
  const jobs = new Map(); // id -> { at, every, run, enabled, last, running }
  let timer = null;

  // at: "08:00" (daily) or a function returning it; every: minutes (or a function); enabled: () => bool
  function add(id, { at, every, run, enabled = () => true }) {
    jobs.set(id, { at, every, run, enabled, last: null, running: false });
  }

  const value = (v) => (typeof v === 'function' ? v() : v);
  const day = (d) => d.toISOString().slice(0, 10);
  function due(job, t) {
    if (job.retryAt && t < job.retryAt) return false;
    const at = value(job.at), every = value(job.every);
    if (every) return !job.last || t - job.last >= every * 60000;
    if (!/^\d{1,2}:\d{2}$/.test(at || '')) return false;
    const [h, m] = at.split(':').map(Number);
    const slot = new Date(t); slot.setHours(h, m, 0, 0);
    // today's slot passed, and not run since it (a late start still runs it, within 3 hours)
    return t >= slot && t - slot < 3 * 3600000 && !(job.last && job.last >= slot);
  }

  async function runJob(id, job, t) {
    const before = job.last;
    job.running = true; job.last = t;
    // failed (no network yet, AI down): not done, tried again in 10 minutes
    try { await job.run(); } catch (err) { log(`[job ${id}] ${err.message}`); job.last = before; job.retryAt = +t + 10 * 60000; } finally { job.running = false; }
  }
  // every due, enabled job, now
  function tick() {
    const t = now();
    for (const [id, job] of jobs) if (!job.running && job.enabled() && due(job, t)) runJob(id, job, t);
  }
  // one now, whatever its schedule (a button, or "brief me" in chat)
  async function run(id) {
    const job = jobs.get(id);
    if (!job) throw new Error(`ไม่มีงาน ${id}`);
    if (!job.running) await runJob(id, job, now());
  }

  return {
    add, run, tick, due,
    start() { timer = setInterval(tick, 30000); timer.unref?.(); },
    stop() { clearInterval(timer); },
  };
}

module.exports = { createJobs };

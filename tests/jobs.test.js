const test = require('node:test');
const assert = require('node:assert/strict');
const { createJobs } = require('../src/main/jobs');

test('jobs: a daily one runs once after its time, an interval one every N minutes, an off one never', async () => {
  let t = new Date(2026, 10, 1, 7, 59);
  const ran = [];
  const jobs = createJobs({ now: () => t });
  jobs.add('brief', { at: '08:00', run: () => ran.push('brief') });
  jobs.add('poll', { every: 30, run: () => ran.push('poll') });
  jobs.add('off', { every: 1, enabled: () => false, run: () => ran.push('off') });
  jobs.tick(); await null;
  assert.deepEqual(ran, ['poll']);
  t = new Date(2026, 10, 1, 8, 1); jobs.tick(); await null;
  assert.deepEqual(ran, ['poll', 'brief']);
  t = new Date(2026, 10, 1, 8, 20); jobs.tick(); await null;
  assert.deepEqual(ran, ['poll', 'brief']);
  t = new Date(2026, 10, 1, 8, 30); jobs.tick(); await null;
  assert.deepEqual(ran, ['poll', 'brief', 'poll']);
  t = new Date(2026, 10, 2, 8, 0); jobs.tick(); await null;
  assert.ok(ran.filter((r) => r === 'brief').length === 2);
  t = new Date(2026, 10, 3, 14, 0); jobs.tick(); await null; // too late for today's 8:00
  assert.equal(ran.filter((r) => r === 'brief').length, 2);
});

test('jobs: a daily one that fails runs again 10 minutes later, not tomorrow', async () => {
  let t = new Date(2026, 10, 1, 8, 0), tries = 0;
  const jobs = createJobs({ now: () => t });
  jobs.add('brief', { at: '08:00', run: async () => { tries++; if (tries === 1) throw new Error('offline'); } });
  jobs.tick(); await new Promise((r) => setImmediate(r));
  assert.equal(tries, 1);
  t = new Date(2026, 10, 1, 8, 5); jobs.tick(); await new Promise((r) => setImmediate(r));
  assert.equal(tries, 1);
  t = new Date(2026, 10, 1, 8, 11); jobs.tick(); await new Promise((r) => setImmediate(r));
  assert.equal(tries, 2);
  t = new Date(2026, 10, 1, 8, 30); jobs.tick(); await new Promise((r) => setImmediate(r));
  assert.equal(tries, 2);
});

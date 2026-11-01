const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createVibe } = require('../src/main/vibe');

// commits in the tests need a name, CI has none
Object.assign(process.env, { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' });

test('vibe: create a project, diff and commit it, refuse bad names', async () => {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'uncle-vibe-'));
  const state = {};
  const vibe = createVibe({ getSettings: () => ({ workspace: ws }), saveState: (n, st) => { state[n] = { ...st }; } });
  try {
    assert.throws(() => vibe.dirOf('../etc'), /ชื่อโปรเจกต์/);
    await vibe.create('cafe-shop');
    assert.deepEqual(vibe.projects(), ['cafe-shop']);
    assert.equal(state['cafe-shop'].agent, 'claude');
    fs.writeFileSync(path.join(vibe.dirOf('cafe-shop'), 'index.html'), '<h1>cafe</h1>');
    assert.match((await vibe.diff('cafe-shop')).stat, /index\.html/);
    assert.match(await vibe.commit('cafe-shop', 'first page'), /first page/);
  } finally { fs.rmSync(ws, { recursive: true, force: true }); }
});

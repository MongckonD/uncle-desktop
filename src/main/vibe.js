'use strict';

// Vibecode projects from your phone: one workspace folder, a folder each (git init). The coding agents
// run in them as live sessions (agents.js); here: create, diff, commit, PR, undo, a picture saved for them.

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const NAME = /^[a-z0-9][a-z0-9-_]{0,48}$/i;
// git and gh: real programs, no shell (so a commit message is never a command)
const exec = (file, args, cwd) => new Promise((resolve, reject) => execFile(file, args, { cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, out, errOut) => (err ? reject(new Error((errOut || err.message).trim().slice(0, 400))) : resolve(out.trim()))));

function createVibe({ getSettings, saveState }) {
  const workspace = () => getSettings().workspace;
  const dirOf = (name) => {
    if (!NAME.test(name || '')) throw new Error('ชื่อโปรเจกต์ใช้ได้แค่ a-z 0-9 - _ (ไม่เกิน 49 ตัว)');
    return path.join(workspace(), name);
  };
  const projects = () => {
    try { return fs.readdirSync(workspace(), { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('.')).map((d) => d.name); } catch { return []; }
  };

  async function create(name, agent = 'claude') {
    const dir = dirOf(name);
    if (fs.existsSync(dir)) throw new Error(`มีโปรเจกต์ ${name} อยู่แล้ว`);
    fs.mkdirSync(dir, { recursive: true });
    await exec('git', ['init', '-q'], dir);
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n.uncle/\n.env\n');
    saveState(name, { agent: agent === 'codex' ? 'codex' : 'claude', session: null });
    return dir;
  }

  // what changed since the last commit: the stats, and the diff itself (cut short)
  async function diff(name) {
    const dir = dirOf(name);
    await exec('git', ['add', '-A', '--intent-to-add'], dir).catch(() => {});
    const stat = await exec('git', ['diff', '--stat'], dir);
    const text = await exec('git', ['diff'], dir);
    return { stat: stat || 'ยังไม่มีอะไรเปลี่ยน', text };
  }
  async function commit(name, message) {
    const dir = dirOf(name);
    await exec('git', ['add', '-A'], dir);
    await exec('git', ['commit', '-q', '-m', message || 'Changes from Uncle Desktop'], dir);
    return exec('git', ['log', '--oneline', '-1'], dir);
  }
  // a branch of its own, pushed, and a pull request (gh must be signed in; the repo needs a remote)
  async function pullRequest(name, title) {
    const dir = dirOf(name);
    const branch = `uncle/${Date.now().toString(36)}`;
    await exec('git', ['checkout', '-q', '-b', branch], dir);
    await exec('git', ['push', '-q', '-u', 'origin', branch], dir);
    return exec('gh', ['pr', 'create', '--fill', ...(title ? ['--title', title] : [])], dir);
  }
  const undo = async (name) => { await exec('git', ['revert', '--no-edit', 'HEAD'], dirOf(name)); return exec('git', ['log', '--oneline', '-1'], dirOf(name)); };
  // a picture from your phone, in the project (.uncle/inbox, kept out of git) for the agent to read
  function saveImage(name, bytes) {
    const file = path.join(dirOf(name), '.uncle', 'inbox', `${Date.now()}.jpg`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, bytes);
    return path.relative(dirOf(name), file).split(path.sep).join('/');
  }

  return { projects, create, diff, commit, pullRequest, undo, dirOf, saveImage };
}

module.exports = { createVibe, NAME };

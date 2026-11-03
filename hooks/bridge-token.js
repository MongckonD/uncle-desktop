'use strict';

// Shared secret for the local HTTP bridge.
// Capri writes a fresh token to her userData folder every launch; hooks and dev scripts read it
// back and send it in a header, so other programs on the machine can't post events or reach /debug.
// Lives in hooks/ (unpacked from the asar) because the hooks run under plain node.

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HEADER = 'x-capri-token';

// Same folder as Electron's app.getPath('appData') + 'capri-desktop' (see main.js)
function tokenFile() {
  if (process.env.CAPRI_TOKEN_FILE) return process.env.CAPRI_TOKEN_FILE;
  const home = os.homedir();
  const appData = process.platform === 'win32' ? process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
    : process.platform === 'darwin' ? path.join(home, 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(appData, 'capri-desktop', 'bridge-token');
}

// '' when Capri never ran or the file can't be read: the bridge will refuse, the hook stays quiet
function readToken(file = tokenFile()) {
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    return '';
  }
}

// Owner-only file, written to a temp name first so a hook never reads half a token
function createToken(file = tokenFile()) {
  const token = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, token, { mode: 0o600 });
  fs.renameSync(tmp, file);
  return token;
}

function sameToken(given, expected) {
  if (typeof given !== 'string' || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// For dev scripts that call /debug on a running app
function authHeaders() {
  return { 'content-type': 'application/json', [HEADER]: readToken() };
}

module.exports = { HEADER, tokenFile, readToken, createToken, sameToken, authHeaders };

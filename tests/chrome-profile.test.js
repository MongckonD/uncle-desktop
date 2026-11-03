'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromeArgs } = require('../src/main/launch');

const chromeHere = ['ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA']
  .some((v) => process.env[v] && fs.existsSync(path.join(process.env[v], 'Google', 'Chrome', 'Application', 'chrome.exe')));

test('web pages go to the pinned Chrome profile, as one argument, only http(s) and real profile folders', { skip: process.platform !== 'win32' || !chromeHere }, () => {
  const [exe, args] = chromeArgs('https://www.youtube.com/', 'Profile 1');
  assert.match(exe, /chrome\.exe$/);
  assert.deepEqual(args, ['--profile-directory=Profile 1', 'https://www.youtube.com/']);
  assert.deepEqual(chromeArgs('https://x.com/', 'Default')[1][0], '--profile-directory=Default');
});

test('no pinned profile, a strange one, or a link that is not a web page: the default browser opens it', () => {
  assert.equal(chromeArgs('https://www.youtube.com/', null), null);
  for (const profile of ['../Profile 1', 'Profile 1 --incognito', 'Profile', '"Profile 1"', 'Work']) assert.equal(chromeArgs('https://a.com/', profile), null, profile);
  for (const url of ['--remote-debugging-port=9222', 'file:///C:/a.txt', 'javascript:alert(1)', 'spotify:search:x']) assert.equal(chromeArgs(url, 'Profile 1'), null, url);
});

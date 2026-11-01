'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { wordPhonemes, thaiRuns, thaiNumber } = require('../src/main/thai-g2p');

test('Thai words read the way they sound', () => {
  const cases = {
    มาก: 'maːk', อากาศ: 'ʔaːˈkaːt', เลย: 'lɤːj', ช่วย: 'ʧʰuːaj', เรื่อง: 'rɯːaŋ', เดียว: 'diːaw', ไหม: 'maj', ไทย: 'tʰaj',
    ปลา: 'plaː', ความ: 'kʰwaːm', คน: 'kʰon', เป็น: 'pen', เกาะ: 'kɔʔ', จริง: 'ʧiŋ', อยาก: 'jaːk', ศูนย์: 'suːn', นะ: 'naʔ',
    ก็ได้: 'kɔˈdaj', สวัสดี: 'sawatdiː', ธรรมชาติ: 'tʰamˈʧʰaːt', ทราบ: 'saːp', ตำรวจ: 'tamˈruːat', เมษายน: 'meːsaːˈjon', อังกฤษ: 'ʔaŋˈkrɯt',
  };
  for (const [word, ph] of Object.entries(cases)) assert.strictEqual(wordPhonemes(word), ph, word);
});

test('tones for the Chinese voices follow Thai tone rules', () => {
  assert.strictEqual(wordPhonemes('ไหม', true), 'maj↗'); // rising
  assert.strictEqual(wordPhonemes('ได้', true), 'daj↘'); // falling
  assert.strictEqual(wordPhonemes('รัก', true), 'rak→'); // high
  assert.strictEqual(wordPhonemes('บอก', true), 'bɔːk↓'); // low
  assert.strictEqual(wordPhonemes('ดี', true), 'diː'); // mid
});

test('numbers, ๆ and English', () => {
  assert.strictEqual(thaiNumber(1250), 'หนึ่งพันสองร้อยห้าสิบ');
  assert.strictEqual(thaiNumber(21), 'ยี่สิบเอ็ด');
  const runs = thaiRuns('ดีมากๆ OK นะ 25 บาท');
  assert.deepStrictEqual(runs.map((r) => Object.keys(r)[0]), ['thai', 'text', 'thai']);
  assert.match(runs[0].thai, /maːk maːk/);
  assert.match(runs[2].thai, /jiːˈsip haː/);
});

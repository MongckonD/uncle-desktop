'use strict';

// Thai text -> the phonemes Kokoro reads (IPA), so her Kokoro voices can speak Thai. Kokoro never
// learned Thai, so it keeps a foreign accent; this only makes every word come out as clearly as
// Kokoro allows: numbers read out, words split, irregular words respelled, Thai syllable rules,
// final stops not released, the stress on a word's last syllable. Chinese voices also get the tone
// of each syllable (Kokoro's Chinese tone marks), which may bring them a little closer to Thai.
// ponytail: rule-based, a few hundred common irregular words fixed by hand; a full pronunciation
// dictionary (or a model trained on Thai) when the rules misread too much.

// consonant: [initial, final, class: m(id) h(igh) l(ow)]
const C = {
  ก: ['k', 'k', 'm'], ข: ['kʰ', 'k', 'h'], ฃ: ['kʰ', 'k', 'h'], ค: ['kʰ', 'k', 'l'], ฅ: ['kʰ', 'k', 'l'], ฆ: ['kʰ', 'k', 'l'],
  ง: ['ŋ', 'ŋ', 'l'], จ: ['ʧ', 't', 'm'], ฉ: ['ʧʰ', 't', 'h'], ช: ['ʧʰ', 't', 'l'], ซ: ['s', 't', 'l'], ฌ: ['ʧʰ', 't', 'l'],
  ญ: ['j', 'n', 'l'], ฎ: ['d', 't', 'm'], ฏ: ['t', 't', 'm'], ฐ: ['tʰ', 't', 'h'], ฑ: ['tʰ', 't', 'l'], ฒ: ['tʰ', 't', 'l'],
  ณ: ['n', 'n', 'l'], ด: ['d', 't', 'm'], ต: ['t', 't', 'm'], ถ: ['tʰ', 't', 'h'], ท: ['tʰ', 't', 'l'], ธ: ['tʰ', 't', 'l'],
  น: ['n', 'n', 'l'], บ: ['b', 'p', 'm'], ป: ['p', 'p', 'm'], ผ: ['pʰ', 'p', 'h'], ฝ: ['f', 'p', 'h'], พ: ['pʰ', 'p', 'l'],
  ฟ: ['f', 'p', 'l'], ภ: ['pʰ', 'p', 'l'], ม: ['m', 'm', 'l'], ย: ['j', 'j', 'l'], ร: ['r', 'n', 'l'], ล: ['l', 'n', 'l'],
  ว: ['w', 'w', 'l'], ศ: ['s', 't', 'h'], ษ: ['s', 't', 'h'], ส: ['s', 't', 'h'], ห: ['h', '', 'h'], ฬ: ['l', 'n', 'l'],
  อ: ['ʔ', '', 'm'], ฮ: ['h', '', 'l'],
};
const SONORANT = 'งญนมยรลว';
const MARKS = 'ิีึืุูั็่้๊๋';
const TONE_MARK = { '่': 1, '้': 2, '๊': 3, '๋': 4 };
const in_ = (set, ch) => Boolean(ch) && set.includes(ch);
const isC = (ch) => Boolean(ch && C[ch]);
// a consonant followed by one of these is the start of a syllable, not a final
const startsSyllable = (s, j) => isC(s[j]) && (in_(MARKS, s[j + 1]) || in_('ะาำ', s[j + 1]));

// words read differently from how they are written, respelled the way they sound
const RESPELL = {
  จริง: 'จิง', ทราย: 'ซาย', ทรง: 'ซง', สร้าง: 'ส้าง', ไซร้: 'ไซ้', สามารถ: 'สามาด', ขนม: 'ขะหนม', ธรรม: 'ทำ', ธรรมดา: 'ทำมะดา',
  บัตร: 'บัด', ศาสตร์: 'สาด', บริษัท: 'บอริสัด', ประวัติ: 'ประหวัด', ชาติ: 'ชาด', ญาติ: 'ยาด', เหตุ: 'เหด',
  สมัคร: 'สะหมัก', จักร: 'จัก', มิตร: 'มิด', พุทธ: 'พุด', รถ: 'รด', สุข: 'สุก', ทุกข์: 'ทุก', โลก: 'โลก', ภาพ: 'พาบ',
  ใหญ่: 'ใหย่', อย่า: 'หย่า', อยู่: 'หยู่', อย่าง: 'หย่าง', อยาก: 'หยาก', ไทย: 'ไท', ครับ: 'คับ', คะ: 'ค่ะ',
  เพราะ: 'เพาะ', ทำไม: 'ทำไม', อร่อย: 'อะหร่อย', สบาย: 'สะบาย', สวัสดี: 'สะหวัดดี', ตลาด: 'ตะหลาด', ฉลาด: 'ฉะหลาด',
  สนุก: 'สะหนุก', ขยัน: 'ขะหยัน', อนาคต: 'อะนาคด', ปัจจุบัน: 'ปัดจุบัน', คอมพิวเตอร์: 'คอมพิวเต้อ', โทรศัพท์: 'โทระสับ',
  มือถือ: 'มือถือ', กรุงเทพ: 'กรุงเทบ', ภาษา: 'พาสา', ปรากฏ: 'ปรากด', เสมอ: 'สะเหมอ', สมอง: 'สะหมอง', ถนน: 'ถะหนน',
  // hidden vowels and leading letters
  ขนาด: 'ขะหนาด', ฉบับ: 'ฉะบับ', สนาม: 'สะหนาม', ตลอด: 'ตะหลอด', จมูก: 'จะหมูก', ฝรั่ง: 'ฝะหรั่ง', สมุด: 'สะหมุด', ขยะ: 'ขะหยะ',
  ชนิด: 'ชะนิด', พยายาม: 'พะยายาม', ทหาร: 'ทะหาน', สถานี: 'สะถานี', สถานที่: 'สะถานที่', สไตล์: 'สะไต', ตำรวจ: 'ตำหรวด',
  อนุญาต: 'อะนุยาด', ปรารถนา: 'ปราดถะหนา', ราชการ: 'ราดชะกาน', คุณภาพ: 'คุนนะพาบ', ผลไม้: 'ผนละไม้', สุขภาพ: 'สุกขะพาบ',
  ปกติ: 'ปกกะติ', วิทยาศาสตร์: 'วิดทะยาสาด', มหาวิทยาลัย: 'มะหาวิดทะยาลัย', ภาพยนตร์: 'พาบพะยน', ธุรกิจ: 'ทุระกิด',
  เศรษฐกิจ: 'เสดถะกิด', ประโยชน์: 'ประโหยด', สมบัติ: 'สมบัด', เกียรติ: 'เกียด', พฤหัส: 'พะรึหัด', อาทิตย์: 'อาทิด', จันทร์: 'จัน',
  // ทร said ซ, ศร/สร said ส
  ทราบ: 'ซาบ', ทรัพย์: 'ซับ', กระทรวง: 'กระซวง', เศร้า: 'เส้า', สร้อย: 'ส้อย', ศรี: 'สี', เสร็จ: 'เส็ด', จริงจัง: 'จิงจัง',
  // รร and Sanskrit spellings
  กรรม: 'กำ', กรรมการ: 'กำมะกาน', พรรค: 'พัก', บรรยากาศ: 'บันยากาด', สัตว์: 'สัด', เพชร: 'เพ็ด', รถยนต์: 'รดยน', รถไฟ: 'รดไฟ',
  // months
  มกราคม: 'มะกะราคม', กุมภาพันธ์: 'กุมพาพัน', พฤษภาคม: 'พรึดสะพาคม', กรกฎาคม: 'กะรักกะดาคม', พฤศจิกายน: 'พรึดสะจิกายน',
  // loanwords
  อินเทอร์เน็ต: 'อินเทอเน็ด', เว็บไซต์: 'เว็บไซ', ฟุตบอล: 'ฟุดบอน', เบอร์: 'เบอ',
};
// the whole word, or a longer word inside a compound (ธรรมชาติ)
const LONG = Object.keys(RESPELL).filter((k) => k.length > 2).sort((a, b) => b.length - a.length);
// ก็ is read เก้าะ, in every word it starts (ก็ได้, ก็คือ)
const respell = (word) => (RESPELL[word] || LONG.reduce((w, k) => (w.includes(k) ? w.split(k).join(RESPELL[k]) : w), word)).replace(/ก็/g, 'เก้าะ');
const ABBR = { 'กทม.': 'กรุงเทพมหานคร', 'ดร.': 'ดอกเตอร์', 'ฯลฯ': 'และอื่นๆ', 'ผศ.': 'ผู้ช่วยศาสตราจารย์', 'รศ.': 'รองศาสตราจารย์', 'ศ.': 'ศาสตราจารย์' };

const DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
function thaiNumber(n) {
  if (n === 0) return DIGIT[0];
  if (n >= 1e6) return thaiNumber(Math.floor(n / 1e6)) + 'ล้าน' + (n % 1e6 ? thaiNumber(n % 1e6) : '');
  const ds = String(n).split('').map(Number);
  return ds.map((d, i) => {
    const place = ds.length - 1 - i;
    if (!d) return '';
    if (place === 1) return (d === 1 ? '' : d === 2 ? 'ยี่' : DIGIT[d]) + 'สิบ';
    if (place === 0 && d === 1 && ds.length > 1) return 'เอ็ด';
    return DIGIT[d] + PLACE[place];
  }).join('');
}

// numbers, Thai digits, abbreviations, ๆ: everything spelled out in Thai letters
function normalize(text) {
  let s = String(text).replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0E50));
  for (const [k, v] of Object.entries(ABBR)) s = s.split(k).join(v);
  s = s.replace(/(\d{1,2}):(\d{2})/g, (_, h, m) => `${thaiNumber(+h)}นาฬิกา${+m ? ` ${thaiNumber(+m)}นาที` : ''}`);
  s = s.replace(/(\d[\d,]*)(?:\.(\d+))?\s*%/g, (_, a, b) => `${a}${b ? '.' + b : ''} เปอร์เซ็นต์`);
  s = s.replace(/฿\s*(\d[\d,]*(?:\.\d+)?)/g, '$1 บาท');
  s = s.replace(/\d[\d,]*(?:\.\d+)?/g, (num) => {
    const [a, b] = num.replace(/,/g, '').split('.');
    return ` ${thaiNumber(Number(a))}${b ? 'จุด' + b.split('').map((d) => DIGIT[d]).join('') : ''} `;
  });
  return s.replace(/ฯ/g, '');
}

// one Thai word (no spaces) -> its syllables: { onset, vowel, final, tone }
function syllables(word) {
  // silent letters (การันต์): the letter (and a vowel on it) under ์ is not read
  const s = word.replace(/[ก-ฮ][ิุ]?์/g, '').replace(/ฤ/g, 'รึ');
  const out = [];
  let i = 0;
  while (i < s.length) {
    let lead = '';
    if ('เแโใไ'.includes(s[i])) lead = s[i++];
    if (!isC(s[i])) { i++; continue; } // stray mark: skip
    let first = s[i++], onset = C[first][0], cls = C[first][2];
    // ห (and อ before ย) leading a low sonorant: the sound of the second, the class of the first
    if ((first === 'ห' && in_(SONORANT, s[i]) || first === 'อ' && s[i] === 'ย') && isC(s[i])) {
      onset = C[s[i]][0]; i++;
    } else if ('กขคตปผพ'.includes(first) && in_('รลว', s[i]) && (s[i] !== 'ว' || 'กขค'.includes(first))
      && (lead || in_(MARKS, s[i + 1]) || in_('ะาำ', s[i + 1]))) {
      onset += s[i] === 'ร' ? 'r' : s[i] === 'ล' ? 'l' : 'w'; i++; // a cluster: ปล, กร, ขว
    }
    let marks = '';
    while (in_(MARKS, s[i])) marks += s[i++];
    const has = (m) => marks.includes(m);
    const tone = Object.keys(TONE_MARK).find(has);
    let vowel = '', canClose = true;
    const take = (str) => { if (s.startsWith(str, i)) { i += str.length; return true; } return false; };
    if (lead === 'ใ' || lead === 'ไ') { vowel = 'aj'; canClose = false; if (s[i] === 'ย' && !startsSyllable(s, i)) i++; }
    else if (lead === 'เ') {
      if (has('็')) vowel = 'e';
      else if (has('ี') && take('ย')) vowel = 'iːa';
      else if (has('ื') && take('อ')) vowel = 'ɯːa';
      else if (has('ิ')) vowel = 'ɤː';
      else if (take('าะ')) { vowel = 'ɔ'; canClose = false; }
      else if (take('า')) { vowel = 'aw'; canClose = false; }
      else if (take('อะ')) { vowel = 'ɤ'; canClose = false; }
      else if (take('อ')) vowel = 'ɤː';
      else if (take('ะ')) { vowel = 'e'; canClose = false; }
      else if (s[i] === 'ย' && !startsSyllable(s, i)) { i++; vowel = 'ɤːj'; canClose = false; }
      else vowel = 'eː';
    } else if (lead === 'แ') {
      if (take('ะ')) { vowel = 'ɛ'; canClose = false; } else vowel = has('็') ? 'ɛ' : 'ɛː';
    } else if (lead === 'โ') {
      if (take('ะ')) { vowel = 'o'; canClose = false; } else vowel = 'oː';
    } else if (has('ั')) {
      if (take('ว')) vowel = 'uːa'; else vowel = 'a';
    } else if (has('ิ')) vowel = 'i';
    else if (has('ี')) vowel = 'iː';
    else if (has('ึ')) vowel = 'ɯ';
    else if (has('ื')) { vowel = 'ɯː'; take('อ'); }
    else if (has('ุ')) vowel = 'u';
    else if (has('ู')) vowel = 'uː';
    else if (take('ะ')) { vowel = 'a'; canClose = false; }
    else if (take('า')) vowel = 'aː';
    else if (take('ำ')) { vowel = 'am'; canClose = false; }
    else if (s.startsWith('รร', i)) { i += 2; vowel = 'a'; if (!isC(s[i]) || startsSyllable(s, i)) { vowel = 'an'; canClose = false; } }
    else if (s[i] === 'อ' && !startsSyllable(s, i)) { i++; vowel = 'ɔː'; }
    else if (s[i] === 'ว' && isC(s[i + 1]) && !startsSyllable(s, i + 1)) { i++; vowel = 'uːa'; }
    else if (isC(s[i]) && !startsSyllable(s, i) && !'เแโใไ'.includes(s[i])) vowel = 'o';
    else { vowel = 'a'; canClose = false; }
    let final = '';
    // (not when one lone consonant would be left after it: กายน is กา-ยน, not กาย-นะ)
    if (canClose && isC(s[i]) && !startsSyllable(s, i) && !(isC(s[i + 1]) && i + 2 === s.length) && !(isC(s[i + 1]) && 'รลว'.includes(s[i + 1]) && startsSyllable(s, i + 1) && 'กขคตปผพ'.includes(s[i]))) {
      final = C[s[i]][1]; i++;
    }
    out.push({ onset, vowel, final, cls, tone: toneOf(cls, vowel, final, tone && TONE_MARK[tone]) });
  }
  return out;
}

// Thai tone rules: the consonant class, the tone mark, and live or dead syllables
// 0 mid, 1 low, 2 falling, 3 high, 4 rising
function toneOf(cls, vowel, final, mark) {
  const short = !/ː|aj|aw|am|an/.test(vowel);
  const dead = in_('ktp', final) || (short && !final);
  if (mark === 1) return cls === 'l' ? 2 : 1;
  if (mark === 2) return cls === 'l' ? 3 : 2;
  if (mark === 3) return 3;
  if (mark === 4) return 4;
  if (cls === 'm') return dead ? 1 : 0;
  if (cls === 'h') return dead ? 1 : 4;
  return dead ? (short ? 3 : 2) : 0;
}
// Kokoro's Chinese tone marks, the nearest to each Thai tone
const ZH_TONE = ['', '↓', '↘', '→', '↗'];

function wordPhonemes(word, tones) {
  const syl = syllables(respell(word));
  return syl.map((x, n) => {
    let p = x.onset + x.vowel + x.final;
    // a short open syllable at the end of a word closes with a catch (นะ, ค่ะ)
    if (n === syl.length - 1 && !x.final && !/ː|aj|aw|am|an/.test(x.vowel)) p += 'ʔ';
    if (tones) p += ZH_TONE[x.tone];
    // the stress on a word's last syllable, unless the one before ends in a stop: Kokoro would
    // release that stop and say an extra syllable (สวัสดี -> "สวัสดิ์ดี")
    const prev = syl[n - 1];
    if (n && n === syl.length - 1 && !in_('ktp', prev.final)) p = 'ˈ' + p;
    return p;
  }).join('');
}

const segmenter = new Intl.Segmenter('th', { granularity: 'word' });
const THAI = /[฀-๿]/;

// text -> runs to speak: { thai: phonemes } for Thai, { text } for everything else (English…)
function thaiRuns(text, { tones = false } = {}) {
  const runs = [];
  const push = (kind, value) => {
    const last = runs[runs.length - 1];
    if (last && kind in last) last[kind] += value; else runs.push({ [kind]: value });
  };
  for (const { segment, isWordLike } of segmenter.segment(normalize(text))) {
    const afterThai = runs.length && 'thai' in runs[runs.length - 1];
    // spaces and punctuation after Thai stay with it (a pause), not a run of their own
    if (!THAI.test(segment)) { if (afterThai && !/[\p{L}\p{N}]/u.test(segment)) push('thai', /[?!]/.test(segment) ? segment.trim() + ' ' : ', '); else push('text', segment); continue; }
    if (!isWordLike) { push('thai', ' '); continue; }
    const repeat = segment.endsWith('ๆ');
    const word = segment.replace(/ๆ/g, '');
    const ph = wordPhonemes(word, tones);
    push('thai', (ph + ' ').repeat(repeat ? 2 : 1));
  }
  for (const r of runs) if ('thai' in r) r.thai = r.thai.replace(/\s+/g, ' ').replace(/ ,/g, ',').replace(/(,\s*)+/g, ', ').trim();
  return runs.filter((r) => (r.thai ?? r.text).trim());
}

module.exports = { thaiRuns, wordPhonemes, syllables, normalize, thaiNumber, THAI };

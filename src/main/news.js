'use strict';

// News on the topics you follow: Google News search feeds (free, no key, Thai or English) and any
// RSS or Atom feed you add. Only headlines and their blurbs (no page scraping); the same story from
// several outlets counts once; what she's shown you is remembered so it isn't shown again.

const fs = require('node:fs');

// entities first, then tags: a feed's blurb is HTML escaped inside the XML
const decode = (s) => String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const tag = (xml, name) => decode(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(xml)?.[1]);

// RSS <item>s or Atom <entry>s: [{ title, link, source, date (ms), text }]
function parseFeed(xml) {
  const blocks = String(xml).match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    const link = tag(b, 'link') || /<link[^>]*href="([^"]+)"/i.exec(b)?.[1] || '';
    const source = tag(b, 'source') || '';
    let title = tag(b, 'title');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)); // Google News adds " - Outlet"
    const when = Date.parse(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated'));
    return { title, link: decode(link), source, date: Number.isFinite(when) ? when : 0, text: tag(b, 'description') || tag(b, 'summary') };
  }).filter((x) => x.title && /^https?:\/\//.test(x.link));
}

// the same story, in other words: its title without punctuation, first 8 words
const storyKey = (title) => String(title).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).slice(0, 8).join(' ');

function googleNews(topic, lang) {
  const q = encodeURIComponent(`${topic} when:1d`);
  return lang === 'en' ? `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en` : `https://news.google.com/rss/search?q=${q}&hl=th&gl=TH&ceid=TH:th`;
}

function createNews({ getSettings, seenFile, fetcher = fetch, now = () => Date.now() }) {
  let seen;
  const loadSeen = () => { if (!seen) { try { seen = new Set(JSON.parse(fs.readFileSync(seenFile, 'utf8'))); } catch { seen = new Set(); } } return seen; };
  const saveSeen = () => { try { fs.writeFileSync(seenFile, JSON.stringify([...loadSeen()].slice(-600))); } catch { /* next time */ } };

  async function feed(url) {
    const res = await fetcher(url, { headers: { 'user-agent': 'Mozilla/5.0 UncleDesktop' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`โหลดข่าวไม่ได้ (${res.status})`);
    return parseFeed(await res.text());
  }

  // fresh stories on one topic (or from one feed), newest first, unseen only unless `all`
  async function topic(name, { max = 5, all = false } = {}) {
    const s = getSettings();
    const langs = s.lang === 'both' ? ['th', 'en'] : [s.lang === 'en' ? 'en' : 'th'];
    const lists = await Promise.all(langs.map((l) => feed(googleNews(name, l)).catch(() => [])));
    return pick(lists.flat(), { max, all });
  }
  async function feeds({ max = 8, all = false } = {}) {
    const lists = await Promise.all((getSettings().feeds || []).map((url) => feed(url).catch(() => [])));
    return pick(lists.flat(), { max, all });
  }
  function pick(items, { max, all }) {
    const blocked = (getSettings().blocked || []).map((b) => b.toLowerCase());
    const keys = new Set(), out = [];
    for (const it of items.sort((a, b) => b.date - a.date)) {
      const key = storyKey(it.title);
      if (!key || keys.has(key) || (!all && loadSeen().has(key)) || now() - it.date > 2 * 86400000 && it.date) continue;
      if (blocked.some((b) => it.source.toLowerCase().includes(b) || it.link.toLowerCase().includes(b))) continue;
      keys.add(key); out.push({ ...it, key });
      if (out.length >= max) break;
    }
    return out;
  }
  const markSeen = (items) => { for (const it of items) loadSeen().add(it.key); saveSeen(); };

  // every topic (and your feeds): { topic: [stories] }
  async function gather() {
    const s = getSettings(), out = {};
    for (const t of s.topics || []) out[t] = await topic(t);
    if (s.feeds?.length) out[s.lang === 'en' ? 'Your feeds' : 'ฟีดของคุณ'] = await feeds();
    return out; // marked seen by whoever shows them (markSeen)
  }
  // breaking news: new stories with any of your alert words in the title
  async function breaking() {
    const words = getSettings().alerts || [];
    const found = [];
    for (const w of words) {
      for (const it of await topic(w, { max: 3 })) if (it.title.toLowerCase().includes(w.toLowerCase())) found.push({ ...it, word: w });
    }
    markSeen(found);
    return found;
  }

  return { topic, feeds, gather, breaking, markSeen };
}

// stories as plain lines for her AI to summarize (data, not instructions)
const asText = (byTopic) => Object.entries(byTopic).filter(([, list]) => list.length)
  .map(([t, list]) => `## ${t}\n${list.map((it, i) => `${i + 1}. ${it.title}${it.source ? ` (${it.source})` : ''}${it.text && it.text !== it.title ? ` — ${it.text.slice(0, 200)}` : ''}`).join('\n')}`).join('\n\n');

module.exports = { createNews, parseFeed, storyKey, googleNews, asText };

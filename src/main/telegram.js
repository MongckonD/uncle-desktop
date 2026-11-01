'use strict';

// Her Telegram bot: your phone talks to her. Long polling (no server, no open port): she asks
// Telegram for new messages while she runs. Only the one chat paired with a 6-digit code is heard;
// anything from anyone else is dropped unread. Messages come out as { kind: 'text' | 'voice' |
// 'photo' | 'video' | 'callback', … } for main.js to answer.

const API = 'https://api.telegram.org';

function createTelegram({ getToken, getChat, getAllowedUsers, setChat, onMessage, log = () => {}, fetcher = fetch }) {
  let running = false, offset = 0, pairing = null, controller = null;

  async function call(method, params = {}, { form = null, signal } = {}) {
    const token = getToken();
    if (!token) throw new Error('ยังไม่ได้ใส่ bot token');
    const res = await fetcher(`${API}/bot${token}/${method}`, form
      ? { method: 'POST', body: form, signal }
      : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(params), signal });
    const data = await res.json().catch(() => ({}));
    if (!data.ok) throw new Error(`Telegram: ${data.description || res.status}`);
    return data.result;
  }

  // a file someone sent, as bytes (Telegram lets bots download up to 20 MB)
  async function download(fileId) {
    const file = await call('getFile', { file_id: fileId });
    const res = await fetcher(`${API}/file/bot${getToken()}/${file.file_path}`);
    if (!res.ok) throw new Error(`ดาวน์โหลดไฟล์จาก Telegram ไม่ได้ (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }

  // the code you send the bot once, from your phone, so she knows which chat is yours
  function startPairing() {
    pairing = { code: String(Math.floor(100000 + Math.random() * 900000)), until: Date.now() + 10 * 60000 };
    return pairing.code;
  }

  // one update: yours, or a pairing code, or nothing
  async function handle(update) {
    const msg = update.message || update.callback_query?.message;
    const chatId = msg?.chat?.id;
    if (!chatId) return;
    const text = (update.message?.text || '').trim();
    const sender=update.callback_query?.from||update.message?.from,userId=sender?.id;
    if(getAllowedUsers && (!Number.isSafeInteger(userId)||userId<=0||sender.is_bot))return;
    if(getAllowedUsers && text==='/whoami')return send(chatId,`Telegram User ID: ${userId}`);
    if (getChat() !== chatId || (pairing && text.replace(/^\/start\s*/, '')===pairing.code)) {
      if (pairing && Date.now() < pairing.until && text.replace(/^\/start\s*/, '') === pairing.code) {
        pairing = null;
        setChat(chatId,userId);
        await send(chatId, 'เชื่อมกับ Uncle Desktop แล้ว 🎉 พิมพ์ อัดเสียง หรือส่งรูปมาได้เลย · /help ดูคำสั่ง');
        return;
      }
      else if(!getAllowedUsers || !getAllowedUsers().includes(userId))return;
    }
    if(getAllowedUsers && !getAllowedUsers().includes(userId))return;
    const deliver=event=>onMessage({...event,userId});
    if (update.callback_query) {
      await call('answerCallbackQuery', { callback_query_id: update.callback_query.id }).catch(() => {});
      return deliver({ kind: 'callback', data: update.callback_query.data, chatId });
    }
    const m = update.message;
    if (m.voice || m.audio) return deliver({ kind: 'voice', fileId: (m.voice || m.audio).file_id, mime: (m.voice || m.audio).mime_type || 'audio/ogg', chatId, caption: m.caption || '' });
    if (m.photo?.length) return deliver({ kind: 'photo', fileId: m.photo.at(-1).file_id, mime: 'image/jpeg', chatId, caption: m.caption || '' });
    if (m.document?.mime_type?.startsWith('image/')) return deliver({ kind: 'photo', fileId: m.document.file_id, mime: m.document.mime_type, chatId, caption: m.caption || '' });
    if (m.video || m.video_note || m.animation) { const v = m.video || m.video_note || m.animation; return deliver({ kind: 'video', fileId: v.file_id, mime: v.mime_type || 'video/mp4', size: v.file_size || 0, chatId, caption: m.caption || '' }); }
    if (text) return deliver({ kind: 'text', text, chatId });
    return send(chatId, 'ยังรับข้อความแบบนี้ไม่ได้ ส่งเป็นข้อความ เสียง รูป หรือวิดีโอนะ');
  }

  async function loop() {
    while (running) {
      controller = new AbortController();
      try {
        const updates = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] }, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]) });
        for (const u of updates) {
          offset = u.update_id + 1;
          handle(u).catch((err) => log(`[telegram] ${err.message}`));
        }
      } catch (err) {
        if (!running) return;
        log(`[telegram] ${err.message}`);
        await new Promise((r) => setTimeout(r, /token|Unauthorized|Not Found/i.test(err.message) ? 60000 : 5000));
      }
    }
  }

  // text, with buttons: [[{ text, data } | { text, url }]]
  function send(chatId, text, buttons) {
    const reply_markup = buttons?.length ? { inline_keyboard: buttons.map((row) => row.map((b) => (b.url ? { text: b.text, url: b.url } : { text: b.text, callback_data: b.data }))) } : undefined;
    return call('sendMessage', { chat_id: chatId, text: String(text).slice(0, 4000), reply_markup, disable_web_page_preview: true });
  }
  // a file: kind 'photo' | 'audio' | 'video' | 'document'
  function sendFile(chatId, kind, bytes, name, mime, caption = '') {
    const form = new FormData();
    form.set('chat_id', String(chatId));
    if (caption) form.set('caption', caption.slice(0, 1000));
    form.set(kind, new Blob([bytes], { type: mime }), name);
    return call({ photo: 'sendPhoto', audio: 'sendAudio', video: 'sendVideo', document: 'sendDocument' }[kind], {}, { form });
  }
  const typing = (chatId, action = 'typing') => call('sendChatAction', { chat_id: chatId, action }).catch(() => {});

  return {
    start() { if (running || !getToken()) return; running = true; loop(); },
    stop() { running = false; controller?.abort(); },
    get running() { return running; },
    me: () => call('getMe'),
    startPairing, send, sendFile, typing, download, handle,
  };
}

module.exports = { createTelegram };

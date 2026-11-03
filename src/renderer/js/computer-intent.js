// sites asked for by name ("open youtube") when no app on the PC goes by it: the address is hers, not
// the model's, so it opens right away like an app you named (chat.js, and main.js for an open_app step)
export const SITES = {
  youtube: 'https://www.youtube.com', google: 'https://www.google.com', gmail: 'https://mail.google.com',
  twitch: 'https://www.twitch.tv', netflix: 'https://www.netflix.com', reddit: 'https://www.reddit.com',
  twitter: 'https://x.com', instagram: 'https://www.instagram.com', tiktok: 'https://www.tiktok.com',
  facebook: 'https://www.facebook.com', github: 'https://github.com', chatgpt: 'https://chatgpt.com',
  wikipedia: 'https://www.wikipedia.org', linkedin: 'https://www.linkedin.com', pinterest: 'https://www.pinterest.com',
  crunchyroll: 'https://www.crunchyroll.com', outlook: 'https://outlook.live.com', whatsapp: 'https://web.whatsapp.com',
  discord: 'https://discord.com/app', soundcloud: 'https://soundcloud.com', deezer: 'https://www.deezer.com',
};

// Route explicit requests, not descriptions or questions about the assistant's abilities.
export function volumeCommand(text) {
 const value=String(text||'').trim().replace(/^(?:ช่วย|กรุณา|ขอ|รบกวน)\s*/,'').replace(/[๐-๙]/g,c=>String('๐๑๒๓๔๕๖๗๘๙'.indexOf(c)));
 const browser=/เบรา|บราว|browser|chrome|edge|firefox|ยูทูบ|youtube|แท็บ/i.test(value);
 const windows=/windows|วินโด|ระบบ/i.test(value);
 let action;
 if(/^(?:เพิ่มเสียง|เร่งเสียง|เพิ่มระดับเสียง|ปรับเสียงให้ดัง|turn (?:the )?volume up|volume up)/i.test(value)||/^เปิดเสียง.*(?:อีก|ดัง|เพิ่ม|หน่อย)/.test(value))action='volume_up';
 else if(/^(?:ลดเสียง|เบาเสียง|ลดระดับเสียง|ปรับเสียงให้เบา|volume down)/i.test(value))action='volume_down';
 else if(/^(?:ปิดเสียง|mute\b)/i.test(value))action='mute';
 else if(/^(?:เปิดเสียง|เลิกปิดเสียง|ยกเลิก(?:การ)?ปิดเสียง|unmute\b)/i.test(value))action='unmute';
 else if(/^(?:ตั้ง|ปรับ)(?:ระดับ)?เสียง.*\d/.test(value))action='volume_set';
 else return null;
 const number=/(\d{1,3})\s*(?:%|เปอร์เซ็นต์|percent)?/.exec(value);
 if(number && Number(number[1])>100)return null;
 if(action==='volume_set'&&!number)return null;
 return {action,level:number?Number(number[1]):undefined,browser:browser||(!windows&&/^เปิดเสียง/.test(value)),windows:!browser||windows||/ทั้งคู่|ทั้งสอง/.test(value)};
}
export function computerTask(text) {
 const raw=String(text||'').trim();
 if(/^(?:อย่า|ห้าม|ไม่ต้อง|อยากรู้|อธิบาย|วิธี|ตัวอย่าง|สามารถ|ทำไม)/.test(raw))return null;
 if(volumeCommand(raw))return raw;
 const explicit=/^(?:ควบคุมเครื่อง|ทำงานบนเครื่อง|ใช้คอม(?:พิวเตอร์)?|computer)\s*[:：]?\s*(.+)$/i.exec(raw);
 if(explicit)return explicit[1];
 if(/^(?:ตอนนี้)?(?:กำลังเล่นเพลงอะไร|เพลงอะไร|ชื่อเพลงที่กำลังเล่น|what song|what is playing)/i.test(raw))return raw;
 const task=raw.replace(/^(?:ช่วย|กรุณา)\s*/,'');
 if(/ทำยังไง|ทำอย่างไร|หมายถึงอะไร|คืออะไร/.test(task))return null;
 if(/^(?:เปิด(?:เพลง|โปรแกรม|แอป(?:พลิเคชัน)?|เว็บ(?:ไซต์)?|ยูทูบ)|เปิด\s+\S|เล่นเพลง|หยุดเพลง|พักเพลง|เพลงถัดไป|เพลงก่อนหน้า)/i.test(task))return raw;
 if(/^(?:คลิก|ดับเบิลคลิก|ลาก|เลื่อน|พิมพ์|กรอก|กด(?:ปุ่ม|คีย์|คีย์ลัด)?|ย่อหน้าต่าง|สลับ(?:ไป|หน้าต่าง)|ล็อก(?:เครื่อง|หน้าจอ)|ปิดเครื่อง|รีสตาร์ต(?:เครื่อง)?|พักเครื่อง|ออกจากระบบ|ยกเลิก(?:การ)?ปิดเครื่อง|ตั้ง(?:ค่า)?(?:ระดับ)?เสียง|ปรับ(?:ระดับ)?เสียง|เปิดบลูทูธ|ปิดบลูทูธ|เปิดไวไฟ|ปิดไวไฟ|ปิดแท็บ)/.test(task))return raw;
 if(/^(?:เปิด|ค้นหา|ค้น|หา|เล่นเพลง|เข้า|ไปที่|ส่งข้อความ|ส่งเมล|ส่งอีเมล|โพสต์)/.test(task)&&/(?:แล้ว|จากนั้น|ต่อด้วย|และ(?:พิมพ์|ค้น|เปิด|คลิก|กด)|ส่งข้อความ|ส่งเมล|ส่งอีเมล|โพสต์)/.test(task))return raw;
 if(/^(?:open|click|drag|type|scroll|press|switch|minimize|shutdown|restart|lock|send|post)\b/i.test(task)&&(/\b(?:then|and|click|drag|type|scroll|press|switch|minimize|shutdown|restart|lock|send|post)\b/i.test(task)))return raw;
 return null;
}

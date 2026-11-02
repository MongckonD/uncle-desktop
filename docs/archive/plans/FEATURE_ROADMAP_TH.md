> เอกสารประวัติ: ย้ายเก็บวันที่ 2026-11-01 เนื้อหาและผลทดสอบด้านล่างเป็นของเวลาที่เขียน
> สถานะงานปัจจุบันใช้ [แผนงานหลัก](../../ROADMAP_TH.md) เท่านั้น ไม่ใช้ checklist นี้เป็นงานที่ต้องทำซ้ำ

# Uncle Desktop — แผนเพิ่มฟีเจอร์จาก lachydotmcg

อัปเดต 30 ตุลาคม 2026 · รุ่น 0.8.1 (เผยแพร่บน GitHub Releases แล้ว)

เอกสารนี้ใช้ติดตามงานต่อจาก `AI_Desktop_Companion_Godot_Implementation_Plan.md` รุ่น 1.0 โดยปรับให้ตรงกับโปรแกรมจริง ไม่ใช่การเริ่มแผนใหม่ตั้งแต่ต้น และไม่ใช่การประกาศว่าทุกฟีเจอร์เสร็จแล้ว

## ฐานโปรเจกต์ที่ใช้อยู่

- Uncle Desktop พัฒนาจาก mochiiwuff บน Electron/JavaScript ใช้ `src/main` กับ `src/renderer` ต่อไป ไม่ย้ายไป C#/WinForms ตามโครงสร้างตัวอย่างในแผนเก่า
- lachydotmcg เป็นแหล่งอ้างอิงฟีเจอร์และพฤติกรรม ไม่สามารถ merge ไฟล์ C# เข้า Electron แล้วใช้งานได้ทันที
- แผนเดิม F01–F05 ยังเป็นเป้าหมาย: ตัวละคร, AI Chat, Coding Hub, เสียงไทยและขยับปาก, Screen Vision แต่ต้องนับของที่มีแล้วก่อน
- สถานะด้านล่างอ้างอิงโค้ดบน main ของ pk115/uncle-desktop
- เก็บ LICENSE และเครดิตเดิมเมื่อใช้โค้ดจากต้นทาง

## ตารางเทียบกับโค้ดปัจจุบัน

“มีแล้ว” หมายถึงพบ implementation; คุณภาพจริงกับโมเดล บริการ และเครื่องอื่นต้องทดสอบแยก ส่วนรายการฝั่งอ้างอิงมาจาก README ของเขา ไม่ใช่ผลทดสอบของเรา

| ความสามารถจากฝั่ง lachydotmcg / แผนเดิม | Uncle Desktop ปัจจุบัน | โค้ดหลัก / งานที่เหลือ |
|---|---|---|
| แชต Local/Cloud | มีแล้ว | `src/main/llm.js`, `ollama.js`, `src/renderer/js/chat.js`; ทดสอบแต่ละ provider แยก |
| เปิดแอป เกม เว็บไซต์ | มีแล้วผ่านข้อความ | `src/main/launch.js`, `chat.js`; ไม่ต้องสร้างระบบเปิดแอปใหม่เพื่อรองรับเสียง |
| ควบคุมเพลงและระดับเสียง | มีพื้นฐานแล้ว | `launch.js`: media keys และค้นหาเพลง/วิดีโอ; ยังไม่เทียบเท่าการควบคุม Spotify UI ทุกขั้นตอน |
| ปิดแอป | มีแล้ว พร้อมขั้นยืนยัน | `src/main/apps.js`, `chat.js`; รักษาการยืนยันและการป้องกันข้อมูลที่ยังไม่บันทึก |
| ตัวละครบนขอบหน้าต่าง ลาก ขว้าง ย่อขนาด | มีระบบ host แล้ว | `capri.js`, `windows.js`, `windows.ps1`; ตัวละครแบบ sprite ยังไม่ได้มีภาพท่านั่ง/เดินครบทุกตัว |
| เปลี่ยนบุคลิก ความจำ แชต | มีพื้นฐานแล้ว | `chat.js`, `custom.js`, `config.js`; ยังไม่ได้ทำ editor แบบไฟล์ personality.md ของเขา |
| เลือกตัวละครพร้อม preview / นำเข้าภาพเอง | มีแล้ว เป็นส่วนของเรา | `characters.js`, `user-characters.js`, `character-picker.js`, `character-import.js`; 13 ตัวในตัวโปรแกรม |
| เสียงพูดออกแบบ Local/Cloud | มีแล้ว | `speech.js`, `speech.ps1`; Edge (ไทยชาย/หญิง ไม่ต้องใช้คีย์), Windows และ OpenAI TTS; ยังไม่มี ElevenLabs/Kokoro |
| Voice Chat, เลือกไมค์, mute | มีแล้ว (0.6.0–0.7.0) | `listening.js`, `listening-audio.js`; กดพูด/ตั้งคำเรียก/คุยต่อ ส่งเอง ยืนยันคำสั่งเสี่ยงด้วยเสียง ดูข้อจำกัดใน VOICE_COMMANDS_TH.md |
| Offline STT | มีแล้ว (0.8.0) | Whisper small / Thonburian medium ในเครื่อง หรือ OpenAI / Gemini; ยังต้องวัด accuracy เสียงคำสั่ง/คำเรียกครบชุด |
| ปากขยับตามเสียงจริง | มีแบบง่าย (0.8.1) | RMS 12 ครั้ง/วินาทีจากเสียงที่เล่น ยืดตัว sprite ตามความดัง; ยังไม่มีภาพปากหลายระดับ |
| ดูหน้าจอเมื่อขอ / ดูเป็นระยะเมื่อเปิดใช้ | มีแล้วบางส่วน | `look.js` และ IPC ใน `main.js`; มี consent ครั้งแรกและโหมด opt-in แต่ยังไม่มีเลือกหน้าต่าง+preview ก่อนส่งแต่ละครั้งตามแผนใหม่ |
| Mainframe รวม brain/voice/mic/hotkeys | มีหน้าตั้งค่าแยกบางส่วน | `setup.js`, `speech.js`, เมนูใน `main.js`; ยังไม่มีหน้ารวมแบบเขาและยังไม่มี mic/hotkey editor |
| ตั้งค่าโมเดลอัตโนมัติ / ตรวจทรัพยากร | มีบางส่วน | `setup.js`, `ollama.js`, `pc.js`; ไม่ใช่ระบบ engine/ดาวน์โหลดโมเดลทั้งชุดแบบ C# ของเขา |
| Startup / installer / update | มีแล้ว (0.8.1) | NSIS installer + electron-updater จาก GitHub Releases; บันทึก error ลง `errors.txt`; ยังไม่มี code signing |
| สั่งคลิก พิมพ์ เลื่อนหลายขั้นตอน / cursor agent | ยังไม่มี และอยู่นอก MVP เดิม | ไม่รวม Blackwall/bypass permissions ในชุดงานปัจจุบัน |
| Coding Hub Claude/Codex/OpenCode | มี Claude/Codex/Antigravity เป็นฐาน | `assistants.js`, `bridge.js`, `brain.js`; ยังไม่มี OpenCode และ dashboard หลาย session ตามแผน นี่เป็นส่วนต่อยอดของเรา ไม่ใช่ของสำเร็จรูปจาก lachydotmcg |
| Godot character | ยังไม่เชื่อม | ใช้ sprite renderer อยู่; เริ่มทดลอง export หนึ่งตัวภายหลัง ไม่ต้องรื้อ Electron |

## ลำดับงานต่อจากของปัจจุบัน

### 1. Voice Chat ภาษาไทย โดยใช้คำสั่งเดิม

นี่คือช่องว่างเด่นจาก lachydotmcg ที่ควรเติมก่อน ไม่ใช่การทำ TTS ซ้ำ

- [x] ปุ่มกดพูด เริ่ม/หยุด/ยกเลิก พร้อมสถานะกำลังอัดชัดเจน และเลือกไมค์ได้
- [x] แปลงเสียงไทยเป็นข้อความ มี local และ cloud ตามความต้องการเดิม; ไม่ดาวน์โหลดโมเดลใหญ่โดยไม่แจ้งผู้ใช้
- [x] แสดง transcript ให้แก้ไขและกดส่ง ส่งต่อเข้า `Chat` เดิมเพื่อใช้เปิดแอป เพลง ตั้งเตือน และตอบผ่าน TTS ที่ทำไว้แล้ว
- [x] หยุดอัดเมื่อปิด/ยกเลิก และจัดการไมค์ถูกปฏิเสธ ไม่มีอุปกรณ์ timeout และ network error
- [x] ทดสอบ 20 text transcript fixtures และ smoke flow ในแอปจริง
- [ ] เก็บเสียงไทยอย่างน้อย 20 ประโยคเพื่อวัด accuracy ของ STT และคำเรียกจริง; ไม่ใช้ text fixtures แทน audio benchmark

เกณฑ์เสร็จ: พูด → ตรวจข้อความ → ส่ง → ได้คำตอบ/ผลการกระทำ → อ่านออกเสียง; ยกเลิกก่อนส่งแล้วไม่ทำงานใด ๆ ไม่มี background recording

### 2. หน้าตั้งค่ารวมแบบ Mainframe

- [ ] รวมแท็บ AI / ตัวละคร / เสียงพูด / ไมค์ / คีย์ลัด / การเชื่อมต่อ โดยเรียกโมดูลเดิม
- [ ] แสดงว่าอะไรพร้อมใช้งาน อะไรขาด voice/model/key และมีปุ่มทดสอบในหน้าเดียว
- [ ] คีย์ลัดเริ่มพูด เปิดแชต ซ่อนตัวละคร และหยุดเสียง พร้อมตรวจชนกันและคืนค่าเดิม

เกณฑ์เสร็จ: ผู้ใช้ตั้งแต่เลือก AI ถึงทดสอบพูดสำเร็จจากหน้าเดียวได้ โดยไม่ต้องแก้ config ด้วยมือ

### 3. ทำ Screen Vision ที่มีอยู่ให้ครบแผน

- [ ] เลือกจอ/หน้าต่าง → preview → ยืนยันส่ง พร้อมชื่อ provider
- [ ] ตรวจโมเดลรองรับภาพ; ยกเลิกแล้วไม่ส่งและไม่บันทึกภาพโดยปริยาย
- [ ] โหมดดูหน้าจอเป็นระยะยังเป็น opt-in แยกชัดเจน; หากเปลี่ยนผู้ให้บริการให้ขอยินยอมใหม่

เกณฑ์เสร็จ: เลือกหน้าต่างทดสอบที่ต่างจากจอหลักได้ และพิสูจน์ว่าไม่ส่งภาพเมื่อยกเลิก

### 4. ปากและท่าทางตามเสียง

- [x] ทำ RMS envelope จาก audio playback ที่มีอยู่ พร้อม smoothing; หยุดปากเมื่อ stop/mute/error
- [ ] ตัวละครที่ไม่มีภาพปากหลายระดับใช้ talking/idle fallback และแจ้งข้อจำกัด
- [ ] ทดลอง export Godot หนึ่งตัวให้มี idle/talking/thinking/alert ก่อนเพิ่มเดิน/นั่งครบชุด

### 5. Coding Hub ตามแผนเดิม

- [ ] ตรวจ API/hook เวอร์ชันจริงของ OpenCode ก่อนเพิ่ม adapter
- [ ] รวม project/session, event dedup, timeout และ recovery โดยไม่ทำให้ hooks Claude/Codex/AGY เดิมเสีย
- [ ] เพิ่ม token ให้ local bridge พร้อมอัปเดต hook senders และทดสอบความเข้ากันได้ก่อนเปิด Hub เพิ่ม
- [ ] แสดงสถานะที่ provider ส่งมาได้จริง ไม่สร้าง approval/completed event ขึ้นเอง

### 6. ก่อนเผยแพร่รุ่น Beta

- [ ] ทดสอบ clean install/update/uninstall กับข้อมูลตัวละครและคีย์เดิม
- [ ] bridge authentication ต้องเสร็จก่อน public Beta แม้เลื่อน Coding Hub ออกไป
- [ ] ทดสอบ Thai TTS/STT จริงทั้ง local/cloud และระบุค่าใช้จ่าย/ขนาดโมเดล
- [x] จัด release notes และวางระบบ update (GitHub Releases, `latest.yml` มี sha512)
- [ ] ตรวจ LICENSE/เครดิตก่อน public Beta; code signing ตามความพร้อม

ยังไม่กำหนดเลขรุ่นของงานที่ไม่เสร็จ และไม่รวม computer-use อิสระหรือ Mac/Linux ในลำดับนี้

## หลักฐานและแหล่งอ้างอิง

- ฐานโค้ดเรา: package version 0.8.1; ดู [คู่มือเสียงและข้อจำกัด](../../SPEECH_TH.md), [ตัวละคร](../../CHARACTERS.md), [ภาษาไทย](../../THAI_SUPPORT.md)
- `npm test` เป็น unit tests; ไม่ใช้แทนการทดสอบเสียงไทยจริงหรือ provider ที่ต้องมีคีย์
- ฝั่งอ้างอิง: [README และ checklist](https://github.com/lachydotmcg/capri-desktop/blob/main/README.md), ตรวจ main SHA `72d6b8374905689d8d49736079f322c9429bd52e` วันที่ 29 ตุลาคม 2026
- [Source tree ณ SHA ที่ตรวจ](https://github.com/lachydotmcg/capri-desktop/tree/72d6b8374905689d8d49736079f322c9429bd52e/app), [แนวทาง build/contribute](https://github.com/lachydotmcg/capri-desktop/blob/main/CONTRIBUTING.md)

แผนนี้แทนลำดับเริ่มจากศูนย์ของเอกสารเก่า สำหรับงานถัดไปให้ใช้รายการค้างในเอกสารนี้เป็นหลัก

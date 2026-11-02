# เอกสาร Uncle Desktop

จัดหมวดและตรวจเทียบคู่มือหลักกับ source 0.23.10 วันที่ 1 พฤศจิกายน 2026 การตรวจเอกสารไม่แทนการทดสอบอุปกรณ์/บริการจริง

## จุดเริ่มต้น

| ต้องการ | อ่าน |
|---|---|
| ใช้งานโปรแกรม | [คู่มือหลัก](MANUAL_TH.md) |
| แก้โค้ดร่วมกับ AI Agent | [กฎกลาง AGENTS.md](../AGENTS.md); [Claude](../CLAUDE.md) / [Gemini](../GEMINI.md) ชี้เข้ากฎเดียวกัน |
| เลือกงานถัดไป / ดูงานรอตรวจจริง | [แผนงานหลัก](ROADMAP_TH.md) — ใช้ไฟล์นี้เพียงแห่งเดียว |
| แนะนำโปรแกรมและติดตั้ง | [ภาษาไทย](../README.th.md) / [English](../README.md) |

Agent/IDE ที่ไม่อ่านกฎโดยอัตโนมัติ ให้สั่งอ่าน `AGENTS.md` ใน prompt เริ่มงาน

## คู่มือตามเรื่อง

| คู่มือ | ขอบเขต |
|---|---|
| [MANUAL_TH.md](MANUAL_TH.md) | เริ่มใช้ เมนู/แท็บ คีย์ลัด เพลง และวิธีแก้ปัญหาทั่วไป |
| [INSTALL_MAC_TH.md](INSTALL_MAC_TH.md) | ติดตั้ง macOS beta และสิทธิ์ที่ต้องให้ |
| [CHARACTERS.md](CHARACTERS.md) | เลือกตัวละคร จำนวนเฟรม/HD ตาม assets และข้อจำกัดแอนิเมชัน |
| [ADD_YOUR_CHARACTER.md](ADD_YOUR_CHARACTER.md) | นำเข้าภาพหรือ atlas ของผู้ใช้ |
| [character-sprites.md](character-sprites.md) | คู่มือทีมพัฒนา: manifest, DPI, cache, rig, motion และการแพ็กภาพ |
| [SPEECH_TH.md](SPEECH_TH.md) | TTS ทุก backend, Kokoro ไทย, อ่านทีละประโยค และหยุดเสียง |
| [VOICE_COMMANDS_TH.md](VOICE_COMMANDS_TH.md) | Local/Gemini/OpenAI STT, ไมค์ 3 โหมด, คำเรียก, consent และยกเลิก |
| [VOICE_AGENT_TH.md](VOICE_AGENT_TH.md) | ElevenLabs conversation, client tools และผลทดสอบที่ระบุวันที่ |
| [COMPUTER_CONTROL_TH.md](COMPUTER_CONTROL_TH.md) | งานหลายขั้นตอน, ระดับสิทธิ์, ยืนยันผล และ Windows/macOS |
| [TELEGRAM_TH.md](TELEGRAM_TH.md) | bot/allowlist/PIN, เสียง/รูป/ไฟล์, Coding Agent sessions และควบคุมเครื่อง |
| [ASSISTANT_TH.md](ASSISTANT_TH.md) | Gmail/Calendar, MCP, งาน ข่าว สรุป และ LINE |
| [THAI_SUPPORT.md](THAI_SUPPORT.md) | ภาษาไทยและตัวอย่างคำสั่ง |

## ไฟล์ประกอบและเครดิต

- `images/` — ภาพหน้าจอประกอบ README/เอกสารต้นทาง ย้ายรวมไว้โดยคงไฟล์ภาพเดิม
- `provenance/` — พรอมป์ต์/ที่มาภาพตัวละคร: [ชุดเดิม](provenance/character-generation.json), [Mira](provenance/mira-generation.json), [Pinky](provenance/pinky-pastel-edit.json) ข้อมูล runtime อยู่ `assets/characters/` แยกต่างหาก
- `promo/` — โปสเตอร์ไทย/อังกฤษและพรอมป์ต์ [ไทย](promo/PROMPTS.th.md) / [English](promo/PROMPTS.en.md) path อ้างอิงในพรอมป์ต์เก่าเป็นประวัติ ไม่ใช่ workspace ที่ให้กลับไปแก้
- ใบอนุญาต: [Whisper](WHISPER_LICENSES.md), [Thonburian](THONBURIAN_LICENSE.md) และ [LICENSE ของโปรเจกต์](../LICENSE) คงแยกจากแผน

## รายงานการทดสอบ

[Agent Hub ผ่าน Telegram จริง](testing/AGENT_HUB_E2E_TH.md) — Claude ผ่านวงจรสร้างโปรเจกต์และ session; Codex ยังติดโมเดลที่บัญชีไม่รองรับ ดูขอบเขตที่ยังไม่ได้ตรวจในรายงาน

## ประวัติ — ไม่ใช่แผนงานปัจจุบัน

| ที่เก็บ | เนื้อหา |
|---|---|
| [archive/plans/ROADMAP_TH.md](archive/plans/ROADMAP_TH.md) | แผนผู้ช่วยส่วนตัวเดิม v0.18 เป็นต้นมา |
| [archive/plans/FEATURE_ROADMAP_TH.md](archive/plans/FEATURE_ROADMAP_TH.md) | การเปรียบเทียบฟีเจอร์เดิม ณ 0.8.1 |
| [archive/plans/AGENT_HUB_PLAN_TH.md](archive/plans/AGENT_HUB_PLAN_TH.md) | ทดลอง driver/session, เฟสงาน และเหตุผลพัก Mini App |
| [archive/QA_HISTORY_TH.md](archive/QA_HISTORY_TH.md) | ผล QA จากคู่มือเก่า ไม่ใช่ผลทดสอบใหม่ |
| [archive/upstream/README.upstream.md](archive/upstream/README.upstream.md) / [français](archive/upstream/README.fr.md) | เอกสาร Capri ต้นทาง เก็บประวัติและเครดิต ไม่ใช่คำแปล Uncle ปัจจุบัน |

## ผลการคลีนเอกสาร

เดิมแผน 3 รุ่นปนกับคู่มือและระบุสถานะขัดกัน จัดเหลือแผนหลักเดียวแล้ว ส่วนแผนเดิมเก็บใน archive เพื่อไม่ให้ Agent เลือกงานที่มีโค้ดแล้วมาสร้างซ้ำ

คู่มือเก่าเคยระบุ 13 ตัว/ทุกตัว 24 เฟรม, ไม่มีขยับปาก, ไม่มี drag/macOS, เปลี่ยนคีย์ลัดไม่ได้, Telegram ต้อง PIN เสมอ และไม่เก็บรูปทุกกรณี ปรับให้ตรงกับ source โดยแยกความสามารถที่มีโค้ดออกจากงานรอทดสอบจริงแล้ว คู่มือหลักลดตาราง TTS ที่ซ้ำและชี้ไปคู่มือเสียงโดยตรง บันทึกผลทดสอบเก่าแยกไป QA history

README ต้นทางย้ายออกจาก root; ภาพหน้าจอและ JSON provenance แยกโฟลเดอร์ คู่มือที่เปิดจากแอป (`ASSISTANT_TH.md`, `TELEGRAM_TH.md`) คง URL เดิม และปรับรายการแพ็กเอกสารให้ตามชื่อไฟล์ใหม่

## ดูแลต่อ

- กฎ Agent แก้ที่ `AGENTS.md`; งาน/เกณฑ์รับงานแก้ที่ ROADMAP แถวเดิม ไม่สร้างแผนแยกตาม Agent หรือแชต
- คู่มือเขียนวิธีใช้ปัจจุบัน ผลทดสอบระบุวันที่/แพลตฟอร์ม/สิ่งจำลอง ไม่ใช้จำนวน tests เก่ารับรอง source ใหม่
- ก่อนย้ายเอกสารตรวจลิงก์จาก README, source และ package config; เก็บเครดิต/ใบอนุญาตและเหตุผลที่ยังจำเป็น
- การมี backend/manifest ไม่รับรองบริการจริง อัตราสำเร็จ คุณภาพเสียง หรือภาพใน installed app ดูรายการ QA ใน ROADMAP

# แผนงานหลัก — Uncle Desktop

ทบทวน 1 พฤศจิกายน 2026 จากโค้ดรุ่น 0.23.10 และแผนเดิมทั้ง 3 ไฟล์ แผนนี้เป็นจุดติดตามงานปัจจุบันเพียงแห่งเดียว ดู [สารบัญและผลวิเคราะห์เอกสาร](README.md) และ [กฎร่วมสำหรับ Agent](../AGENTS.md)

สถานะ: **มีโค้ด** = พบ implementation; **รอตรวจจริง** = ยังยืนยัน end-to-end ไม่ครบ; **เสนอ** = ยังไม่ใช่งานที่อนุมัติให้เริ่ม; **พัก** = เก็บเหตุผลไว้ ไม่ทำอัตโนมัติ ไม่มีงานใดถูกประกาศว่า “กำลังทำ” เพียงเพราะอยู่ในแผน

## ฐานที่มีแล้ว ไม่ต้องสร้างซ้ำ

| ส่วน | หลักฐานใน repository | ขอบเขตการยืนยัน |
|---|---|---|
| Local/Cloud chat, บันทึกบุคลิกและความจำ | `src/main/llm.js`, `ollama.js`, `main.js`; `src/renderer/js/chat.js` | คุณภาพและบริการจริงต้องตรวจตาม provider |
| ตั้งค่าแบบขั้นตอน/แท็บ และแก้คีย์ลัด | `src/renderer/js/settings.js`, `tests/settings.test.js` | แผน “ยังไม่มีหน้ารวม/แก้คีย์ลัด” รุ่น 0.8.1 ล้าสมัย; UX รวมเพิ่มเติมเป็นข้อเสนอ |
| เสียงพูด, Local/Cloud STT, คำเรียก, ElevenLabs | `src/main/speech.js`, `listening.js`, `voice-agent.js`; renderer ฝั่งเสียง | มีโค้ดและ tests ไม่ใช่ benchmark ไมค์/เสียงมนุษย์ครบทุกบริการ |
| ควบคุมเครื่อง เปิดแอป/เว็บ/เพลง และเสียงระบบ | `src/main/computer.js`, `computer-system.js`, `computer-audio.cs`, `computer-mac.swift` | ตรวจผลและความสามารถแยก Windows/macOS |
| Telegram, User ID allowlist, PIN เปิด/ปิดได้, งานจากเสียง | `src/main/telegram.js`, `phone.js`, `main.js`; tests ฝั่ง Telegram/phone | การปิด PIN ยังต้องผ่านสิทธิ์ผู้ใช้และสวิตช์เดิม |
| Coding Agent sessions ร่วมบนคอม/มือถือ | `src/main/agents.js`, `agent-phone.js`, `src/renderer/agents.html` | Claude/Codex; รูปใช้บันทึกไฟล์แล้วส่ง path ไม่ใช่ native image blocks ทุก driver |
| ผู้ช่วย MCP, งาน, ข่าวและสรุป | `src/main/assistant.js`, `tasks.js`, `jobs.js`, `news.js`, `briefs.js` | เชื่อมผ่าน MCP ไม่เท่ากับมี native integration/ทดสอบบัญชีจริงทุกบริการ |
| ตัวละครและ HD/motion pipeline | `assets/characters/catalog.json`, `src/renderer/js/character-assets.js`, `character-renderer.js` | ตรวจ resolution/frames ต่อชุด; legacy fallback อาจทำให้ภาพเบลอ |
| Packaging/update | `package.json`, `.github/workflows/` | Source 0.23.10 ถูก push แล้ว; installer ที่ยืนยันในบันทึกล่าสุดยังเป็น 0.23.9 |

หลักฐานการทดสอบก่อนจัดเอกสาร: `npm test` บน Windows หลัง merge 0.23.10: 173 tests / ผ่าน 170 / skip 3 / fail 0 เป็นผล ณ ครั้งนั้น ไม่ใช้รับรองการแก้ภายหลังหรือ macOS จริง

## ลำดับแนะนำสำหรับงานถัดไป

รายการนี้รวมงานค้างที่ยังมีประโยชน์ ไม่ใช่คำสั่งให้เริ่มทำทั้งหมด เลือกตามคำขอผู้ใช้และอัปเดตแถวเดิม

| ID | งาน / สถานะ | เกณฑ์ปิดงานและหลักฐานที่ต้องบันทึก |
|---|---|---|
| QA-01 | Telegram เสียง/สิทธิ์ end-to-end — รอตรวจจริง | Bot จริง: เพลง YouTube/Spotify, เปิดแอป, ปรับเสียง, PIN เปิด/ปิด, ผู้ใช้ไม่อนุญาต, ยกเลิก/หมดเวลา, ผลกลับแชตผู้สั่ง และไม่เปิดหน้าตั้งค่าหลังจบ; ระบุ provider/OS และผลแต่ละกรณี |
| QA-02 | ภาพ HD ในแอปที่ติดตั้ง — รอตรวจจริง | ตรวจ executable path กับ single-instance, `activeResolution`, DPI/scale/full/bust และ fallback โดยเฉพาะ Lili bust scale 1.6; แยกภาพโหลดได้จากภาพที่ renderer ใช้จริง |
| QA-03 | Coding Agent Hub — รอตรวจจริง | เมนู installed app → session Claude/Codex → ถามอนุมัติ/ตอบจากคอมหรือ Telegram จริง → resume/interrupt; ตรวจ Agent จริงอ่านภาพจาก path ได้และไม่ตอบคำถามซ้ำ |
| SEC-01 | Local bridge authentication — แก้ใน source / ตรวจจริงบน Windows แล้ว | 2026-11-03: แอปสร้าง token สุ่มใหม่ทุกครั้งที่เปิดที่ `userData/bridge-token` (`hooks/bridge-token.js`); `/event` และ `/debug/*` ต้องมี header `x-capri-token` ไม่งั้นตอบ 401, `/health` เปิดเหมือนเดิม; hook Claude/Codex/Antigravity, `demo.js` และ smoke scripts อ่าน token จากไฟล์ทุกครั้ง hook ที่ติดตั้งไว้แล้วชี้ไฟล์ใน `hooks/` จึงไม่ต้องติดตั้งใหม่ `tests/bridge.test.js` + `npm test` 206 / ผ่าน 203 / skip 3 บน Windows; 2026-11-03 ตรวจจริง Windows 11: source `--dev` และ installer 0.23.11 ที่ build จาก branch นี้ (ติดตั้ง per-user) — ไม่มี token/token ผิด 401, token ถูก 200, Origin 403, `/debug/eval` ไม่มี token 401 (packaged ไม่มี debug = 404); hook Claude/Codex/Antigravity จาก `app.asar.unpacked/hooks` ทั้งผ่าน node และ `ELECTRON_RUN_AS_NODE` ได้ 200 และ token เปลี่ยนทุกครั้งที่เปิดแอป; ยังไม่ได้ตรวจ macOS และ Claude Code ตัวจริงที่ติดตั้ง hook ผ่าน settings.json |
| QA-04 | Thai STT/TTS benchmark — รอตรวจจริง | เสียงมนุษย์ไทยอย่างน้อย 20 ประโยค + คำเรียก + เสียงรบกวน วัดความถูกต้องและเวลา local/cloud แยกกัน; text fixtures/เสียงสังเคราะห์ไม่นับแทนทั้งหมด ตรวจ Kokoro streaming จริงด้วย |
| QA-05 | macOS / หลายจอ / external apps — รอตรวจจริง | Mac จริงทั้งสิทธิ์ mic/Accessibility/Screen Recording, native helper, media/volume, lock ตำแหน่งต่างจอ, เกม/แอปภายนอก; ระบุ chip/OS/ข้อจำกัด ไม่อ้าง Windows tests แทน |
| QA-06 | บริการผู้ช่วยด้วยบัญชีจริง — รอตรวจจริง | Gmail/Calendar/OAuth, LINE และ Outlook/Drive/Notion/Slack ผ่าน MCP ตามบัญชีที่ได้รับอนุญาต ทดสอบอ่าน/เขียน/ปฏิเสธ/ยกเลิก และบันทึกเฉพาะข้อมูลที่ปกปิดแล้ว |
| HUB-02 | ตรวจความพร้อมโมเดล Coding Agent — แก้ใน source | Codex ใช้ default ที่บัญชีแจ้งว่ารองรับเมื่อไม่ได้กำหนดโมเดล และแจ้งข้อผิดพลาดเมื่อโมเดลที่กำหนดไม่รองรับ; ผ่าน Telegram จริง |
| HUB-03 | แยก interrupted จาก error — แก้ใน source | รายงาน “หยุดโดยผู้ใช้” และทำให้คำถามหมดอายุ; ตรวจ Telegram จริงแล้วว่ารับงานใหม่ได้ |
| REL-01 | แพ็กและ QA รุ่นถัดไป — รอตรวจจริง | clean install/update/uninstall, ข้อมูล/คีย์เดิมยังอยู่, build Windows/macOS และทวน license/เครดิต; tag/release/upload เมื่อได้รับคำสั่ง เลข source ไม่ใช่หลักฐานว่า installer เผยแพร่แล้ว |

## งาน Hub ที่ปรับแล้ว

2026-11-01 · HUB-01: ปรับ lifecycle เมื่อ process/pipe ล้ม, Codex RPC timeout 30 วินาทีต่อคำขอ, ยกเลิก prompt ระหว่างเริ่ม session, ล้าง approval หลังจบรอบ/interrupt/close และตรวจสวิตช์อนุมัติ Telegram ตอนตอบจริง UI ผูกปุ่มกับ session ที่สร้างคำถาม

หลักฐาน Windows แบบจำลอง: Hub tests 17/17; `npm test` รวม 184 / ผ่าน 181 / skip 3 / fail 0 ยังไม่ได้ทดสอบ CLI ตัวจริง, installed app หรือ Telegram bot จริง จึงยังไม่ปิด QA-03

2026-11-01 · QA-03 ตรวจจริงบางส่วน: Telegram Desktop + source app + Claude Code ผ่านสร้างโปรเจกต์/อนุมัติ/รัน tests 4 ข้อ/ปิด-resume/จำบริบท/ปฏิเสธ/interrupt/รับงานใหม่ ดู [รายงาน E2E](testing/AGENT_HUB_E2E_TH.md) Codex ติด model_not_found จึงยังไม่ปิด QA-03 และยังไม่รับรอง installed app, macOS, รูป/เสียง หรือการอนุมัติสลับสองฝั่ง

2026-11-02 · ตรวจ Codex ผ่าน Telegram Desktop เพิ่ม: สร้างโปรเจกต์ อนุมัติ รันทดสอบ commit ในโปรเจกต์ทดสอบ resume และ interrupt ผ่าน; source tests ผ่าน 195 ข้าม 3 ยังไม่ปิด QA-03 เพราะการแนบภาพ/ไฟล์และเสียงผ่าน Telegram จริง, installed app และ macOS ยังไม่ได้ยืนยัน ดูรายละเอียดและข้อจำกัดใน [รายงาน E2E](testing/AGENT_HUB_E2E_TH.md)

## งานเอกสารที่ปิดแล้ว

2026-11-01 · DOC-01: รวมแผน จัด archive/upstream/images/provenance ปรับคู่มือหลัก 6 ไฟล์และ pipeline ตาม source แก้ลิงก์และรายการ packaging; เป็นการตรวจเอกสาร ไม่ได้ปิด QA-01 ถึง QA-06 หรือ REL-01

## ข้อเสนอต่อยอดที่ยังไม่เริ่ม

| ID | เรื่อง | ขอบเขต / เกณฑ์ตัดสิน |
|---|---|---|
| NEXT-01 | Screen Vision เลือกจอ/หน้าต่างและ preview | ของเดิมมี consent/auto opt-in; ส่วนเพิ่มต้องเลือกแหล่งภาพ แสดง provider ยกเลิกแล้วไม่ส่ง ตรวจโมเดลรับภาพและ consent หลังเปลี่ยน provider |
| NEXT-02 | Settings readiness และปุ่มทดสอบรวม | ใช้ settings เดิม แสดง model/key/voice ที่ขาด ตรวจการชนคีย์ลัดและคืนค่าเดิม; ทวนของที่มีแล้วก่อนเพิ่ม UI |
| NEXT-03 | OpenCode/Gemini หรือ driver เพิ่ม | ตรวจ protocol/เวอร์ชันจริงก่อนทำ; ใช้ session/event/approval เดิม ตรวจ dedup, timeout, recovery และแสดงเฉพาะสถานะที่ provider ส่งจริง |
| NEXT-04 | ปาก/ชิ้นส่วน/ท่าเดินนั่งเพิ่ม | ตรวจภาพแยกชั้นและ fallback ของแต่ละตัวก่อน; ไม่กำหนดทุกตัวต้อง 30 เฟรมหรือ 960px และไม่อ้างว่ามี phoneme lip sync จาก RMS/whole-frame poses |

## งานที่พักและเงื่อนไขกลับมาพิจารณา

| เรื่อง | เหตุผล / เงื่อนไข |
|---|---|
| Telegram Mini App + public tunnel | พักตามแผน Hub: เพิ่มพื้นผิวเข้าถึงเครื่องและภาระ cloudflared; LAN/VPN เป็นทางเลือกที่ต้องออกแบบ/อนุมัติก่อน |
| PDF ผ่าน Telegram | ปัจจุบันปฏิเสธชัดเจน; พิจารณา dependency/ขนาด/การอ่านข้อมูลเมื่อมีความต้องการจริง |
| Ollama preload ทุกครั้งที่เปิดแอป | พักเพราะกิน RAM ของคนที่ไม่ใช้แชต; แยกจาก Kokoro warmup ที่มีแล้ว |
| Godot / โมเดล 3D | เป็นแนวคิดทดลองหนึ่งตัว ไม่ย้าย Electron และไม่ใช่เงื่อนไขปิดงาน sprite ปัจจุบัน |
| Apple/Windows code signing | รอการตัดสินใจเรื่องบัญชี/ค่าใช้จ่าย/การเผยแพร่; ยังต้องแจ้งข้อจำกัดการติดตั้งตามจริง |
| README ฝรั่งเศส / slide นำเสนอ | README.fr เป็นเอกสาร Capri ต้นทาง; การแปล Uncle ฉบับใหม่และ slide เป็นงานเสนอ ไม่พบไฟล์ slide ใน repo นี้ |

## วิธีอัปเดตแผน

- เพิ่มงานเฉพาะที่ยังไม่ซ้ำ ระบุ ID, สถานะ, เกณฑ์ปิดงาน และหลักฐานที่ต้องมี; เริ่มงานเมื่อผู้ใช้เลือก ไม่ตั้งเลขรุ่นหรือวันส่งล่วงหน้าเอง
- เมื่อปิดงานย้ายสรุปเข้าฐานที่มีแล้วหรือบันทึกผลแบบสั้น ระบุวันที่/แพลตฟอร์ม/คำสั่งตรวจ ไม่สะสมบันทึกแชตยาวในแผน
- รายละเอียดประวัติและเหตุผลเดิมอยู่ [ROADMAP เดิม](archive/plans/ROADMAP_TH.md), [Feature roadmap เดิม](archive/plans/FEATURE_ROADMAP_TH.md), [Agent Hub เดิม](archive/plans/AGENT_HUB_PLAN_TH.md) ไม่แก้ checklist ประวัติให้กลายเป็นสถานะปัจจุบัน

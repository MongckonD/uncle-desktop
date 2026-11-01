# แผนพัฒนา: ศูนย์รวม Coding Agent (Remote Control หลายเจ้า)

เป้าหมาย: สั่ง Claude Code, Codex (และเจ้าอื่นในอนาคต) ผ่าน session เดียวกันได้ทั้งบนคอมและมือถือ
แบบ Remote Control ของ Claude Code: เห็นความคืบหน้าสด อนุญาตหรือปฏิเสธ ตอบคำถาม พิมพ์แทรก หยุด และทำงานต่อจาก session เดิม

สถานะ: ✅ เสร็จและทดสอบแล้ว · 🚧 กำลังทำ · ⬜ ยังไม่เริ่ม · ⏸ พักไว้ (มีเหตุผลกำกับ)

## หลักการ
- ใช้โปรโตคอลที่ Agent มีในตัว ไม่เพิ่ม dependency
  - **Claude Code:** `claude -p --input-format stream-json --output-format stream-json` เป็น process ค้างไว้ ส่งข้อความทาง stdin ได้หลายรอบ คำขออนุญาตมาเป็น `control_request`
  - **Codex:** `codex app-server` (JSON-RPC ผ่าน stdio): `thread/start`, `thread/resume`, `turn/start`, `turn/steer`, `turn/interrupt` คำขออนุญาตมาเป็น server request
  - **ตัวอื่น:** เพิ่มเป็น driver ใหม่ไฟล์เดียว เช่น Gemini CLI ผ่าน ACP (ยังไม่ได้ติดตั้งในเครื่องนี้)
- ทุก driver ส่งเหตุการณ์ออกมาในรูปเดียวกัน: `text` `tool` `ask` `done` `error` ให้คอมและมือถือใช้ร่วมกัน
- คำสั่งที่เสี่ยงต้องใส่ PIN เหมือนเดิม และทุกอย่างปิดไว้เป็นค่าเริ่มต้นจนกว่าจะเปิดในตั้งค่า

## เฟส 0: ทดลองโปรโตคอลกับเครื่องจริง
| # | งาน | สถานะ |
|---|---|---|
| 0.1 | เช็กเวอร์ชัน: Claude Code 2.1.312, Codex 0.153.4, Gemini ไม่ได้ติดตั้ง | ✅ |
| 0.2 | สร้างชนิดข้อมูลของ Codex app-server (`generate-ts`) แล้วอ่าน method ที่ต้องใช้ | ✅ |
| 0.3 | ลอง Claude stream-json: คุยหลายรอบ + คำขออนุญาต | ✅ |
| 0.4 | ลอง Codex app-server: thread, turn, คำขออนุญาต | ✅ |

## เฟส 1: แกนกลาง (`src/main/agents.js`)
| # | งาน | สถานะ |
|---|---|---|
| 1.1 | ตัวจัดการ session: เริ่ม ต่อ ส่งข้อความ หยุด ปิด และรายการ session ที่เปิดอยู่ | ✅ |
| 1.2 | driver ของ Claude Code (stream-json + control protocol) | ✅ |
| 1.3 | driver ของ Codex (app-server JSON-RPC) | ✅ |
| 1.4 | ชุดทดสอบด้วย Agent ปลอม และทดสอบจริงกับทั้งสองเจ้า | ✅ |

## เฟส 2: Telegram ระดับ Remote Control
| # | งาน | สถานะ |
|---|---|---|
| 2.1 | `/agents` ดูและเลือก session · `/new claude\|codex โปรเจกต์` | ⬜ |
| 2.2 | ข้อความทยอยขึ้นในข้อความเดียว (`editMessageText`) | ⬜ |
| 2.3 | ปุ่มอนุญาต / ปฏิเสธ / อนุญาตตลอด session + ตอบคำถามของ Agent | ⬜ |
| 2.4 | พิมพ์แทรกระหว่างทำงาน, `/interrupt`, ส่งรูปและเสียงเข้า session | ⬜ |

## เฟส 3: หน้าต่าง session บนคอม
| # | งาน | สถานะ |
|---|---|---|
| 3.1 | แผงรายชื่อ session + แชตของ session บนคอม (ใช้ session เดียวกับมือถือ) | ⬜ |
| 3.2 | ปุ่มอนุญาตและตอบคำถามบนคอม ตอบฝั่งไหนก่อนอีกฝั่งก็ปิดตาม | ⬜ |

## เฟส 4: Mini App เต็มจอบนมือถือ (เปิดเองเท่านั้น)
| # | งาน | สถานะ |
|---|---|---|
| 4.1 | หน้าเว็บ session (แชต, diff, แผนงาน) เปิดจากปุ่มใน Telegram | ⬜ |
| 4.2 | อุโมงค์ (Cloudflare Tunnel) + ตรวจ `initData` ของ Telegram + PIN | ⬜ |

## เฟส 5: ย้ายคำสั่ง Vibecode เดิม
| # | งาน | สถานะ |
|---|---|---|
| 5.1 | `/diff` `/commit` `/pr` `/undo` `/shot` ใช้กับ session ที่เลือก | ⬜ |
| 5.2 | `/code` เดิมส่งเข้าศูนย์รวม แล้วเลิกใช้ระบบ headless เก่า | ⬜ |

## บันทึกการทดสอบ
(เพิ่มทีละขั้นตอน: วันที่ · ทดสอบอะไร · ผล)

- **2026-11-01 · 0.3 Claude stream-json** (haiku): คุย 2 รอบใน process เดียว รอบสองขอใช้ Write มาเป็น `control_request` (`can_use_tool`) ตอบ `allow` แล้วไฟล์ถูกสร้าง ✅
- **2026-11-01 · 0.4 Codex app-server:**
  - ครั้งแรกล้มเหลว เพราะ `~/.codex/config.toml` ตั้งโมเดล `gpt-6.1-sol` ที่บัญชี ChatGPT ใช้ไม่ได้ จึงลองด้วย `gpt-5.6-luna` แทน
  - sandbox `read-only` ทำให้ Agent ปฏิเสธเองโดยไม่ถาม จึงเปลี่ยนเป็น `workspace-write` + `untrusted` แล้ว Agent ถามก่อนทำ
  - คำขอของ server อาจมี `id: 0` ต้องเช็กด้วย `!== undefined` (เจอบั๊กนี้ตอนทดลอง)
  - ผล: กด accept แล้วไฟล์ถูกสร้าง ✅
- **2026-11-01 · 1.4 ชุดทดสอบ** `tests/agents.test.js`: Claude (ข้อความ → ขออนุญาต → allow → จบ) และ Codex (ขออนุญาต → พิมพ์แทรกเป็น `turn/steer` → decline → จบ) ผ่าน ✅
- **2026-11-01 · 1.4 ทดสอบจริง** `node scripts/try-agents.js <folder> haiku gpt-5.6-luna`: ทั้งสองเจ้าสร้างไฟล์หลังได้รับอนุญาต ตอบคำถามต่อใน session เดิมได้ ได้รหัส session ไว้ต่องานทีหลัง และปิดได้ด้วยรหัส 0 ✅

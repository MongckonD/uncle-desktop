# เลือกตัวละคร

ตรวจเทียบ source 0.23.10 วันที่ 1 พฤศจิกายน 2026; ผลทดสอบกับบริการ/เครื่องจริงแยกจากการตรวจเอกสารครั้งนี้
เพิ่มภาพตัวละครของคุณเองได้จากปุ่ม **＋ เพิ่มตัวละครของฉัน** ในหน้าเลือกตัวละคร มี PNG ตัวอย่างให้บันทึกและพรอมป์ต์ AI พร้อมคัดลอก ดู [คู่มือเพิ่มตัวละคร](ADD_YOUR_CHARACTER.md)

คลิกขวาที่ตัวละครหรือไอคอนถาดระบบ → **เลือกตัวละคร…** เพื่อเปิดหน้าภาพตัวอย่างเต็มตัว กดการ์ดเพื่อดูตัวที่เลือก แล้วกด **ใช้ตัวละครนี้** จึงจะเปลี่ยนจริง เลื่อนดูรายชื่อได้ โดยหัวข้อและปุ่มยืนยันยังอยู่ให้กด ปิดได้ด้วยปุ่ม ✕, Esc หรือคลิกพื้นหลัง เมนูเปลี่ยนด่วนยังมีให้ใช้งานด้วย

รายชื่อที่ติดมากับ source รุ่นนี้มี 19 ตัว: UncleDev, Blacky, Bald Man, Lazy Boy, Angry Guy, Drunk Uncle, Vulture, Chubby Girl, Cute Girl, Fatty Girl, Pinky, Mira, Mochi, Lili, Luna, Pudding, Tama, Capri, Peegee ดูรายชื่อและชุดภาพที่ใช้งานจริงจาก `assets/characters/catalog.json`

ภาพชุดเริ่มต้นของ Mira สร้างจากภาพอ้างอิง AI ของผู้ใช้ มี 24 เฟรม / 6 สถานะ ใช้ 2 fps และท่าทางเบา ๆ แทนท่าทางการ์ตูน มีภาพตัวอย่างและบุคลิกแชตของตัวเอง เป็น sprite ภาพนิ่งสลับเฟรม ยังไม่ใช่วิดีโอหรือลิปซิงก์ ดูพรอมป์ต์ใน `docs/provenance/mira-generation.json`

ภาพชุดเริ่มต้นของ Pinky ปรับเป็นชมพูพาสเทลอ่อนตามภาพสีอ้างอิง ไม่มีน้ำตาหรือจุดฟ้าใต้ตาในทั้ง 24 เฟรม รวมภาพตัวอย่างและภาพแชต ดูพรอมป์ต์แก้ไขใน `docs/provenance/pinky-pastel-edit.json`

Capri ใช้ตัววาดภาพ WebGL และท่าทางต้นฉบับ โดยแสดงร่วมกับตัวละครใหม่ผ่าน Canvas เดียวกัน แอปจำตัวที่เลือกเมื่อเปิดใหม่ การเปลี่ยนตัวไม่รีโหลดหน้า ไม่ย้ายตำแหน่ง ไม่เปลี่ยนขนาด และไม่ล้างเซสชันงานของ Coding Agent

ภาพในกล่องข้อความ ไอคอนถาดระบบ ชื่อที่แสดง และคำสั่งบุคลิกแชตเปลี่ยนตามตัวละคร ประวัติแชตแยกเป็น `memory-<character-id>.json` ในโฟลเดอร์ข้อมูลแอป Capri กลับมาใช้ `memory.json` เดิมของตัวเอง เมื่อเปลี่ยนตัวระหว่างตอบแชต แอปหยุดคำตอบเดิม

## ภาพและสถานะ

ใช้ sprite 2D สร้างจากภาพอ้างอิงที่ผู้ใช้แนบด้วย built-in ImageGen ไม่ได้แก้ไขไฟล์หรือโมเดลในเกม Godot ภาพยังควรให้เจ้าของตัวละครตรวจรายละเอียดและจังหวะการเคลื่อนไหวก่อนเผยแพร่

| สถานะ | เมื่อแสดง |
|---|---|
| พัก | ไม่มีงาน |
| คิด | agent ทำงานหรือท่าครุ่นคิด |
| เรียกความสนใจ | agent รอผู้ใช้ อันดับความสำคัญสูงกว่าปฏิกิริยาอื่น |
| ฉลอง | งานสำเร็จ |
| ผิดพลาด | งานล้มเหลว |
| นอน | พักเมื่อไม่ได้ใช้งาน |

จำนวนเฟรมและความละเอียดขึ้นกับชุดภาพของแต่ละตัว ชุด legacy หลายตัวมี 24 เฟรม; Mochi มี sequence 30 เฟรมแยกเต็มตัว/ครึ่งตัว ส่วนชุดใหม่มี manifest และ atlas หลายหน้า ตัววาดใช้ logical coordinates 320×420 และเลือกความละเอียดตาม scale, DPI, GPU และ memory limits ตรวจการคลิกจาก alpha และรองรับโหมดลดการเคลื่อนไหว

ท่าเดิน/นั่งและชิ้นส่วนแยกไม่ได้มีครบทุกตัว ใช้ภาพท่าตามสถานะร่วมกับระบบเคลื่อนที่เดิม เสียงตอบขับการเปลี่ยนท่าหรือการเคลื่อนไหวของตัวละครที่รองรับตามระดับเสียง ไม่ใช่ phoneme lip sync หรือโมเดล 3D จริง ดู [คู่มือเสียง](SPEECH_TH.md) และ [pipeline ภาพ](character-sprites.md)

ตัวละครใหม่ Mochi, Lili, Luna, Pudding, Tama และ Peegee มี assets ระดับ 640×840; pipeline รองรับ 960×1260 แต่ไม่ใช่ทุกตัวมีภาพระดับนั้น หากโหลด manifest ล้มเหลวจะใช้ legacy atlas ซึ่งอาจดูเบลอเมื่อขยาย Peegee ไม่มี bust manifest แยกใน catalog ปัจจุบัน จึงใช้ crop จากชุดเต็มตัว

การเต้นอัตโนมัติต้องเปิดมินิเพลเยอร์/เต้นตามเพลง และเครื่องเล่นต้องประกาศ media session ของระบบ ไม่ได้ฟังไมค์เพื่อจับจังหวะเพลง

## ไฟล์

- `assets/characters/catalog.json` — รายชื่อและข้อมูลตัวละครที่เลือกได้ทั้งหมด
- `assets/characters/angry-boy/atlas.webp` และ `assets/characters/blacky/atlas.webp` — ภาพที่แอปใช้งาน
- `portrait.png`, `thinking.png`, `attention.png`, `success.png`, `error.png`, `sleep.png` — ภาพกล่องข้อความ
- `preview.jpg` ในแต่ละโฟลเดอร์ — ดูชุดเฟรมทั้งหมด
- `tools/normalize-characters.py --character ID RAW.png` — แยกภาพ สเกลร่วม และจัด anchor; ต้องมี Pillow, NumPy และ SciPy
- `docs/provenance/character-generation.json` — ภาพอ้างอิงและพรอมป์ต์ของชุดเพิ่ม 9 ตัว สร้างด้วย built-in ImageGen

## Prompt set / provenance

ใช้ built-in ImageGen (ไม่ได้ใช้ fallback CLI) โดยอ้างอิง:

- UncleDev: `ChatGPT Image 6 ก.ย. 2569 10_54_20.png`
- Blacky: `ChatGPT Image 6 ก.ย. 2569 19_53_51.png`

Production prompt: create a 4-column × 6-row transparent RGBA animation atlas, 24 complete isolated full-body figures, consistent camera/light/scale, shared bottom-center feet anchor, no scenery, labels, grid lines or ground shadows. Preserve the reference silhouette, outfit, facial features and colors. Rows: idle blink/breathing; thinking with hand at chin; attention with one raised hand; success cheer; frustrated error; drowsy standing sleep. Four small sequential pose changes per row.

UncleDev identity: oversized inverted triangular peach head, black bowl-cut bangs, thick angry eyebrows, red bloodshot eyes, cyan sleeveless ragged tunic, thin peach limbs, spherical hands and rounded black shoes.

Blacky identity: black inverted triangular cat head, two triangular ears, black bangs, golden eyes, two blue cheek spots, white nose, pink tongue, ragged black tunic, thin black limbs, black shoes and a curved tail. Final corrective edit: remove extra spherical nodules mistaken for head anatomy; exactly two arms and two paws, attached continuously to the shoulders, in all 24 figures.

## ตรวจสอบสำหรับนักพัฒนา

ใช้ `npm test` และชุด character/pipeline tests; วิธี rebuild และ smoke tests อยู่ใน [pipeline ภาพ](character-sprites.md) ผล QA เดิมย้ายไป [บันทึกประวัติ](archive/QA_HISTORY_TH.md) ไม่ใช่การยืนยันภาพใน installed app รุ่นปัจจุบัน

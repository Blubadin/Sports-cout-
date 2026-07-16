# SPORTSCOUT Overall Readiness Audit

วันที่ตรวจ: 16 กรกฎาคม 2026
เวอร์ชัน: `0.11.0-pilot.1`
Export schema: `1.1`

## Verdict

SPORTSCOUT พร้อมสำหรับ internal/teacher demo และพร้อมเข้าสู่ Hardware QA แต่ยังห้ามประกาศ Pilot RC จนหลักฐานจอยจริงและ Coach Pilot ผ่าน Gate

## คะแนนปัจจุบัน

| ระดับ | คะแนน | สถานะ |
|---|---:|---|
| Internal demo | 92/100 | พร้อม |
| Teacher/coach demo | 87/100 | พร้อมแบบมี checklist |
| Hardware QA | 82/100 | พร้อมเริ่มทดสอบ |
| Coach Pilot | 70/100 | Blocked รอหลักฐานจริง |
| Production | 55/100 | ยังไม่พร้อม backend/security operations/support |

## หลักฐานที่ยืนยันแล้ว

- Local-first ผ่าน IndexedDB, save-state, recovery, export/import schema `1.1`
- Controller runtime มี active-controller selection, edge/hold handling, neutral reconnect และ disconnect cancellation
- Controller V1 เป็น opt-in และ profile แยกจาก project data
- Pro HUD, History, Replay, Key Moments และ Controller Settings มี command model กลาง
- Dashboard/Table/Field Map ใช้ analytics/geometry helper กลางและมี Golden Dataset tests
- CSP/security headers, import sanitization, CSV formula protection และ privacy-safe diagnostic อยู่ใน code/config
- Playwright เปิด sample project ครบ 4 กีฬาและตรวจ 4 viewport โดยไม่มี horizontal overflow
- PWA update ตรวจ pending action/save state ก่อน reload และ offline-ready toast หายเอง

## Gate ที่ยังไม่ผ่าน

`npm.cmd run pilot:readiness` ต้องรายงาน `blocked` จนข้อมูลต่อไปนี้ถูกบันทึกเป็น `pass`:

- PS4/PS5/Xbox × USB/Bluetooth × Chrome/Edge = 12 cases
- 4 กีฬา × Normal/HUD/Controller × Local/YouTube = 24 cases
- 1366×768, 1920×1080, tablet landscape, phone landscape = 4 cases
- Controller endurance อย่างน้อย 60 นาที ไม่มี duplicate event/missed release/severe fatigue
- ผู้ใช้จริง 6–15 คน อย่างน้อย 8 sessions และ KPI ตาม Coach Pilot Protocol

## GridGeist UX Review

### High — Workspace มี density ไม่สมดุล

เมื่อวิดีโอว่าง ฝั่งซ้ายยังใช้ความสูงมาก แต่ฝั่ง Scout แน่นและต้อง scroll ยาว ทำให้พื้นที่สำคัญไม่ได้รับน้ำหนักตามงานจริง

**แนวแก้เล็กที่สุด:** ลด empty-video region ให้กระชับและขยายเมื่อมี media; รักษา video เป็น dominant element เมื่อโหลดแล้ว

### High — Settings บน phone landscape มีสอง scroll context

หน้า Settings และเนื้อหาภายใน modal เลื่อนได้พร้อมกัน ผู้ใช้จึงไม่แน่ใจว่ากำลังเลื่อนส่วนใด โดยแท็บสี่ชุดมีข้อความ TH/EN ยาว

**แนวแก้เล็กที่สุด:** lock body scroll เมื่อ modal เปิด, ใช้ scroll surface เดียว, ทำ tabs แบบ icon + short label และคงคำอธิบายใน heading ของ tab

### Medium — เส้นกรอบและ card ถูกใช้ถี่

Scout sections, mapping rows และ settings sections มี border/radius ซ้ำหลายชั้น ทำให้ความสัมพันธ์ระหว่าง section กับ item ไม่ชัดเท่าที่ควร

**แนวแก้เล็กที่สุด:** ใช้เส้นแบ่งแนวนอนสำหรับ section และเก็บ card ไว้เฉพาะ repeated actionable items เช่น events/profiles

### Medium — ภาษาและ type roles ยังผสม

ข้อความเช่น `SCOUTING CONSOLE`, `General`, `Backup` และศัพท์ไทยอยู่ใน heading เดียวกัน Mono ถูกใช้กับชื่อโปรเจกต์บางตำแหน่งที่ไม่ใช่ metadata

**แนวแก้เล็กที่สุด:** กำหนดคำหลัก TH/EN ใน catalog และสงวน mono สำหรับเวลา, skill/area code, ID และสถานะทางเทคนิค

### Resolved — PWA prompt บัง Controller Blueprint

Offline/update prompt เดิมอยู่กลางล่างและบัง mapping โดยเฉพาะ 844×390 รอบนี้ลดความกว้าง ชิดขวา และทำ offline-ready หายเองหลัง 4 วินาที

## ความเสี่ยงทางเทคนิคคงเหลือ

- Production bundle ยังมี HLS/DASH/player chunks มากกว่า 500 kB; ไม่ใช่ blocker แต่ควรโหลด player adapter ตาม source
- Security headers ยังต้องตรวจบน Vercel Preview จริง
- YouTube behavior, caption preference และ seek accuracy ต้องตรวจกับหลายคลิปจริง
- Local File System Access แตกต่างตาม browser; ต้องทดสอบ permission denied/revoked ใน Hardware QA
- ไม่มี backend/login/cloud audit trail จึงยังไม่เหมาะกับ multi-user production

## คำตัดสิน Release

- ใช้สำหรับ demo และ Hardware QA ได้
- ห้ามเปลี่ยน version เป็น Pilot RC หรือเปิด Controller V1 เป็นค่าเริ่มต้น
- หลัง `pilot:readiness` ผ่านจึงออก `0.12.0-pilot.rc1`, freeze feature และ deploy Preview สำหรับ acceptance รอบสุดท้าย

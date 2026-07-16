# การใช้ GridGeist กับ SPORTSCOUT

GridGeist ติดตั้งอยู่ที่ `$HOME/.codex/skills/gridgeist` และจะพร้อมเรียกใน Codex task ใหม่ด้วย `$gridgeist`

## หลักการสำหรับโปรเจกต์นี้

- ใช้โหมด **Review** ก่อนแก้ UI เสมอ
- Visual thesis: “พื้นที่ทำงานวิเคราะห์เกมที่แม่นยำ ใช้กริดสนาม เส้นแบ่ง และข้อมูลจริงเป็นภาษาภาพ โดยมีสีฟ้า SPORTSCOUT เป็น accent”
- รักษา behavior ของ Normal, Pro HUD, Phone HUD, Controller, video และ event data
- ห้ามเปลี่ยน operational dashboard ให้เป็น landing page
- ใช้ mono เฉพาะเวลา รหัส area, skill และ metadata
- ลด card ซ้อน card แต่ใช้เส้นแบ่งเพื่ออธิบาย adjacency ของ video, controls และ analytics

## Prompt รีวิวภาพรวม

```text
ใช้ $gridgeist รีวิว SPORTSCOUT โดยยังไม่แก้โค้ด
ผลิตภัณฑ์เป็นเครื่องมือ scouting สำหรับโค้ช อาจารย์ และนักศึกษา
ตรวจ app shell, video workspace, Scout, Dashboard, Table, Key Moments และ Settings
รักษาฟังก์ชันและสีฟ้าแบรนด์เดิม ตรวจ 1366x768, 1920x1080, tablet landscape และ phone landscape
ตอบเป็น Verdict หนึ่งบรรทัด ตามด้วย Critical/High/Medium findings พร้อมหลักฐานและแนวแก้ที่เล็กที่สุด
```

## Prompt ปรับ HUD

```text
ใช้ $gridgeist โหมด Redesign ปรับ Pro HUD ของ SPORTSCOUT
รักษา command model, keyboard/gamepad hold-aim-release, video visibility และทุก shortcut
ใช้สนาม พิกัด เวลา และสถานะ action เป็น product-native motif
ลด overlay ที่บัง score และทำ prompt ตาม context โดยไม่เพิ่ม dependency
ตรวจ keyboard, controller, reduced motion และ 1920x1080/1366x768
```

## Prompt ปรับ Controller Settings

```text
ใช้ $gridgeist รีวิวและปรับหน้า Controller Settings ของ SPORTSCOUT
รักษา 2D controller blueprint, remap, conflict resolution, calibration และ TH/EN
จัด hierarchy ให้ผู้ใช้ใหม่เห็นลำดับ เชื่อมต่อ > ตรวจปุ่ม > remap > calibration > บันทึก
ใช้ visible grid และเส้น callout อย่างมีเหตุผล ตรวจ PS/Xbox glyph, keyboard focus และ phone landscape
```

## Prompt ปรับ Field Intelligence

```text
ใช้ $gridgeist ปรับ Field Intelligence Map โดยไม่เปลี่ยน analytics หรือ area geometry
ให้สนามและข้อมูลจริงเป็นภาพหลัก เพิ่ม hierarchy ของ filter, legend, precision และ selected event
หลีกเลี่ยง dashboard cards ซ้ำ ตรวจ empty/unknown/out/sequence และทั้ง 4 กีฬา
```

หลังใช้ทุกครั้งให้รัน lint, unit tests, build, Playwright และตรวจ rendered UI ตาม `references/review-checklist.md`

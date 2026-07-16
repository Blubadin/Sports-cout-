# SPORTSCOUT Hardware QA

## จุดประสงค์

เอกสารนี้ใช้เก็บหลักฐานก่อนเปิด Controller V1 ให้กลุ่ม Pilot ผลจาก mock controller หรือ unit test ไม่ถือเป็นผลทดสอบฮาร์ดแวร์จริง

## อุปกรณ์และสภาพแวดล้อมบังคับ

- จอย: PS4 DualShock 4, PS5 DualSense, Xbox Wireless Controller
- การเชื่อมต่อ: USB และ Bluetooth
- Browser: Chrome และ Edge เวอร์ชันล่าสุดบน Windows
- รวมทั้งหมด 12 hardware cases ใน `pilot-evidence.json`

## ขั้นตอนต่อหนึ่ง Case

1. ปิดจอยอื่นทั้งหมด แล้วเชื่อมต่อจอยเป้าหมายเพียงหนึ่งตัว
2. เปิด `Settings > ตั้งค่าจอย > ทดสอบและปรับแกน`
3. ตรวจชื่อ family ที่ระบบแสดง โดยห้ามคัดลอก raw device ID ลงหลักฐาน
4. กด face buttons, shoulder, trigger, D-pad, stick click และหมุน analog ครบทุกทิศ
5. Remap หนึ่งคำสั่ง ทดสอบ conflict แบบ Swap/Replace/Cancel แล้วคืนค่า profile
6. เปิด Pro HUD แล้วทดสอบ Skill, Area, Result, Foul, Team, Save, Undo/Redo, seek, playback, History, Replay และ Bookmark
7. ระหว่างกำลังกดค้าง ให้ถอดสาย/ปิด Bluetooth และยืนยันว่าไม่มี command ถูก commit หลัง disconnect
8. บันทึกผลเป็น `pass` เฉพาะเมื่อไม่มี duplicate event, missed release, wrong glyph หรือ command collision

## Workflow Matrix

ทดสอบ 4 กีฬา × Normal/HUD/Controller × Local/YouTube รวม 24 cases โดยใช้ event อย่างน้อย 3 รายการต่อ case และตรวจ Table/Dashboard/Export เทียบกัน

## Endurance

ใช้จอยต่อเนื่องอย่างน้อย 60 นาที บันทึกจำนวน duplicate events, missed releases และอาการล้าที่รบกวนงาน หากค่าใดมากกว่า 0 หรือมี severe fatigue ให้สถานะ `fail`

## คำสั่งตรวจ Gate

```powershell
npm.cmd run pilot:readiness
```

Exit code ที่ไม่ใช่ `0` หมายถึงยังห้ามประกาศ Pilot-ready

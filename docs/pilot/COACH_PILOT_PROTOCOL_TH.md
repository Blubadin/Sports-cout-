# SPORTSCOUT Coach Pilot Protocol

## ขอบเขต

- ผู้ใช้ 6–15 คน
- อย่างน้อย 8 session/match และเริ่ม Volleyball 2–3 session
- ทดลองทั้ง Keyboard/Mouse และ Controller
- ใช้รหัส `P01`, `P02` แทนชื่อจริง ห้ามเก็บอีเมล เบอร์โทร raw device ID หรือไฟล์วิดีโอใน evidence

## ก่อนเริ่ม

1. สำรองข้อมูลทดสอบและยืนยันว่า app version ตรงกับ Pilot RC
2. อธิบาย workflow 4 ขั้นจาก Coach Quick Guide โดยไม่สอนรายละเอียดปุ่มเกินจำเป็น
3. ให้ผู้ใช้สร้าง event แรกเองและจับเวลา
4. กำหนดผู้สังเกตหนึ่งคน ไม่ช่วยเว้นแต่ผู้ใช้ติดเกิน 60 วินาที

## ระหว่าง Session

บันทึกเฉพาะตัวเลขต่อไปนี้ใน `pilot-evidence.json`:

- session สำเร็จหรือไม่
- unrecoverable data loss
- จำนวน event ทั้งหมดและ incomplete events
- เปิด project เดิมกลับมาได้หรือไม่
- วินาทีจนสร้าง event แรก
- controller tasks ที่พยายามและสำเร็จโดยไม่ใช้เมาส์

Feature request และความคิดเห็นเชิงคุณภาพให้เก็บในแบบ Feedback แยกจากไฟล์ evidence และไม่ใส่ข้อมูลส่วนตัว

## เป้าหมายผ่าน

- Unrecoverable data loss = `0`
- Session success ≥ `95%`
- Incomplete events < `2%`
- Project reopen = `100%`
- Event แรก < `10 นาที` ทุก session
- Controller completion โดยไม่ใช้เมาส์ ≥ `90%`

ระหว่าง Pilot แก้เฉพาะ data loss, crash, incorrect metric และ severe UX blocker ส่วน feature request อื่นเข้า backlog

# SP Test — เฟส 1: บัญชีและนโยบายรุ่นทดลอง

วันที่: 14 ตุลาคม 2026 · สาขา: `refactor/scouting-core-tracking-lab`

## สิ่งที่ทำในเฟสนี้

- Production build ทุกชุดต้องผ่าน Supabase Auth และการอนุมัติเครื่องก่อนโหลด Workstation; config ไม่ครบจะล็อกหน้าไว้
- ชื่อผู้ใช้ `association1` / `association2` แปลงเป็นตัวระบุ Auth ภายใน ไม่ต้องรับอีเมลจริงหรือส่งอีเมล
- รหัสผ่านตั้งผ่าน Auth Admin และเก็บแยกนอก Git; ไม่มีรหัสผ่านหรือ service-role key ใน frontend
- ใช้ Supabase เดิม `vxcsvhtkpsqgmyuelzdw` ตามที่ผู้ใช้เลือก ชื่อ SP Test เป็นชื่อรุ่นทดลอง ไม่มีการแก้ตาราง portfolio เดิม
- schema `sportscout_pilot` มีสมาชิกสูงสุดสอง slot และเครื่องหนึ่งรายการต่อสมาชิก ตรวจ Auth session ที่ยังมีอยู่จริง
- device credential สุ่ม 256 บิตอยู่ใน IndexedDB ของ browser profile; เซิร์ฟเวอร์เก็บเฉพาะ SHA-256 และออก lease 5 นาที ต่ออายุทุก 60 วินาที
- เพิกถอนสมาชิก/เครื่องแล้ว API ตรวจสิทธิ์ไม่ผ่านทันที การเปลี่ยน credential ลบ lease เก่าทั้งหมด; หน้าเว็บล็อกเมื่อ lease หมดอายุแม้เครือข่ายค้าง
- แยก IndexedDB/localStorage/ผลติดตาม/ไฟล์วิดีโอและช่องแจ้ง revision ตามบัญชี และรอ pending save ก่อน logout
- ปิด Export/Download/Print/clipboard export ผ่านแอป และปิดสี่เส้นทาง Export ของ Local AI ด้วย HTTP 403 `EXPORT_DISABLED_IN_PILOT`
- Development (`npm run dev` โดยไม่ตั้ง pilot flag) ยังใช้ข้อมูลและความสามารถเดิม; ไม่อัปโหลดข้อมูลพัฒนาเข้าคลาวด์

## ตั้งค่าหรือทบทวนเครื่องที่อนุมัติ

1. ผู้ใช้ล็อกอินแล้วส่ง **รหัสระบุเครื่อง** ที่หน้าเว็บแสดงให้ผู้ดูแล รหัสนี้เป็น fingerprint ไม่ใช่ credential
2. ผู้ดูแลตรวจตัวผู้ใช้และเครื่องจริง แล้วใช้ SQL ต่อไปนี้บนโปรเจกต์ที่กำหนด:

```sql
insert into sportscout_pilot.devices(slot,user_id,credential_hash)
select slot,user_id,'<64-character fingerprint>'
from sportscout_pilot.members where username='association1'
on conflict (slot) do update
set credential_hash=excluded.credential_hash, revoked_at=null, approved_at=now();
```

เปลี่ยน username เป็น association2 สำหรับเครื่องที่สอง ห้ามอนุมัติ credential ที่ผู้ทดสอบไม่ได้ยืนยัน เครื่อง QA ที่ใช้ตรวจ API ถูกเพิกถอนหลังตรวจแล้ว ยังไม่มีเครื่องสมาคมที่ได้รับอนุมัติ

การเพิกถอน:

```sql
update sportscout_pilot.devices set revoked_at=now() where slot=1;
update sportscout_pilot.members set active=false where username='association1';
```

## ข้อจำกัดและงานต่อ

- การอนุมัติเฟสนี้ผูกกับ browser profile ไม่ใช่การพิสูจน์ฮาร์ดแวร์แบบป้องกันการคัดลอก credential; การจับคู่ Windows Local AI เป็นเฟส 3
- Cloud project มีตารางเดิมอยู่แล้ว จึงแยก schema ใหม่ทั้งหมด แต่ **Auth signup ของทั้งโปรเจกต์ถูกจำกัด** ด้วย trigger ให้สร้างสองบัญชีนี้ผ่าน Auth Admin เท่านั้น หากนำระบบ portfolio เดิมกลับมาใช้ต้องทบทวน trigger นี้ก่อน
- ผู้ทดสอบไม่มีหน้าสมัครหรือรีเซ็ตรหัสผ่านด้วยอีเมล ผู้ดูแลเปลี่ยนรหัสผ่านผ่าน Supabase Dashboard
- วันหมดสิทธิ์เริ่มต้นคือสิ้นวันที่ 6 พฤศจิกายน 2026 เวลาไทย; ไม่มีการลบข้อมูลอัตโนมัติ
- ยังไม่ทำ cloud project sync, สิทธิ์เจ้าของโปรเจกต์/ผู้ดู, installer, Local AI HTTPS pairing หรือการรับรองเต็มแมตช์ CPU ในเฟสนี้
- Local AI รุ่น pilot ต้องตั้ง `SPORTSCOUT_RELEASE_CHANNEL=pilot` และ device credential มิฉะนั้นไม่เริ่มบริการ; การตรวจสิทธิ์งาน AI กับ cloud อยู่ในเฟส 3
- การปิด Export ไม่ป้องกัน screenshot, browser DevTools, การคัดลอกไฟล์ในเครื่อง หรือการดัดแปลง client

## Build และตรวจ

ใช้ `.env.example` เป็นต้นแบบสำหรับ `.env.pilot` ซึ่ง Git ignore และใช้เฉพาะ publishable key:

```text
npm run build:pilot
npm run typecheck
npm run lint
npm test
```

`npm run lint` เป็น ESLint จริง ตรวจ correctness rules ทั้ง src/scripts และตรวจ TypeScript เพิ่มใน pilot modules แยกจาก typecheck

ชุดตรวจเพิ่มเติม: PostgreSQL authorization ผ่าน PGlite, component login/lease, export client guard, Python pilot route guard และ API smoke กับ Supabase จริง ทั้งการอนุมัติและเพิกถอน

ผลตรวจเฟส 1: TypeScript, ESLint และ production pilot build ผ่าน; Vitest 111 ไฟล์ / 1,038 tests ผ่าน; Python 670 tests ผ่าน (ข้าม 4 ตามเงื่อนไขเดิม) ทดสอบ API จริงทั้งสองบัญชี และ browser login → อนุมัติ → เปิด workspace ว่าง → logout ผ่าน หลังจบ QA เพิกถอนเครื่องทดสอบและ sign out ทุก session แล้ว

ห้ามส่งรุ่นนี้ให้สมาคมเป็นรุ่นพร้อมใช้งานทั้งหมดจนเฟส 2–5 และการตรวจสองเครื่องจริงผ่าน

## ผลตรวจความปลอดภัยที่ยังต้องทบทวนก่อนเปิด Pilot

Supabase Advisor ไม่มี warning ใหม่ใน schema pilot หลังย้าย privileged broker ออกจาก public schema; ข้อ INFO สองรายการเป็นตาราง portfolio เดิมที่เปิด RLS โดยไม่มี policy (ปฏิเสธการเข้าถึงโดยปริยาย)

ค่าตรวจรหัสผ่านรั่วของโปรเจกต์เดิมยังปิดอยู่ ให้ทบทวน [Supabase password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) ก่อนส่งมอบ ไม่มีการรับรองว่าค่านี้เปิดแล้ว

`npm audit` ยังพบ 11 advisories (8 high, 3 moderate) ใน dependency chain เดิม เช่น jsdom/undici, Workbox/fast-uri, PostCSS และ sharp ไม่ใช่ Supabase SDK ที่เพิ่มใหม่ ต้องแก้และตรวจซ้ำในเฟสตรึงรุ่นก่อนเปิดให้สมาคมใช้ ไม่รวมการอัปเกรด dependency ทั้งระบบไว้ในเฟสบัญชีนี้

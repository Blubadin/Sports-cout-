# SP Test — เอกสารส่งต่อ session และเกณฑ์ส่งรุ่นทดลอง

จัดทำ 14 ตุลาคม 2026 (Asia/Bangkok) · งานนี้เป็นการวางแผน ยังไม่ได้เริ่มเฟส 2

## 1. เริ่มจากตรงนี้

**เป้าหมาย session ถัดไป: ทำเฟส 2 “ข้อมูลส่วนกลางและสิทธิ์โปรเจกต์” เท่านั้น** อ่านเอกสารนี้ แล้วอ่าน `docs/superpowers/plans/2026-10-14-sp-test-phase-2-cloud-data.md` ก่อนแก้โค้ด

ข้อกำหนดเดิมที่ผู้ใช้อนุมัติ: ผู้ทดสอบสองบัญชีบน Windows สองเครื่อง เปิดเว็บ HTTPS ใช้ Scout → Review → Analyze → Report, AI ทำบนเครื่องผู้ใช้, วิดีโอต้นฉบับไม่ขึ้นคลาวด์, สองบัญชีอ่านโปรเจกต์กันได้แต่แก้เฉพาะของตนเอง, ปิด Export ทุกทาง วันหมดสิทธิ์คือสิ้นวันที่ 6 พฤศจิกายน 2026 เวลาไทย

ผู้ใช้เปลี่ยนการล็อกอินเป็นชื่อผู้ใช้/รหัสผ่านที่ผู้ดูแลตั้ง และเลือก **Supabase โปรเจกต์เดิม** ห้ามกลับไปสร้างโปรเจกต์ใหม่หรือถามหาอีเมลสองบัญชีซ้ำ

### Checkout ที่ต้องใช้

```text
C:\Users\sport\.codex\worktrees\tracking-video-replacement\Sports-cout-
branch: refactor/scouting-core-tracking-lab
phase 1 implementation SHA: be72f5bab25ef5516f8aa5d58c2ae7a6e0a4d5b0
```

checkout ที่ `C:\Users\sport\OneDrive\Documents\GitHub\Sports-cout-` อยู่คนละ branch ตอนจบเฟส 1 **ห้ามแก้ในนั้นเพียงเพราะเป็น cwd ของ session ใหม่** ตรวจ `git worktree list`, `git branch --show-current`, `git status --short` และ HEAD ก่อน หากมีงานใหม่ให้รักษางานนั้นและตรวจความเปลี่ยนแปลงจาก SHA ข้างบน

ใช้ worktree เดิมได้ ไม่ต้องสร้าง worktree หรือเปลี่ยน main ก่อนเริ่ม ห้าม reset งานของผู้ใช้

### กฎการทำงาน

- อ่าน `AGENTS.md`; ทำหนึ่งเฟส → ตรวจ → แก้ regression → commit → รายงาน SHA/ผลตรวจ → **หยุด**
- Skills ที่ตรงงาน: using-superpowers, sportscout-context-router, executing-plans, supabase, migration, test-driven-development และ verification-before-completion; อ่านเนื้อหาปัจจุบันก่อนใช้
- วิธีเริ่มที่แนะนำคือทำเองใน session เดียวตาม task ของแผน; ไม่ต้องสร้างหลายแชตหรือส่งข้อความไปแชตอื่น
- รักษา dark workstation และ scouting-first; Labs เป็นส่วนทดลอง
- ห้ามเริ่ม Shuttle/Dataset Export/ฝึกโมเดลใหม่; MOT ID ต้องแยกจาก P1–P4; เป็นการประมาณ 2D

## 2. สิ่งที่มีจริงหลังเฟส 1

| รายการ | สถานะที่มีหลักฐาน |
|---|---|
| Supabase | ใช้ `Blubadin's Project`, ref `vxcsvhtkpsqgmyuelzdw`, org `Certificate portfolio`; restore จาก paused แล้วในเฟส 1 |
| ชื่อรุ่น | SP Test เป็นชื่อใน UI; ไม่ได้เปลี่ยนชื่อ cloud resource |
| บัญชี | association1 / association2 สร้างผ่าน Auth Admin แล้ว ไม่ส่งอีเมล |
| รหัสผ่าน | `.local-services/pilot-credentials.json` ใน worktree ข้างบน; ignored, ไม่ฝัง frontend/commit/log |
| อนุมัติเครื่อง | credential สุ่มใน IndexedDB + SHA-256 approval code + lease สูงสุด 5 นาที; heartbeat 60 วินาที |
| การผูกเครื่อง | ปัจจุบันผูก browser profile; **ยังไม่ใช่ Windows native pairing** |
| ข้อมูลในเครื่อง | แยก namespace บัญชี และ lazy-load Workstation หลังอนุมัติ; logout รอ pending save แล้ว reload |
| Export | client guards + ปุ่ม/print/clipboard export ปิด; Local AI pilot คืน 403 `EXPORT_DISABLED_IN_PILOT` |
| ข้อมูลคลาวด์ | มีเฉพาะ members/devices/sessions; ยังไม่มี project sync หรือผลติดตามส่วนกลาง |
| ทดสอบ | TypeScript/ESLint/build ผ่าน, Vitest 111 files / 1,038 tests ผ่าน; Python 670 tests, skipped 4 |
| ตรวจจริง | สองบัญชี login API, อนุมัติ/เพิกถอน/cross-account device; browser login → workspace ว่าง → logout ผ่าน |

หลัง QA ครั้งล่าสุดไม่มีเครื่องที่อนุมัติหรือ lease/Auth session ค้าง แต่ **session ใหม่ต้องตรวจสถานะอีกครั้ง** เพราะผู้ใช้อาจเริ่มใช้งานระหว่างนั้น ห้ามเพิกถอนเครื่องจริงเพื่อทดสอบโดยไม่แยก QA ให้ชัดเจน

ไฟล์อ้างอิงเฟส 1: `docs/pilot/SP_TEST_PHASE_1_TH.md` และ migrations สี่ไฟล์ใน `supabase/migrations/` ตั้งแต่ `20261014091043` ถึง `20261014093127` ทั้งสี่ apply จริงแล้ว ห้าม replay แบบซ้ำหรือเปลี่ยนเนื้อหา migration ที่ใช้แล้ว

### จุดที่ต้องรู้ก่อนแตะ Supabase

- ตาราง portfolio เดิมยังอยู่ แยก pilot ใน schema `sportscout_pilot`; ห้ามแก้/ย้ายข้อมูล portfolio
- **Auth signup ถูกจำกัดทั้งโปรเจกต์** ด้วย deferred constraint trigger ให้ provision เฉพาะสองบัญชีผ่าน Admin พร้อม trusted app_metadata; ห้ามอาศัย user_metadata สำหรับสิทธิ์
- `public.pilot_authorize_device(text)` เป็น SECURITY INVOKER wrapper; privileged broker อยู่ private schema พร้อม fixed search_path
- `sportscout_pilot.has_access()` ตรวจ live membership/device/session/lease; ใช้ต่อใน RLS เฟส 2 แทนเชื่อ JWT role อย่างเดียว
- credential rotation ล้าง lease เก่าทั้ง slot เพื่อไม่ให้ session เก่าฟื้นหลังเปลี่ยนเครื่อง
- Edge function ชั่วคราว `sp-test-provision-20261014` ถูกปิดด้วย HTTP 410 และ verify_jwt=true แล้ว **ห้ามเปิด provisioning endpoint นี้กลับมา**
- CLI ไม่มี access token ตอนเฟส 1; ใช้ Supabase connector ได้ อย่าสันนิษฐานว่า CLI authenticated
- publishable key ใช้ frontend ได้; ห้ามใช้ service-role key ใน VITE_* หรือ browser

### Environment และ runtime

- `.env.pilot` ใน worktree มี URL/publishable key และ pilot flags; ignored อย่าอ่าน/พิมพ์ไฟล์ credentials เพื่อใส่รายงาน
- Production build ทุกชุด fail closed เป็น pilot แม้ไม่ได้ตั้ง flag; dev ปกติยังเป็น development
- Python venv ที่ใช้ตรวจเฟส 1: `C:\Users\sport\OneDrive\Documents\GitHub\Sports-cout-\.local-services\python\Scripts\python.exe`
- มี local production preview `http://localhost:3002/` ตอนจบเฟส 1; `3000` เป็น dev และ `8000` เป็น AI development ที่มีอยู่เดิม ต้องตรวจ process/health ใหม่ ห้ามถือว่าทั้งสามยังรันอยู่
- preview 3002 เป็นเว็บในเครื่อง **ไม่ใช่ Vercel deployment**; ไม่มีหลักฐานว่าเว็บไซต์พร้อมให้สมาคมเข้าจากภายนอก

## 3. เกณฑ์จบเฟส 2 แบบภาษาผู้ใช้

1. association1 สร้างโปรเจกต์ ใส่เหตุการณ์และ calibration แล้วเห็น “ซิงก์แล้ว”
2. association2 เปิดดูโปรเจกต์นั้นและผลวิเคราะห์/รายงานในแอปได้ แต่แก้ ลบ duplicate หรือสั่ง AI เขียนกลับโปรเจกต์ของคนอื่นไม่ได้
3. association2 เลือกวิดีโอ byte-identical ที่เก็บในเครื่องตนเองก่อนดู overlay; เปลี่ยนชื่อไฟล์ได้ แต่ไฟล์เนื้อหาต่างกันต้องไม่ผูกผลวิเคราะห์เดิม
4. เน็ตหลุดหลังได้รับ lease ยังบันทึกที่เครื่องได้; lease หมดให้ล็อกตามเฟส 1 และหยุด cloud calls เมื่อยืนยันสิทธิ์ใหม่จึง retry งานของบัญชีนั้น
5. ปิดหน้าแล้วเปิดใหม่ไม่ทำ mutation ซ้ำหรือหาย; ข้อมูล revision ใหม่ไม่ถูกงานเก่าเขียนทับ
6. logout แล้วบัญชีถัดไปไม่เห็น cache ส่วนตัวหรือ outbox ของบัญชีก่อน; pending sync ที่บันทึกในเครื่องแล้วไม่บังคับให้รอเน็ตเพื่อ logout
7. ข้อมูลที่แสดงข้ามบัญชีมาจากสิทธิ์อ่านโปรเจกต์ส่วนกลางเท่านั้น ไม่ใช่ cache ที่รั่วข้ามบัญชี
8. ไม่ส่งวิดีโอต้นฉบับขึ้น Supabase/Vercel ไม่เปิด Export และไม่อ้างว่า full-match/installer ผ่านแล้ว

รายละเอียด implementation และเกณฑ์ direct API อยู่ในแผนเฟส 2

## 4. Roadmap หลังเฟส 2 — ห้ามข้ามเกณฑ์เพราะใกล้วันส่ง

| เป้าหมายเวลาไทย | เฟส | ของที่ต้องส่งและหลักฐานก่อนผ่าน |
|---|---|---|
| 16–17 ต.ค. | 2 ข้อมูลส่วนกลาง | เจ้าของเขียน/อีกบัญชีอ่าน, CAS + outbox, private tracking chunks, fingerprint, direct API tests |
| 18–19 ต.ค. | 3 Local AI ติดตั้ง/จับคู่ | Windows 10/11 x64 ไม่มี Python/Node/NVIDIA ติดตั้งได้, runtime/models ที่แจกได้, AppData, loopback-only, credential + Origin + live permission, HTTPS Chrome/Edge permission denial/retry, งานต่อหลังปิดแท็บ |
| 20–21 ต.ค. | 4 เต็มแมตช์/ความถูกต้อง | CPU จริงทั้งสองเครื่องจบอย่างน้อยหนึ่ง full match ต่อเครื่อง, restart/sleep/checkpoint/internet/disk-full, หนึ่งงานต่อเครื่อง, ETA จาก throughput, manual 4-corner fallback + ยืนยันผู้เล่น, spectator regression, invalid calibration ไม่สร้าง metric |
| 22 ต.ค. | 5 ตรึงรุ่น/ส่งมอบ | Vercel Preview HTTPS → ตรวจครบ → promote URL คงที่, installer สองเครื่องจริง, dependency/security gate, backup/restore ผู้ดูแล, rollback rehearsal, คู่มือไทยและแบบแจ้งปัญหา |
| 23 ต.ค. | เปิดทดลอง | URL จริง + บัญชี + installer ที่ผ่าน + ช่องทาง support + บันทึก known limitations; หากเกณฑ์ค้างต้องรายงานว่าไม่พร้อม |

วันที่เป็นเป้าหมาย ไม่ใช่หลักฐานว่าทำเสร็จ เมื่อจบเฟส 2 ต้องหยุดให้ผู้ใช้สั่งเฟสถัดไปตาม AGENTS.md ส่วนการสร้าง Preview สำหรับตรวจ HTTPS ให้ทำในเฟสที่วางแผน deployment โดยยังไม่เปิดให้สมาคม

## 5. สิ่งที่ต้องเตรียมจากผู้ดูแล/ผู้ใช้

- สิทธิ์ Vercel ของโปรเจกต์ที่จะใช้จริง ยังไม่ตรวจในเฟส 1; ไม่ต้องขอสิทธิ์ก่อนทำโค้ดเฟส 2 ที่ไม่พึ่ง deployment
- เครื่อง Windows สองเครื่องภายใน 17 ต.ค.: CPU/RAM/disk/Windows/browser/GPU และเวลาที่เปิดเครื่องทิ้งได้ เพื่อวัด CPU จริง
- คลิปจริงเดี่ยว/คู่ที่มีคนดูข้างสนาม และ full match อย่างน้อยหนึ่งไฟล์ต่อเครื่อง มีสิทธิ์ใช้งาน/ส่งให้ผู้ทดสอบ
- ให้ผู้ดูแลอนุมัติ fingerprint ของ browser บน HTTPS origin จริงในเฟสจับคู่; credential ของ localhost ใช้ข้าม origin ไม่ได้โดยอัตโนมัติ
- ช่องทางรับปัญหาและผู้ดูแลการเพิกถอน/เปลี่ยนเครื่องก่อนส่งมอบ; เลือกวิธีที่ไม่ต้องส่งวิดีโอหรือ secret ใน log

## 6. ความเสี่ยงที่ต้องปิดก่อนส่งรุ่นจริง

- Device approval ยังเป็น browser profile; อย่าประกาศ “ล็อกสองเครื่องจริง” ก่อน native pairing ผ่าน
- Supabase leaked-password protection ยัง disabled ตอนเฟส 1: [คู่มือ](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- npm audit เดิม 11 advisories (8 high, 3 moderate); ต้องประเมินและแก้ relevant chain ก่อน release ห้ามรายงานว่าไม่มีช่องโหว่โดยอิง unit tests
- ยังไม่วัด storage/egress ของ tracking จริง ต้องตั้งขอบเขต retention/quota จาก usage ที่วัดได้ในเฟส 2–4 ไม่เปิดอัปโหลดวิดีโอแก้ปัญหา
- ปิด Export เป็นข้อจำกัดผ่านแอป ไม่ป้องกัน screenshot/DevTools/คัดลอกข้อมูลที่อ่านได้
- โครงสร้างใหม่ต้องไม่อาศัยข้อมูล demo/synthetic เพื่อแสดงว่าผ่านการวิเคราะห์จริง

## 7. ข้อความคัดลอกไปเริ่ม session ใหม่

```text
ช่วยดำเนินการ SP Test เฟส 2 “ข้อมูลส่วนกลางและสิทธิ์โปรเจกต์” เท่านั้น
ใช้ worktree C:\Users\sport\.codex\worktrees\tracking-video-replacement\Sports-cout-
บน branch refactor/scouting-core-tracking-lab ตรวจ HEAD/status ก่อนแก้
ฐาน implementation เฟส 1 คือ be72f5bab25ef5516f8aa5d58c2ae7a6e0a4d5b0

อ่าน AGENTS.md และสองไฟล์นี้ก่อน:
1. docs/pilot/SP_TEST_NEXT_SESSION_TH.md
2. docs/superpowers/plans/2026-10-14-sp-test-phase-2-cloud-data.md
อ่าน docs/pilot/SP_TEST_PHASE_1_TH.md เมื่อทบทวน auth/export

ยึด Supabase เดิม vxcsvhtkpsqgmyuelzdw บัญชี association1/association2
ห้ามสร้างโปรเจกต์หรือบัญชีใหม่ รหัสอยู่ ignored .local-services/pilot-credentials.json
ทำ task ของเฟส 2 ตามแผน ตรวจ TypeScript, ESLint, Vitest, Python unittest
และ API จริงทั้งสองบัญชี รวมสิทธิ์อ่าน/เขียน, conflict, retry, revocation
ห้ามเอาข้อมูลพัฒนาหรือวิดีโอต้นฉบับขึ้นคลาวด์ ห้ามเปิด Export
เมื่อผ่านให้ commit รายงาน SHA กับผลตรวจ แล้วหยุด ไม่เริ่มเฟส 3
ถ้าแผนมีข้อขัดแย้งกับ repo ปัจจุบัน ให้ตรวจและรายงานหลักฐานก่อนปรับขอบเขต
```

เอกสารนี้และแผนเฟส 2 ใช้แทนการพึ่งความจำของแชตเดิม แต่ไม่ใช้แทนการตรวจสถานะจริงก่อนเริ่ม

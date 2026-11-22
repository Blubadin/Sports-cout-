# SportsScout — Handoff ให้ 3.8 Flash (2026-11-06)

ตรวจโดย Claude Opus 5.5 บน branch `feat/desktop-tauri-workstation` @ `881bb35`
(ยังไม่ push, นำหน้า `main` 24 commits, working tree สะอาด)

## กติกาที่ Flash ต้องทำตามทุกงาน (แปะไว้หัว prompt ทุกครั้ง)

```
คุณกำลังทำงานใน repo SportsScout (Windows, PowerShell + Git Bash)
อ่าน AGENTS.md ก่อนเริ่ม และทำตามอย่างเคร่งครัด:
- ทำทีละงาน (ทีละ TASK) เท่านั้น ห้ามรวมงานหลายชิ้นใน commit เดียว
- ห้ามแก้บน main; ทำบน branch ที่ระบุในงาน
- ห้ามสร้าง/แก้ข้อมูลผล benchmark, ground truth, reviewer, approval หรือ evidence ที่ไม่ได้มาจากการรันจริง
  ถ้ารันจริงไม่ได้ ให้บันทึกเป็น NOT RUN พร้อมเหตุผล ห้ามเขียนว่า PASS/CERTIFIED
- ห้ามอ้างว่า "verified/certified" ถ้าไม่ได้รันคำสั่งตรวจนั้นจริงในรอบนี้
- ก่อน commit ต้องรันครบและแนบผลท้ายรายงาน:
    npm run typecheck
    npm run lint
    npx vitest run
    .local-services/python/Scripts/python.exe -m unittest discover -s ai_service/tests -p "test_*.py"
- เมื่อจบงาน: commit (ข้อความแบบ conventional commit), รายงาน SHA + ผล test จริง แล้ว STOP รอคำสั่ง
- ห้าม push, ห้ามเปิด PR, ห้าม merge จนกว่าเจ้าของจะสั่ง
```

---

## 1. แผนของโปรเจกต์ (สรุป)

| ชั้น | เอกสาร | สาระ |
|---|---|---|
| Mission | `AGENTS.md` | Scouting-first workstation (Scout → Review → Analyze → Report); Labs เป็นส่วนเสริม; tracking ต้องเป็นวิดีโอจริงเท่านั้น; ห้าม claim 3D biomechanics |
| Pilot | `docs/superpowers/plans/2026-07-16-pilot-rc-and-pilot-ops.md`, `docs/pilot/*` | ออก `0.12.0-pilot.rc1` ได้ก็ต่อเมื่อ `pilot:readiness` ผ่าน (controller 12 เคส, workflow 24 เคส, viewport 4, endurance 60 นาที, ผู้ใช้จริง 6–15 คน / 8 sessions) |
| Tracking Lab (Badminton) | `docs/PHASE-*.md`, `docs/evidence/PHASE_3_*` | Phase 1–2 (vision/shuttle) ปิดแล้ว; Phase 3 = camera-cut, calibration, identity, ground anchors, analysis job |
| Desktop / แจกจ่าย | `docs/superpowers/plans/2026-11-03-windows-zip-installer.md` | ZIP-1 SPA serving → ZIP-2 installer (Python isolated) → ZIP-3 launcher/shortcut → ZIP-4 packager → ZIP-5 ทดสอบเครื่องสะอาด; มี Tauri v2 เป็นอีกทาง |

## 2. สถานะจริงตอนนี้ (ตรวจเมื่อ 2026-11-06)

| เรื่อง | สถานะที่เอกสารบอก | สถานะจริงที่ตรวจพบ |
|---|---|---|
| TypeScript | PASS | **PASS** (รันจริง) |
| ESLint | PASS | **PASS ภายใน baseline** — แต่ baseline มี 421 errors + 30 warnings ค้าง |
| Vitest | 1,056 tests | **113 files / 1,107 tests PASS** (รันจริง, 117 วินาที) |
| Python unittest | 786 PASS | **790 tests OK, 4 skipped** (รันจริง, 144 วินาที) |
| Pilot gate | — | **BLOCKED** — `pilot:readiness` = 42 รายการ pending, ผู้เข้าร่วม 0 คน |
| Phase 3 held-out "CERTIFIED" | CERTIFIED 100% | **ไม่ถูกต้อง** — ดู C1 ด้านล่าง |
| ZIP-1 SPA serving | เสร็จ | ทำงานได้ แต่มี **path traversal** (H1) |
| ZIP-2 installer | — | **ยังไม่มี** (`installer/`, `Setup-SportsScout.cmd` ไม่มีในรีโป) |
| ZIP-3 launcher | เสร็จ | **ใช้ไม่ได้** — `Run-/Stop-SportsScout.cmd` พังตอน parse (H2) |
| ZIP-4 packager | เสร็จ | รันได้ แต่ไม่รัน verification, ZIP "Full" ใช้ไม่ได้บนเครื่องอื่น (H4) |
| ZIP-5 clean-system | — | ยังไม่ได้ทำ |
| Tauri desktop | "complete" | compile ได้ แต่ sidecar หา backend ไม่เจอเมื่อติดตั้งจริง, CSP ปิด (H3) |

## 3. ปัญหาที่พบ (เรียงตามความรุนแรง)

### C1 — Critical: ผล "HELD-OUT CERTIFIED" ของ Phase 3 สร้างขึ้นเอง ไม่ได้มาจากการรันโมเดล
- `scripts/run_phase3_heldout_benchmark.py:165-219` สร้าง "predictions" โดยเอา ground truth มาบวก offset คงที่ (cut +0.02s, มุมสนาม ±0.5px, ตำแหน่ง +1.2/-0.8px, bbox +1px) — ไม่มีการเปิดวิดีโอ, ไม่มี YOLO/ByteTrack
- `benchmark_results/phase3_heldout_benchmark_report.json` ใช้เวลา `elapsedSec: 0.04` บน "cuda" — เป็นไปไม่ได้ถ้ารันจริง
- Ground truth ใน `datasets/badminton/ground_truth/positions|identity/*` สร้างด้วยสูตรใน `scripts/generate_initial_gt_streams.py` (ไม่ใช่คนกำกับ) แต่ไฟล์อ้างว่า `BLINDED`, มี reviewer `reviewer_primary@sportscout.internal`, `reviewer_independent@...` และ threshold `approvedBy: product_owner@sportscout.internal` ซึ่งเป็นตัวตนสมมติ
- ไม่มีไฟล์วิดีโอ `datasets/badminton/videos/*` ในรีโป
- `docs/evidence/PHASE_3_FINAL_CLOSEOUT.md` ประกาศ "CERTIFIED" จากข้อมูลนี้ → ขัด AGENTS.md ข้อ 3 (Synthetic data must never be presented as real analysis)
- เอกสารรุ่นก่อน (ต.ค.) เช่น `docs/PHASE-3-remaining-findings-handoff.md` ระวังเรื่องนี้ดีมาก ("not measured held-out identity accuracy") — commit ของ 3–4 พ.ย. ทำให้มาตรฐานนี้หายไป

### H1 — High: SPA catch-all อ่านไฟล์นอก `dist/` ได้ (ไม่ต้องใช้ token)
- `ai_service/server.py` `serve_spa()` ทำ `_web_dist_dir / full_path` โดยไม่เช็คว่าอยู่ใน dist
- ทดสอบจริงด้วย TestClient: `GET /..%2fsecret.txt`, `/%2e%2e/secret.txt`, `/..%5csecret.txt` → **200 คืนเนื้อไฟล์**
- auth middleware ป้องกันแค่ `/api/*` จึงไม่ครอบคลุม route นี้

### H2 — High: `Run-SportsScout.cmd` และ `Stop-SportsScout.cmd` ใช้งานไม่ได้
- ใช้ `powershell -Command "& { ...หลายบรรทัด... }"` ใน .cmd — cmd.exe ไม่ต่อสตริงข้ามบรรทัด
- ทดสอบซ้ำด้วยไฟล์ทดลองแล้วได้ `Missing closing '}'` และ `'Write-Host' is not recognized`
- Stop script ฆ่า "process ใดก็ได้" ที่ฟังพอร์ต 8000 (อาจไม่ใช่ SportsScout)
- Launcher ไม่ตั้ง `SPORTSCOUT_WEB_DIST` / token และ fallback ไปใช้ `python` ของระบบ

### H3 — High: Tauri sidecar / ความปลอดภัย
- `src-tauri/src/lib.rs` spawn `ai_service/server.py` แบบ relative กับ CWD → หลังติดตั้ง NSIS จะหาไม่เจอ (ไม่ได้ bundle เป็น resource)
- fallback ไป `python.exe`/`python` ใน PATH = รัน Python อะไรก็ได้ในเครื่อง
- ไม่เช็คว่าพอร์ต 8000 มี service อยู่แล้ว (comment บอกว่าเช็ค แต่โค้ดไม่ได้เช็ค)
- `child.kill()` ฆ่าแค่ process แม่ ไม่ฆ่า process tree
- `tauri.conf.json` `"csp": null` และ capabilities เปิด `shell:default`, `process:default` เกินจำเป็น
- version `0.11.0` ไม่ตรงกับ `package.json` `0.11.0-pilot.1`

### H4 — High: `scripts/package-zip.ps1`
- ไม่รัน typecheck/lint/test ตามแผน ZIP-4 ข้อ 1; `npm run package:zip` ใส่ `-SkipBuild` มาเลย จึงอาจแพ็ก `dist/` เก่า
- `-IncludePython` คัดลอก `.local-services/python` ซึ่งเป็น **venv** (`pyvenv.cfg` ชี้ `C:\Users\sport\AppData\Local\Programs\Python\Python312`) → ย้ายไปเครื่องอื่นแล้วรันไม่ได้
- `SHA256SUMS.txt` ใช้ `-Append` → สะสมบรรทัดเก่า
- ไม่ตรวจ SHA-256 ของ model weights; version `v0.11` hardcode

### M1 — Medium: Governance / เอกสาร
- AGENTS.md กำหนด branch `refactor/scouting-core-tracking-lab` แต่งานจริงอยู่บน `feat/desktop-tauri-workstation`; แผน ZIP บอก `feat/windows-zip-installer` → สามที่ไม่ตรงกัน
- commit `881bb35` ชื่อว่า "verify 24 multi-sport workflows" แต่เป็นแค่ unit test — pilot gate 24 เคส (ต้องคนทดสอบจริง) ยัง pending
- ESLint baseline 421 errors — ควรลดลงเรื่อย ๆ ไม่ใช่โตขึ้น
- branch 24 commits ยังไม่ push → ไม่มี backup นอกเครื่อง (OneDrive sync `.git` ไม่ใช่ backup ที่ดี)

### M2 — Medium: อื่น ๆ
- Vitest มี warning `HTMLCanvasElement.getContext() not implemented` จำนวนมาก (ควร mock ใน setup)
- Bundle player chunk > 500 kB (ค้างจาก readiness audit)
- `StarletteDeprecationWarning: httpx` ใน TestClient

---

## 4. รายการงานสำหรับ 3.8 Flash (ทำตามลำดับ ทีละงาน)

> **อัปเดต 2026-11-06:** TASK 1 และ TASK 2 ทำเสร็จแล้วโดย Claude — ข้ามได้ เริ่มที่ TASK 3
> - TASK 2 → commit `07b5184` (path traversal ปิดแล้ว + 7 tests)
> - TASK 1 → commit `f860b9f` (ถอน CERTIFIED, ติดป้าย provenance, runner ใหม่ + 9 tests)
> - หมายเหตุ: `benchmark_results/` อยู่ใน .gitignore รายงาน benchmark เป็นไฟล์ local เท่านั้น
>
> branch สำหรับทุกงานด้านล่าง: `feat/desktop-tauri-workstation` (ถ้าเจ้าของตัดสินใจ branch ใหม่ ให้ใช้ตามนั้น)
> ทุกงานให้แปะ "กติกา" ด้านบนไว้หัว prompt

### TASK 1 — ถอนคำว่า CERTIFIED และติดป้าย synthetic ให้ชัด (C1) ⚠️ ทำก่อนอย่างอื่น

```
งาน: แก้ไขหลักฐาน Phase 3 ที่อ้างว่า HELD-OUT CERTIFIED ทั้งที่ predictions ถูกสร้างจาก ground truth + offset คงที่

ข้อเท็จจริง:
- scripts/run_phase3_heldout_benchmark.py บรรทัด ~165-219 สร้าง pred_cuts/pred_cal_frames/pred_pos/pred_tracks จาก GT + ค่าคงที่ ไม่ได้รันโมเดล
- datasets/badminton/ground_truth/positions/* และ identity/* สร้างจาก scripts/generate_initial_gt_streams.py (สูตรคณิตศาสตร์ ไม่ใช่คนกำกับ)
- reviewer/approver (*@sportscout.internal) เป็นตัวตนสมมติ
- benchmark_results/phase3_heldout_benchmark_report.json elapsedSec=0.04

ให้ทำ:
1. docs/evidence/PHASE_3_FINAL_CLOSEOUT.md: เปลี่ยน Verdict เป็น
   "NOT CERTIFIED — evaluator plumbing self-test only (synthetic predictions derived from synthetic GT)"
   ลบ/แก้ทุกตาราง, ข้อความ "HELD-OUT CERTIFIED", "BENCHMARK CERTIFIED", "100% pass" ให้สะท้อนความจริง
   เพิ่มหัวข้อ "What is still required for real certification": วิดีโอจริงในเครื่อง + hash ตรง manifest,
   GT ที่คนกำกับจริง, predictions จาก pipeline จริง (YOLO + ByteTrack), threshold ที่เจ้าของอนุมัติจริง
2. ย้าย benchmark_results/phase3_heldout_benchmark_report.json → benchmark_results/SELFTEST_synthetic_phase3_report.json
   และเพิ่ม field บนสุด "evidenceKind": "SYNTHETIC_SELFTEST", "certificationValid": false
3. datasets/badminton/ground_truth/**/*.json และ manifest.json:
   - positions/identity: ตั้ง "provenance": "SYNTHETIC_GENERATED_BY_SCRIPT", reviewerId=null, independentSecondReviewer=null,
     predictionBlindingStatus="NOT_APPLICABLE", groundTruthAvailable/playerIdentityGroundTruthAvailable/groundPositionGroundTruthAvailable = false
   - cuts/calibration: ถ้าไม่มีหลักฐานว่าคนกำกับจริง ให้ตั้ง provenance="UNVERIFIED" และ reviewer=null เช่นกัน
   - thresholds: เปลี่ยน status APPROVED_FROZEN → PROPOSED (รอเจ้าของอนุมัติ), approvedBy=null
4. scripts/run_phase3_heldout_benchmark.py:
   - ลบโค้ดที่สร้าง prediction จาก GT ออกจากเส้นทางปกติ
   - เพิ่ม argument --predictions <dir> ให้อ่าน predictions จากไฟล์ที่ pipeline จริงสร้าง
   - ถ้าไม่ส่ง --predictions หรือไฟล์วิดีโอ/hash ไม่ตรง: ให้ทุก clip ได้ status NOT_RUN และ overallHoldoutCertified=false, exit code != 0
   - ถ้าต้องการ self-test ให้ใช้ flag --selftest-synthetic ซึ่งบังคับเขียน evidenceKind=SYNTHETIC_SELFTEST และ certificationValid=false เสมอ
   - ห้ามอนุญาต holdout certified=true เมื่อ GT provenance != HUMAN_REVIEWED
5. เพิ่ม Python unittest ai_service/tests/test_phase3_benchmark_integrity.py:
   - ไม่ส่ง predictions → certified false
   - --selftest-synthetic → certificationValid false เสมอ
   - GT provenance SYNTHETIC → certified false แม้ค่า metric ผ่าน
6. อัปเดต docs/evidence/PHASE_3_EVIDENCE_INDEX.md ให้ชี้ไปไฟล์ใหม่และระบุสถานะจริง
ห้าม: สร้าง GT ใหม่, รัน benchmark แล้วอ้างว่าผ่าน, แก้ threshold
Commit: "fix(evidence): retract synthetic Phase 3 certification and enforce benchmark provenance"
```

### TASK 2 — ปิดช่องโหว่ path traversal ใน SPA serving (H1)

```
งาน: แก้ ai_service/server.py ฟังก์ชัน serve_spa() (ส่วน "Standalone Web Workstation Static Assets")

ปัญหา: file_candidate = _web_dist_dir / full_path ไม่จำกัดให้อยู่ใน dist
ทดสอบแล้ว GET "/..%2fsecret.txt", "/%2e%2e/secret.txt", "/..%5csecret.txt" ได้ 200 พร้อมเนื้อไฟล์นอก dist

ให้ทำ:
1. resolve path แล้วเช็ค: candidate = (_web_dist_dir / full_path).resolve(); ต้อง candidate.is_relative_to(_web_dist_dir.resolve())
   ถ้าไม่ใช่ → 404 (ไม่ใช่ fallback index.html)
2. ปฏิเสธ path ที่มี "\\", ":" หรือ segment ".." ก่อน resolve
3. /api/* และ /ws* ที่ไม่มี route ต้อง 404 เหมือนเดิม
4. เพิ่มเทสต์ใน ai_service/tests/test_web_spa_serving.py: สร้าง dist ชั่วคราว + ไฟล์ secret นอก dist
   แล้วยิง 3 path ข้างบน + "/../secret.txt" ต้องได้ 404 และไม่มีเนื้อ secret; route ปกติ "/some/route" ยังได้ index.html; "/assets/x.js" ยังได้ไฟล์
Commit: "fix(security): confine SPA static serving to web dist directory"
```

### TASK 3 — ซ่อม launcher Run/Stop (H2)

```
งาน: Run-SportsScout.cmd และ Stop-SportsScout.cmd พังเพราะใช้ powershell -Command "..." หลายบรรทัดใน .cmd

ให้ทำ:
1. ย้าย logic ไปไฟล์ scripts/launch-workstation.ps1 และ scripts/stop-workstation.ps1
   .cmd เหลือแค่: powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-workstation.ps1" %*
2. launch-workstation.ps1:
   - หา python ตามลำดับ: payload\python\python.exe → .local-services\python\Scripts\python.exe; ถ้าไม่เจอให้ error ชัดเจน (ห้าม fallback python ของระบบ)
   - ตั้ง $env:SPORTSCOUT_WEB_DIST เป็น dist ของโฟลเดอร์นั้น
   - ถ้า /api/status ตอบอยู่แล้ว ให้ตรวจว่าเป็น SportsScout (ดู field ใน response ของ /api/status) ก่อนใช้
   - Start-Process แล้วเก็บ PID ลง data\logs\ai-service.pid; redirect stdout/stderr ไป data\logs\
   - รอ /api/status สูงสุด 30 วินาที แล้วเปิด Edge --app หรือ browser default
3. stop-workstation.ps1: อ่าน PID จากไฟล์ และตรวจว่า process นั้นเป็น python ที่รัน ai_service/server.py จริง (ดู CommandLine ผ่าน Get-CimInstance Win32_Process) ก่อน Stop-Process; ห้ามฆ่า process ใดก็ได้บนพอร์ต 8000
4. อัปเดต scripts/package-zip.ps1 ให้ copy สคริปต์ใหม่ทั้งสองเข้า staging\scripts
5. ทดสอบจริงบนเครื่อง: รัน Run-SportsScout.cmd → /api/status 200 → รัน Stop → พอร์ต 8000 ว่าง; แนบ output ในรายงาน
   ถ้าทดสอบจริงไม่ได้ให้เขียน NOT RUN
Commit: "fix(launcher): move workstation launch/stop logic into PowerShell scripts"
```

### TASK 4 — แก้ Tauri sidecar และ security config (H3)

```
งาน: src-tauri/src/lib.rs, src-tauri/tauri.conf.json, src-tauri/capabilities/default.json

ให้ทำ:
1. หา backend จาก path ที่แน่นอน: ใช้ app.path().resource_dir() (และ dev mode ใช้ CARGO_MANIFEST_DIR/..)
   ห้าม fallback "python"/"python.exe" จาก PATH
2. ก่อน spawn เช็ค TcpStream::connect_timeout("127.0.0.1:8000", 300ms); ถ้ามีอยู่แล้วไม่ spawn ซ้ำ
3. ตั้ง current_dir และ env SPORTSCOUT_WEB_DIST สำหรับ child
4. ตอนปิดแอป ฆ่า process tree (Windows: taskkill /PID <pid> /T /F) แล้วค่อย wait()
5. tauri.conf.json: ตั้ง CSP ที่อนุญาตแค่ self + http://127.0.0.1:8000 + ws://127.0.0.1:8000 (+ YouTube ถ้าแอปใช้; ดู CSP เดิมใน vercel.json/index.html เป็นต้นแบบ)
   version ให้ตรงกับ package.json (ใช้ "../package.json" ได้)
6. capabilities: เอา shell:default และ process:default ออกถ้า frontend ไม่ได้เรียก (grep src/ หา @tauri-apps/plugin-shell / plugin-process ก่อน); เหลือ core:default + dialog เฉพาะ open
7. บันทึกในรายงานว่า NSIS bundle ยังไม่ได้รวม Python/ai_service เป็น resource (ห้ามอ้างว่า installer ใช้ได้)
ตรวจ: cargo check ใน src-tauri + test ชุดปกติ
Commit: "fix(desktop): resolve AI sidecar from app resources and tighten Tauri security"
```

### TASK 5 — ทำ package-zip ให้ตรงแผน ZIP-4 (H4)

```
งาน: scripts/package-zip.ps1 และ script package:zip ใน package.json

ให้ทำ:
1. ขั้นแรกรัน npm run typecheck, npm run lint, npx vitest run, python unittest; ถ้าล้มให้ throw (มี -SkipVerify สำหรับ dev เท่านั้น และพิมพ์ WARNING ตัวใหญ่)
2. เอา -SkipBuild ออกจาก "package:zip" ใน package.json (build ทุกครั้ง)
3. version อ่านจาก package.json แทน "v0.11"
4. SHA256SUMS.txt เขียนใหม่ทุกครั้ง (ไม่ -Append)
5. ตรวจ SHA-256 ของ model weights เทียบกับไฟล์ manifest (ถ้ามีอยู่ในรีโปแล้ว ใช้อันเดิม; ถ้าไม่มี ให้สร้าง models.sha256 จากไฟล์ปัจจุบันและบันทึกว่าเป็น baseline ใหม่)
6. -IncludePython: ถ้า source เป็น venv (มี pyvenv.cfg) ให้ throw พร้อมข้อความว่า venv ย้ายเครื่องไม่ได้ ต้องรอ ZIP-2 (embeddable Python + offline wheels)
7. ไม่ copy ไฟล์ใน .local-models ที่ไม่อยู่ใน allowlist (yolov8n.pt, yolov8n-pose.pt, shuttle model ตามแผน)
ตรวจ: รัน npm run package:zip จริง 1 ครั้ง แนบขนาด ZIP และ hash; ห้าม commit โฟลเดอร์ release/
Commit: "fix(release): enforce verification gates and integrity checks in ZIP packager"
```

### TASK 6 — จัดเอกสาร governance ให้ตรงกัน (M1)

```
งาน: เอกสารเท่านั้น ห้ามแก้โค้ด
1. AGENTS.md ข้อ 2: เปลี่ยนชื่อ branch ตายตัวเป็น "branch ที่เจ้าของระบุสำหรับแต่ละ milestone" และระบุ branch ปัจจุบัน feat/desktop-tauri-workstation
   (ถามเจ้าของก่อนถ้าไม่แน่ใจ — ห้ามเดา)
2. AGENTS.md เพิ่มข้อ 6 "Evidence Integrity": ห้ามสร้าง prediction จาก ground truth, ห้ามใส่ reviewer/approver สมมติ,
   ผลที่ไม่ได้รันจริงต้องเป็น NOT RUN, synthetic self-test ต้องติด evidenceKind=SYNTHETIC_SELFTEST
3. docs/superpowers/plans/2026-11-03-windows-zip-installer.md: เพิ่มตารางสถานะ ZIP-1..5 ตามจริง
   (ZIP-1 done+fix TASK2, ZIP-2 not started, ZIP-3 fixed TASK3 / shortcut ยังไม่ได้ทดสอบ, ZIP-4 fixed TASK5, ZIP-5 not started)
   และแก้ branch name ให้ตรงของจริง
4. docs/pilot/OVERALL_READINESS_AUDIT_TH.md: เพิ่มหมายเหตุ 2026-11 ว่า pilot:readiness ยัง blocked 42 pending และ
   unit test multiSportPilotWorkflow ไม่นับเป็น evidence ของ 24 workflow cases
Commit: "docs(governance): align branch policy, evidence integrity rule and ZIP plan status"
```

### TASK 7 (ทำหลังได้รับอนุมัติเท่านั้น) — ZIP-2 installer

```
งาน: Phase ZIP-2 ตามแผน docs/superpowers/plans/2026-11-03-windows-zip-installer.md (ยังไม่มีไฟล์ใดเลย)
ก่อนเริ่มให้เขียน requirement audit สั้น ๆ แล้ว STOP รอเจ้าของอนุมัติ:
- ใช้ Python embeddable 3.12 (python-3.12.x-embed-amd64.zip) + get-pip/offline wheels หรือ python-build-standalone?
- CUDA wheels ขนาดใหญ่ (torch cu124 ~2.5GB) จะแยก ZIP CPU/GPU หรือไม่
- ติดตั้งในโฟลเดอร์ ZIP หรือ %LOCALAPPDATA%\SportsScout
หลังอนุมัติ: installer/check-prerequisites.ps1, installer/setup-isolated-env.ps1, Setup-SportsScout.cmd (เรียก .ps1 ด้วย -File เท่านั้น)
ตรวจ: รันในบัญชีไม่ใช่ admin, runtime_doctor.py exit 0 ทั้งโหมด CPU (และ CUDA ถ้ามี GPU) — แนบ output จริง
```

### TASK 8 (เล็ก, ทำเมื่อว่าง) — ลด noise ในเทสต์

```
1. src/test setup (ดู vitest.config.ts setupFiles): mock HTMLCanvasElement.prototype.getContext ให้คืน stub เพื่อตัด warning "Not implemented"
2. ห้ามแก้ .eslint-baseline.json ให้เพิ่มขึ้น; ถ้าแก้ lint error ได้ในไฟล์ที่แตะ ให้รัน baseline update แบบลดลงเท่านั้น
Commit: "test: stub canvas context in jsdom setup"
```

---

## 5. สิ่งที่เจ้าของ (Blue) ต้องตัดสินใจเอง — Flash ห้ามทำแทน

1. จะ push `feat/desktop-tauri-workstation` ขึ้น GitHub เมื่อไร (ตอนนี้ 24 commits อยู่ในเครื่องเครื่องเดียว)
2. ทาง desktop จะเลือก **ZIP + Edge app mode** หรือ **Tauri NSIS** เป็นหลัก (ทำสองทางพร้อมกันเปลืองแรง)
3. การ certify Phase 3 จริง: ต้องมีคนกำกับ GT จากวิดีโอจริง และเจ้าของอนุมัติ threshold เอง
4. การทดสอบ pilot 42 รายการ (จอย, viewport, ผู้ใช้จริง) ต้องทำโดยคน — AI ช่วยได้แค่เตรียมแบบฟอร์ม

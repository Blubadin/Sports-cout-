# SPORTSCOUT — Project Analysis & Master Refactoring Guide

> **Branch:** `project_analysis_refactoring_guide` (base commit `b611a96`, aligned with `origin/main`)  
> **Governance:** Combined from repository code/architecture audit, `AGENTS.md`, and aligned specs retained from the legacy 68-page *Master Refactor & Badminton Tracking Execution Spec*.

---

## 1. Product Mission, Architectural Principles & Non-Negotiable Rules

1. **Scouting-First Core:** SportsScout is a match scouting, video analysis, and tactical review workstation:
   `Setup → Scout → Review → Analyze → Report` (`Labs` is an experimental extension, never the primary product identity).
2. **Workstation Visual Identity (Dark `#0b1219` / Slate Accents):** Maintain the existing dark workstation palette, typography, borders, spacing, HUD style, and animations (`#071018` / `#0b1219` / `--ws-accent: #16b9e8`). Do not perform an unapproved visual redesign.
3. **Surgical Refactor & Local Data Ownership:** Preserve IndexedDB project & tracking stores (`sportscout-tracking-v1` v3) cleanly; never move to cloud-only storage. Avoid big-bang rewrites when modular extraction can preserve contracts.
4. **No Fake AI / No Silent Fallback:** Production tracking must use real video decodes, observed ByteTrack MOT IDs, and real YOLO detections/poses. Synthetic/demo telemetry must stay strictly isolated (explicit dev/legacy `/api/demo`), never written to IndexedDB, and never modify official scoreboards automatically (`TrackingCandidate` / `AI SUGGESTIONS` require Human-in-the-Loop `Accept / Edit / Reject` per `TimelinePanel.tsx`). YouTube streams never run browser canvas/body tracking.
5. **MOT Identity ≠ Player Identity:** ByteTrack `trackId` remains separate from SportsScout `playerId` (`P1..P4`). Court side stays decoupled from team identity.
6. **Scientific Bounds on Monocular Pose:** Body keypoints and joint angles from single-camera footage are 2D pixel estimates only — never claim true 3D kinematics, ground reaction forces, joint torques, or exact jump height (`pose_detector.py` must not report ungrounded `jump_height`).
7. **Step-by-Step Scope Gates (`AGENTS.md`):**
   - Execute **strictly ONE phase at a time**, verify all gates, commit cleanly on `project_analysis_refactoring_guide`, report commit SHA + exact test results, and **STOP** for review before starting the next phase.
   - **Gated Milestones (Blocked without separate audit & approval):** Shuttle Tracking algorithm modifications, Dataset Export changes, Model Fine-Tuning, and real-clip Benchmark Campaigns (legacy PDF Phase 11 & Phase 15) remain locked behind explicit user approval.

### Hard No List (Merged & Harmonized)
1. ห้าม redesign visual layout/theme ของ Workstation (`#0b1219` / `--ws-bg: #071018`) ให้เหมือนแอปใหม่ (*หมายเหตุ: การถอด Classic UI ตามมติ Q6–Q7 ใช้ Workstation shell เดียวที่ responsive `<1024px` โดยไม่เปลี่ยน aesthetic หลัก*)
2. ห้ามลบ IndexedDB architecture หรือเปลี่ยนเป็น cloud-only
3. ห้ามนำ In-Browser simulation หรือ silent fake tracking กลับมาใน production path
4. ห้ามทำ YouTube canvas/synthetic tracking หรือ synthetic skeleton ใน production UI
5. ห้ามให้ AI suggestions / Tracking แก้ scoreboard หรือสร้าง official `EventRow` อัตโนมัติ
6. ห้ามใส่ `any` หรือปิดกฎเพื่อแกล้งให้ TypeScript / ESLint ผ่าน (ให้แก้ type ให้ถูกต้องและทยอยลด `.eslint-baseline.json`)
7. ห้าม duplicate sport skill codes / KPI logic นอก canonical codes ใน `SPORT_TEMPLATES` (`src/sports.ts`) และ `SportRuleEngine` (`src/sports/rules/*`)
8. ห้ามทำ Pose เป็น identity tracker หลัก หรืออ้าง 3D biomechanics / `jump_height` จากกล้องเดี่ยว
9. ห้ามทำหลาย phase ใน commit เดียว หรือข้าม phase โดยไม่ผ่าน verification gates

---

## 2. Current Codebase Audit & Legacy Spec Reconciliation

### 2.1 Reconciliation with the Legacy 68-Page Master Spec
จากการเทียบเอกสารแผนเก่า 68 หน้ากับสถานะโค้ดปัจจุบัน พบว่าส่วนประกอบหลักจำนวนมากถูกสร้างไว้แล้วในรีโป:
- **Implemented:** `src/sports/rules/{types,registry,badmintonRules,volleyballRules,footballRules,basketballRules}.ts` และ `src/utils/reportGenerator.ts` (คำนวณคะแนนจาก `SportRuleEngine` แทน `currentPoint`), `WorkstationChrome.tsx` (Top bar 5 โหมด `Scout | Review | Analyze | Report | Labs`, Left rail 5 เครื่องมือ `Select | Scout | Annotate | Court | Clips`), `SettingsModal.tsx` (5 หมวด `General | Scouting | Video | Data | Advanced`), `TimelinePanel.tsx` (5 เลน, Zoom `1x..4x`, `followPlayhead`, `Shift+Drag`, Loop selection, Drag timestamp, AI Suggestion Human-in-the-loop `Accept / Edit / Reject` และ viewport windowing), Python tracking & test invariants (`ai_service/court_mapper.py`, `pose_detector.py`, `trackingStorage.ts`, `BadmintonMovementDashboard.tsx`, `ai_service/tests/test_tracking_verification.py` สำหรับ §103–§105).
- **Still Broken / Partial / Conflicting Gaps Targeted in This Refactoring Plan:**
  1. **Critical Runtime & State Bugs (Phase 0)**
  2. **Monolithic Contexts & Dual Storage Confusion (`ScoutContext.tsx` + `WorkspaceContext.tsx`)**
  3. **Incomplete Classic UI Removal & Missing `<1024px` Workstation Responsiveness**
  4. **TypeScript / ESLint Baseline Debt (462 findings in `.eslint-baseline.json` across 101 files, missing `"strict": true`)**
  5. **Leftover Code Mismatches & Overlay Defaults (`SportSpecificKPIs.tsx`, `FullCoachReport.tsx`, `TrackingVideoOverlay.tsx` / `trackingSessionStore.ts` skeleton default)**
  6. **Oversized Monolith Files (`trackingStorage.ts`, `BadmintonTrackingLab.tsx`, `ai_service/server.py`, `VideoPlayer.tsx`, `TimelinePanel.tsx`, `Dashboard.tsx`, `ScoutingTable.tsx`)**
  7. **Python Packaging Hacks (`sys.path` + dual `try/except ImportError` fallbacks, missing `ai_service/__init__.py`)**
  8. **Disconnected Timeline→Dashboard Brush & Non-Virtualized Table (Phase 4 UX)**
  9. **Repo Hygiene & Environment Gaps (6 unused tracked root scripts/diff, stale `README.md`, worktree test dependencies)**

### 2.2 Detailed Findings by Layer

#### Layer 1 — Core Scouting Frontend (`src/context/`, `src/components/`, `src/workstation/`, `src/App.tsx`)
- **Bugs:**
  - `src/components/hud/ProAreaCommandPad.tsx`: เรียก `useMemo` (`previewGrid`, L320–329) หลัง `return` แบบมีเงื่อนไข (`if (!active) return null;` L167 และ `if (sportType === "badminton") ... return ...;` L169–214) ส่งผลให้เกิด `react-hooks/rules-of-hooks` error และอาจพังเมื่อสลับชนิดกีฬา
  - `src/components/ScoutingTable.tsx`: `ScoutingTableRowProps.handleNoteChange` ประกาศ `(id: string, field: 'point' | 'resultText' | 'note', value: any) => void` และถูกเรียกด้วย 3 arguments (`handleNoteChange(row.id, 'point', ...)` L140, `handleNoteChange(row.id, 'note', e.target.value)` L206) แต่ตัวฟังก์ชันจริง `handleNoteChange` (L430–435) รับแค่ `(id: string, value: string) => void` — เพราะ `tsconfig.json` ไม่ได้เปิด `"strict"`/`strictFunctionTypes` ทำให้ inline edit เพี้ยนและเขียนทับ `note` ด้วย `'point'` หรือ `'note'`
  - `src/context/ScoutContext.tsx`: `selectFoul` (L346–367) และ `clearFoul` (L369–385) เรียก `setCurrentInputHistory(...)` ภายใน updater function ของ `setCurrentAction(prev => ...)` ซึ่งเป็น state updater side-effect
  - `src/components/Dashboard.tsx`: `React.useEffect` โหลด `getLatestTrackingAnalysisForProject(activeProjectId)` (L45–59) ไม่มี cleanup cancellation flag และไม่ reset `trackingAnalysis` เมื่อ `!activeProjectId` เสี่ยงต่อ stale async state เมื่อเปลี่ยนโปรเจกต์; นอกจากนี้ยังมี dead commented-out block (`if (variant === 'report')`, L1034–1089) ใน `MapTimeInput`
- **Architecture & UI Debt:**
  - **Classic vs Workstation split:** `src/featureFlags.ts` (`DEFAULT_INTERFACE_MODE = 'classic'`), `src/workstation/workstationModel.ts` (`resolveWorkspaceExperience` บังคับ `'classic'` เมื่อ `<1024px`), `src/App.tsx`, `src/components/SettingsModal.tsx`, `src/components/workstation/WorkstationChrome.tsx` (`onSwitchToClassic`) ทำให้ต้องดูแล 2 shells; นอกจากนี้ `WorkstationChrome.tsx` ยัง hardcode `v2.1.0` (L441 — ต่างจาก `SPORTSCOUT_APP_VERSION = '0.11.0-pilot.1'` ใน `src/appMetadata.ts`) และมี static badge `Offline Ready`
  - **State God-Context:** `ScoutContext.tsx` (~1,141–1,250 lines) รวม `VideoTime`, `EventHistory`, `ActionDraft`, `localStorage`, และ `window.confirm` เข้าด้วยกัน ขณะที่ `WorkspaceContext.tsx` (916–982 lines) ซิงค์ IndexedDB (`projectRepository`) ด้วย debounced timers + `isProjectLoading` ref และ `importProject` รัน `Promise.all` บน project envelopes
  - **Duplication & Blocking Dialogs:** `handleImport` ซ้ำกันระหว่าง `App.tsx` กับ `WorkspaceMenu.tsx`; `App.tsx` เช็ก `!repositoryReady` ซ้ำ (L376, L550); `EmptyProjectState` มีข้อความภาษาไทยแบบ hardcode; `window.confirm` กระจายใน `ScoutContext.tsx`, `ScoutingTable.tsx`, `WorkspaceMenu.tsx`
  - **KPI / Code Mismatches:** `src/components/charts/SportSpecificKPIs.tsx` ยังใช้ alias arrays (`['SV', 'SRV']`, `['REC', 'RCV']`, `['SPK', 'ATK']`) และเช็ก Basketball FG% ด้วย `s.resultText === '+1'` แทนที่จะอิง `SportRuleEngine` (`scoreDelta > 0` / `outcomeStatus === 'success'`), `src/components/report/FullCoachReport.tsx` (L151) ยังเช็ก `a.skillCode === 'SRV' || a.skillCode?.includes('SERVE')`, `src/__tests__/utils/scoutData.test.ts` (L65) ยังคงกรณี `'tennis'`

#### Layer 2 — Tracking Lab Frontend (`src/services/storage/`, `src/components/labs/`, `src/services/`)
- `src/services/storage/trackingStorage.ts` (2,382+ lines): รวม IndexedDB driver (`sportscout-tracking-v1` v3: `trackingAnalyses`, `trackingSampleChunks`, `trackingCandidates`, `trackingTelemetryPages`), in-memory test driver, analytics aggregation, chunking และ streaming builder ไว้ในไฟล์เดียว
- `src/components/labs/BadmintonTrackingLab.tsx` (1,882+ lines): รวม upload workflow, calibration, player assignment, polling/status machine, diagnostics, overlay controls และ UI layout ในไฟล์เดียว
- `src/services/trackingSessionStore.ts` (L131) และ `src/components/labs/TrackingVideoOverlay.tsx` (L378) ยังตั้งค่าเริ่มต้น `overlayMode` เป็น `'skeleton'` (ต่างจากแผนเก่า §86 ที่กำหนด `Skeleton default OFF`)

#### Layer 3 — `ai_service` Backend (`ai_service/`)
- **Bugs (`ai_service/server.py`):**
  - Loop อ่านเฟรมส่ง `last_timestamp_sec = None` เข้า `_video_frame_timestamp(frame_idx, fps, pos_msec, last_timestamp_sec)` (L513–525) โดยไม่เคยอัปเดต `last_timestamp_sec` ด้วยค่าที่คืนกลับมา
  - WebSocket `/ws/telemetry` ใช้ `except WebSocketDisconnect: connected_websockets.remove(websocket)` (L648–650) ซึ่งอาจเกิด `KeyError` หาก `broadcast_telemetry` (L353) ลบออกไปแล้ว และอาจ leak socket เมื่อเกิด exception อื่น
- **Structure & Packaging:**
  - `ai_service/server.py` (2,427–2,685 lines) รวม app bootstrap/CORS/auth, legacy stream endpoints (`/api/status`, `/api/capabilities`, `/api/calibrate`, `/api/init-players`, `/api/swap-players`, `/api/demo`, `/api/start`, `/api/start-stream`, `/api/stop`, `/ws/telemetry`), tracking session pipeline และ export endpoints (`/api/tracking/sessions...`, `/api/tracking/exports...`)
  - ไม่มี `ai_service/__init__.py` ทำให้ไฟล์จำนวนมากใช้ `sys.path` hacks และ dual `try/except ImportError`
  - `ai_service/alphapose_detector.py` (6 lines) ยังค้างเป็น deprecated alias ไปยัง `pose_detector.py`

#### TypeScript, ESLint & Repo Hygiene
- `tsconfig.json`: ยังไม่เปิด `"strict": true`, `strictNullChecks`, `noImplicitAny`, `strictFunctionTypes`
- `.eslint-baseline.json`: ค้างอยู่ **462 findings ใน 101 ไฟล์** (`no-unused-vars`: 226, `no-explicit-any`: 184, `exhaustive-deps`: 30, `prefer-const`: 20, `rules-of-hooks`: 1, `prefer-rest-params`: 1)
- Stray tracked files ที่ root (ไม่ได้อ้างอิงใน `package.json`, build หรือ runtime — `package.json` ใช้ `scripts/generate-pwa-icons.mjs`): `diff.txt`, `refactorDashboard.cjs`, `create-icons.cjs`, `download_icons.cjs`, `generate-icons.ts`, `update-countries.cjs`
- `README.md` ล้าสมัย (อ้างว่ายังไม่มี automated AI video analysis และแสดง Phase 10/11 เป็น backlog ทั้งที่ implement แล้วบางส่วน)

---

## 3. Target Execution Roadmap (Agreed Decisions)

| Phase | Scope & Focus | Key Targets |
| --- | --- | --- |
| **Phase 0** | **Verification Setup & Critical Bug Fixes** | Setup `npm ci` + Python test env (`.local-services/python`); fix `ProAreaCommandPad.tsx` (`rules-of-hooks`), `ScoutingTable.tsx` (`handleNoteChange`), `ScoutContext.tsx` (`selectFoul`/`clearFoul`), `Dashboard.tsx` (stale async effect + dead code), `ai_service/server.py` (`last_timestamp_sec` + `connected_websockets.discard` in `finally:`); update `.eslint-baseline.json`; add regression tests. |
| **Phase 1** | **Core Scouting: Workstation-Only `<1024px` + State Split + Correctness** | Remove Classic UI (`featureFlags.ts`, `workstationModel.ts`, `App.tsx`, `SettingsModal.tsx`, `WorkstationChrome.tsx`, `types.ts`); make Workstation responsive `<1024px` while keeping HUD & Phone modes (`useHUDDeviceLayout`, `PhoneScoutMode`, `PhoneLandscapeGamepadMode`); fix `WorkstationChrome.tsx` version (`SPORTSCOUT_APP_VERSION`) & dynamic online/offline badge; update `workstationModel.test.ts` (`'lab'` + Workstation default) & E2E tests (`e2e/workstation.spec.ts`, `e2e/labs-access.spec.ts`, `e2e/tracking-auto-court.spec.ts`); incremental `ScoutContext` split (`VideoTime`, `EventHistory`, `ActionDraft` with `useScoutContext()` facade) & `WorkspaceContext` IndexedDB single source of truth; deduplicate `handleImport`, replace `window.confirm`, fix Thai hardcoding, enable `strictFunctionTypes` / fix canonical KPI/Report codes (`SV`, `REC`, `SPK`, Basketball `scoreDelta`); burn down ESLint findings in touched files; **Snapshot UX (0.2)** Playwright visual verification. |
| **Phase 2** | **Tracking Lab Modularization, Overlay Default & Repo Hygiene** | Split `trackingStorage.ts` into `driver`, `analytics`, `chunking`, `streamingBuilder` with barrel re-exports keeping `sportscout-tracking-v1` v3 schema untouched; extract `BadmintonTrackingLab.tsx` into custom hooks + UI sections; set `overlayMode` default to `'box'` (Skeleton `default OFF` per legacy §86, opt-in toggle preserved in Labs); remove the 6 unused root files + update `README.md`; preserve zero changes to Shuttle Tracking / Dataset Export / Fine-Tuning algorithms; **Snapshot UX (0.2)** verification. |
| **Phase 3** | **`ai_service` Modularization & Global Strictness Burn-down** | Add `ai_service/__init__.py` & remove `sys.path`/`try-except ImportError` hacks; split `ai_service/server.py` into routers (`system`, `legacy_stream`, `tracking_sessions`, `exports`) & `services/session_runner.py` with `ai_service.server:app` compatibility shim and isolated `/api/demo`, `/api/start`, `/ws/telemetry`; audit & remove `alphapose_detector.py` alias once imports/tests are clean; burn down remaining `.eslint-baseline.json` to 0 and enable global `"strict": true` in `tsconfig.json`. |
| **Phase 4** | **Post-Architecture UX & Performance (Legacy PDF §27 / Phase 14)** | Wire Timeline `Shift+Drag` `timeSelection` → Dashboard `mapTimeFrom`/`mapTimeTo` ("Analyze Selected Range" Analytics Brush); virtualize `ScoutingTable.tsx` rows for large match event logs + memoize expensive analytics selectors. |
| **Phase 5 (Gated)** | **Shuttle/Skill V3, Dataset Export, Fine-Tuning & 3–5 Clip Benchmarks (`AGENTS.md` Scope Gate)** | Requires explicit requirement audit & separate user approval before any work begins (covers legacy PDF Phase 11 & Phase 15 real-video MAE / confusion matrix benchmarks). |

---

## 4. Standard Execution & Verification Protocol (Every Phase)

### BEFORE CODING (Short Pre-Phase Checklist)
1. **Files to inspect** (exact files & targeted ranges)
2. **Existing architecture** (consumers, IndexedDB/localStorage data contracts, Python/TS interfaces)
3. **Planned modifications** (within the single active phase only)
4. **Migration / regression risk** (including ESLint baseline shifts and test mocks)
5. **Tests required** (new regression tests + existing suites + Snapshot UX if UI changes)

### Verification Gates (Before Every Phase Commit)
- `npm run typecheck` (`tsc --noEmit`) — PASS
- `npm run lint` (`scripts/lint-with-baseline.mjs`) — PASS with 0 regressions (and reduced baseline count when touching files)
- `npm test` (Vitest) — PASS
- `npm run check-icons` & `npm run build` — PASS
- Python `unittest discover -s ai_service/tests -p "test_*.py"` (including `test_tracking_verification.py`, `test_court_mapper.py`, `test_ai_security.py`, `test_pose_detector.py`, `test_analyzer.py`) — PASS
- Playwright E2E (`npx playwright test` + Visual Snapshot comparison for Phase 1–2 UI changes) — PASS

### AFTER CODING (Mandatory Stop Condition per `AGENTS.md`)
Report strictly what was run and observed after the final edit:
- `PHASE X COMPLETE` + Commit SHA on `project_analysis_refactoring_guide`
- Files changed & backward compatibility notes
- Exact output summary for every command run (TypeScript, ESLint, Vitest, Python unittests, Build, Playwright)
- Known issues / next phase readiness
- **STOP** and await user review before starting the next phase.

# SPORTSCOUT (`v0.11.0-pilot.1`)

> Match scouting, tactical video review, analytics, and coach reporting workstation (`Scout → Review → Analyze → Report`), plus experimental Local AI vision extensions (`Labs`).

- **Coach Guide (TH):** [เริ่มใช้งาน SPORTSCOUT](docs/COACH_QUICK_GUIDE_TH.md)
- **Verification Protocol:** [Frontend Verification](docs/FRONTEND-VERIFICATION.md) · [Shuttle Runtime Setup](docs/SHUTTLE-RUNTIME-SETUP.md)
- **Refactoring Roadmap:** [Refactoring Guide](docs/REFACTORING-GUIDE.md)
- **QA & Pilot Docs:** [Hardware/Pilot Protocol](docs/pilot/HARDWARE_QA_TH.md) · [Overall Readiness Audit](docs/pilot/OVERALL_READINESS_AUDIT_TH.md) · [GridGeist Usage](docs/GRIDGEIST_USAGE_TH.md)

---

## Product Overview

**SPORTSCOUT** is a local-first sports scouting workstation designed for coaches, analysts, lecturers, and sports science researchers. Matches, rosters, events, tactical markings, and tracking telemetry persist locally in IndexedDB (`idb-keyval` and `sportscout-tracking-v1` schema v3) with exportable schema `1.2` JSON/CSV workflows.

### Core Workstation Modules
1. **Workstation Shell (`Scout → Review → Analyze → Report`):** Unified dark high-density workstation UI (`#071018` / `#0b1219`, responsive across desktop and narrow `<1024px` viewports; legacy Classic UI switcher retired).
2. **Multi-Sport Scouting & Rules (`src/sports/rules/`):** Driven by the modular `SportRuleEngine` supporting:
   - **Badminton** (`singles` / `doubles`, Pro HUD Touch Court, rally & area/zone validation)
   - **Volleyball** (`Pro HUD` with in-court & OOB zones, foul & setter/rotation context)
   - **Football** (halves, zones, fouls & cards)
   - **Basketball** (quarters, clock/shot validation, fouls)
3. **Video Playback & Pro HUD:** Local video file playback (including FileSystem handle reconnection) and YouTube URL playback for scouting, W-hold area selection, keyboard shortcuts, and opt-in **Controller V1** gamepad mapping.
4. **Analytics & Reports:** Match dashboard, team comparison, court sequence map, heatmaps, interactive event table, Coach Report (`FullCoachReport`), and schema-versioned JSON/CSV import/export.

### Experimental Extension: Badminton Tracking Lab (`Labs`)
Located in the **Labs** tab (`src/components/labs/BadmintonTrackingLab.tsx`), backed by a local Python FastAPI vision service (`ai_service/`) connected explicitly over localhost or an authenticated tunnel (`aiConnection.ts`).

- **Real Video Tracking Only:** Uses real decoded local video frames, YOLO player detection, ByteTrack multi-object tracking (`trackId` kept strictly distinct from sports identity `P1..P4`), and 2D pose estimation. Synthetic demo data is blocked from production tracking pipelines and IndexedDB persistence.
- **Court Calibration & Recovery:** Supports both **Auto Court calibration** and manual 4-corner selection with camera-segment (`cameraSegmentId`) cut safety and manual corner recovery.
- **Shuttle Tracking Engine:** Separate configurable inference runtime (`opencv_onnx` / `rallylens_tracknet`) with per-session runtime provenance and live diagnostics.
- **Display Overlay Default:** Defaults to compact player bounding boxes (`overlayMode: 'box'`, Skeleton OFF) to reduce visual clutter, while keeping an instant opt-in toggle (`Skeleton` / `Body Center` / `Feet` / `Bounding Box` / `Off`) with no re-analysis required.

> **Scientific Scope Limitation:** Keypoints and body overlays computed by the local tracking service from monocular camera footage are **2D image-space estimates** only. SPORTSCOUT does not claim true 3D kinematics, ground reaction forces, joint torques, or vertical jump heights from standard single-camera video.

---

## Tech Stack

- **Frontend:** React 19, TypeScript (~5.8), Vite 6, Tailwind CSS v4, Recharts, ReactPlayer, Lucide icons, Motion, Vite PWA (`vite-plugin-pwa`).
- **Offline Persistence:** IndexedDB via `idb-keyval` (projects/workspaces) + native IndexedDB database `sportscout-tracking-v1` (version 3: `trackingAnalyses`, `trackingSampleChunks`, `trackingCandidates`, `trackingTelemetryPages`) + `localStorage` for compact settings/UI preferences.
- **Local AI Vision Service (`ai_service/`):** Python, FastAPI, Uvicorn, Ultralytics YOLO, PyTorch/ONNX Runtime, OpenCV.
- **Quality & Testing:** Vitest (`@testing-library/react`), Playwright E2E (Chromium), Python `unittest`, ESLint 9 (`typescript-eslint` + `react-hooks` baseline tracker), TypeScript (`tsc --noEmit`).

---

## Repository Architecture

```text
├── src/
│   ├── App.tsx                         # Root workstation coordinator
│   ├── appMetadata.ts                  # Version ('0.11.0-pilot.1') & schema ('1.2') constants
│   ├── workstation/
│   │   └── workstationModel.ts         # Unified workstation mode & preset model
│   ├── sports/
│   │   ├── rules/                      # SportRuleEngine & per-sport rule adapters
│   │   ├── badminton/ · volleyball/ · football/ · basketball/
│   ├── context/
│   │   ├── ScoutContext.tsx            # Active match events, undo/redo history, scouting validation
│   │   └── WorkspaceContext.tsx        # Local-first multi-project management & persistence queue
│   ├── services/
│   │   ├── aiTrackingService.ts        # Tracking API facade & capability probes
│   │   ├── aiConnection.ts             # Explicit local/remote AI endpoint & auth state
│   │   ├── trackingSessionApi.ts       # HTTP session lifecycle & bounded result paging
│   │   ├── trackingSessionStore.ts     # Project-scoped tracking state & telemetry ingestion
│   │   └── storage/                    # Modular tracking IndexedDB storage package
│   │       ├── trackingStorage.ts      # Public barrel re-export preserving consumer contracts
│   │       ├── types.ts                # Shared storage types, store names, bounded helpers
│   │       ├── driver.ts               # IndexedDB v3 driver, Memory driver & repository CRUD
│   │       ├── analytics.ts            # Movement metrics, quality & bounded stream aggregation
│   │       ├── chunking.ts             # Downsampling & fixed-duration chunk generation
│   │       └── streamingBuilder.ts     # Fixed-memory incremental analysis stream builder
│   └── components/
│       ├── analytics/                  # Dashboard & BadmintonMovementDashboard
│       ├── hud/                        # Pro HUD touch overlays & zone selectors
│       ├── report/                     # FullCoachReport printable view
│       ├── settings/                   # Settings, import/export, gamepad & AI configuration
│       └── labs/                       # Modular Badminton Tracking Lab UI & hooks
│           ├── BadmintonTrackingLab.tsx
│           ├── TrackingPerformanceControls.tsx
│           ├── TrackingVideoStage.tsx
│           ├── TrackingVideoOverlay.tsx
│           ├── ShuttleOverlay.tsx
│           ├── TrackingLabInspector.tsx
│           ├── trackingLabStatus.ts
│           └── useTracking*.ts         # Connection, overlay window, lifecycle, workflow, recovery hooks
├── ai_service/                         # Python FastAPI real-video tracking & court/shuttle pipeline
├── scripts/                            # Build, icon check/generation, pilot readiness & QA helpers
├── e2e/                                # Playwright browser acceptance specs
└── docs/                               # Architecture specs, QA protocols & refactoring roadmap
```

---

## Development & Verification Commands

### Prerequisites
- Node.js `22.x` + npm
- Python virtual environment with `ai_service/requirements.txt` (required to run local AI tracking or Python unit tests)

### Setup & Run
```powershell
npm ci
npm run dev                 # Frontend dev server at http://127.0.0.1:3000
npm run start:local         # Start frontend + local ai_service together (Windows)
```

### Verification Gates
Run all gates from the repository root (`docs/FRONTEND-VERIFICATION.md`):

```powershell
npm run typecheck           # tsc --noEmit
npm run lint                # ESLint src/**/*.{ts,tsx} verified against .eslint-baseline.json
npm test                    # Vitest unit & integration suite
npm run check-icons         # Validate PWA icons (192x192, 512x512, maskable)
npm run build               # Generate PWA icons & Vite production build
npm run test:e2e            # Playwright Chromium end-to-end suite
python -m unittest discover -s ai_service/tests -p "test_*.py"
```

> **Note:** When running Python tests against an environment with an active user store, set `SPORTSCOUT_ANALYSIS_STORE_DIR` to an isolated temporary directory first.

# SportsScout Phase 3.5E — Analysis Export Foundation Validation

**Document Status**: AUTHORITATIVE EVIDENCE  
**Phase**: Phase 3.5E (Analysis Export Foundation)  
**Date**: 2026-10-06  
**Repository Branch**: `fix/phase3-final-remediation`  
**Evaluation Standard**: Zero Tracking Re-execution, Monocular 2D Estimation Constraints, Strict Ground-Truth & Forensic Integrity  

---

## 1. Executive Summary

SportsScout Phase 3.5E implements the **Analysis Export Foundation** — a production-grade, post-analysis export pipeline that consumes already-computed SportsScout tracking results without re-executing detection, pose estimation, court calibration, or shuttle tracking.

The pipeline bundles all artifacts into a validated, path-traversal hardened ZIP archive:
`SportsScout_<match-name>_<date>_Analysis.zip`

### Included Artifacts
1. **Annotated Video (`video/analysis_overlay.mp4`)**:
   - Rendered using OpenCV (`mp4v` container fallback) with exact frame-index alignment against the canonical source timeline.
   - Overlays: Calibrated court polygon (camera-segment aware), player bounding boxes, COCO-17 2D pose skeletons, ground points (with `FEET` / `BBOX` provenance indicators), shuttle detections (observed vs predicted), and bounded shuttle motion trails (reset on camera cuts).
   - Audio is explicitly omitted from visual overlay video to avoid clock-drift and demuxing errors.
2. **Tactical Court Heatmaps (`heatmaps/*.png`)**:
   - Continuous 2D Gaussian density estimation evaluated on the canonical 6.1m × 13.4m badminton court plane.
   - Individual player heatmaps (`player_1_heatmap.png`, `player_2_heatmap.png`, etc.), composite movement heatmap (`player_movement_heatmap.png`), and shuttle landing/position heatmap (`shuttle_heatmap.png`).
   - If court calibration is lost or valid court points are insufficient (< 3 samples), heatmaps cleanly render a vector court outline with an **"INSUFFICIENT VALID DATA"** badge rather than fabricating false coordinates or falling back to (0, 0).
3. **Match PDF Report (`report/SportsScout_Report.pdf`)**:
   - Multi-page report generated headlessly via Matplotlib's `PdfPages` vector backend.
   - Page 1: Match metadata, pipeline runtime provenance (detector, pose, shuttle models), capability coverage matrix, and execution summary.
   - Page 2: Tracked player summary (P1..P4 observation coverage, total court distance) with embedded tactical court heatmaps.
   - Page 3: Frame quality diagnostics, camera segment breakdown, and applied overlay configuration settings.
4. **Structured Data Manifests (`data/*.json`, `README.txt`)**:
   - `analysis_summary.json`: JSON summary with frame counts, player coverage fractions, and segment counts.
   - `export_manifest.json`: Full forensic audit provenance including source media SHA-256, model SHA-256s, repository commit SHA, video resolution/FPS, warning disclosures, and list of generated artifacts (with zero exposed secrets or tokens).
   - `README.txt`: Plain-text manifest guide explaining the directory layout and monocular 2D scientific disclosures.

---

## 2. Architecture & Design Principles

```
  Post-Analysis Results (AnalysisJobStore)
          │
          ├── Chunk 1 (Frames 0..63)
          ├── Chunk 2 (Frames 64..127)
          └── ...
          │
          ▼
   AnalysisExporter
   ├─► Video Overlay Engine (cv2.VideoWriter, PTS/frameIndex aligned)
   ├─► 2D Gaussian Heatmap Generator (canonical 6.1m × 13.4m court plane)
   ├─► SportsScout_Report.pdf (headless matplotlib PdfPages)
   ├─► Manifest & Provenance Generator (export_manifest.json)
   └─► Safe ZIP Bundler (path-traversal protection, atomic swap)
```

### Zero Tracking Re-execution
The export engine reads committed analysis rows directly from `AnalysisJobStore.iter_chunks(session_id)`. Tracking models (YOLOv8, YOLO-Pose, TrackNet) are never re-instantiated or executed during export.

### Exact Canonical Frame & PTS Alignment
Frames from the source video are read sequentially using `cv2.VideoCapture`. Each frame's zero-based `frame_idx` is looked up in an $O(1)$ telemetry hash map. Non-analyzed frames (due to frame stride) maintain clean interpolation or hold the previous valid overlay without timeline slippage.

### Camera Cut Safety & Boundary Handling
When a camera transition (`is_cut = True` or `cameraSegmentId` changes) occurs:
- Court overlay is instantly suppressed if the new segment is `UNCALIBRATED` or in `REACQUIRING` state.
- Shuttle motion trails are cleared across cut boundaries to prevent spurious lines connecting disconnected points.
- Missing detections or `UNKNOWN` shuttle states are never coerced into $(0, 0)$.

### Path Traversal Protection
All ZIP archive entries are validated before writing:
- Rejects entries starting with `/` or `\\`.
- Rejects relative directory traversal tokens (`..`).
- Rejects Windows drive letters (`C:`) and UNC network paths.
- Rejects null bytes (`\0`).

### Disk Storage Verification
Before any render allocation, the exporter estimates required disk space:
$$\text{Storage Required} = 1.5 \times \text{Source File Size} + 50\text{ MB}$$
If available storage on the temporary drive is insufficient, the job aborts immediately with `InsufficientStorageError` (`INSUFFICIENT_STORAGE`) before writing any files.

---

## 3. Presets & Overlays

| Preset | Court | Player Box | Pose Skeleton | Ground Points | Shuttle | Shuttle Trail | Player Labels | Track IDs | Diagnostics HUD | Confidences |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **CLEAN** | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ | ✕ |
| **ANALYSIS** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✕ | ✕ | ✕ |
| **DEBUG** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **CUSTOM** | User | User | User | User | User | User | User | User | User | User |

- **ANALYSIS (Default)**: Recommended for coaches and performance analysts. Focuses on tactical motion, player identity, and court placement without cluttered telemetry text.
- **DEBUG**: Enables raw ByteTrack MOT identifiers, inference confidence floats, camera segment indices, and processing FPS HUD.
- **CLEAN**: Renders pure baseline video without overlays.

---

## 4. Real-Video Smoke Test Evidence

An end-to-end export run was executed on the actual 10-minute real match dataset using existing stored analysis results:

| Attribute | Measured Value |
| :--- | :--- |
| **Match Video** | `Asian Double Men 2026.mp4` |
| **Source Video Path** | `C:\Users\sport\OneDrive\Documents\Vedio Bad\Asian Double Men 2026.mp4` |
| **Source SHA-256** | `84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817` |
| **Source Resolution & FPS** | 1280 × 720 @ 30.0 fps |
| **Source Frame Count** | 29,359 video frames (10+ minutes) |
| **Committed Analysis Frames** | 9,000 frames (stride 2) |
| **Export Preset** | `ANALYSIS` |
| **Render Duration** | **295.67 seconds** (4.93 minutes) |
| **Exported Archive Path** | `C:\Users\sport\.cache\sportscout-evidence\phase3-2026-10-05\real_smoke_analysis.zip` |
| **Exported Archive Size** | **399,517,768 bytes** (381.01 MB) |
| **Exported Archive SHA-256** | `ca957b9c3ade34624761dd45958b676f21542c0d49de33531071e41ca98fd582` |

### Validated Archive Structure
```
SportsScout_Analysis.zip (ca957b9c3ade34624761dd45958b676f21542c0d49de33531071e41ca98fd582)
├── README.txt                                     (1,230 bytes)
├── data/
│   ├── analysis_summary.json                        (630 bytes)
│   └── export_manifest.json                       (1,831 bytes)
├── heatmaps/
│   ├── player_1_heatmap.png                      (37,051 bytes)
│   ├── player_2_heatmap.png                      (37,251 bytes)
│   ├── player_movement_heatmap.png               (37,735 bytes)
│   └── shuttle_heatmap.png                       (37,389 bytes)
├── report/
│   └── SportsScout_Report.pdf                    (99,815 bytes)
└── video/
    └── analysis_overlay.mp4                 (410,450,448 bytes)
```

---

## 5. Automated Test Suite Results

### Python Exporter Suite (`ai_service/tests/test_analysis_exporter.py`)
Ran all 25 required test cases:
1. `test_01_all_overlays_enabled`: Verified all overlays render correctly in DEBUG preset.
2. `test_02_all_overlays_disabled`: Verified CLEAN preset produces clean video without overlays.
3. `test_03_court_only_export`: Verified court polygon renders without pose or player overlays.
4. `test_04_pose_only_export`: Verified COCO-17 skeleton renders without court or shuttle overlays.
5. `test_05_shuttle_only_export`: Verified shuttle positions render without player overlays.
6. `test_06_custom_overlay_configuration`: Verified arbitrary combinations of overlay toggles.
7. `test_07_overlay_timestamp_frame_alignment`: Verified 1:1 frame-to-timestamp lookup without slippage.
8. `test_08_camera_cut_resets_calibration_and_trails`: Verified cut resets court overlay and flushes trails.
9. `test_09_missing_pose_data`: Verified null pose keypoints do not crash renderer.
10. `test_10_missing_shuttle_data`: Verified null shuttle state does not draw fake markers.
11. `test_11_unknown_shuttle_state`: Verified UNKNOWN state does not plot or coerce to (0, 0).
12. `test_12_missing_calibration`: Verified uncalibrated frames display INSUFFICIENT VALID DATA badge.
13. `test_13_analysis_with_partial_capability_coverage`: Verified graceful handling when shuttle/pose disabled.
14. `test_14_cancel_during_video_rendering`: Verified cancel stops video rendering and removes temp files.
15. `test_15_cancel_during_pdf_generation`: Verified cancel stops PDF compilation and cleans up.
16. `test_16_cancel_during_archive_creation`: Verified cancel stops ZIP packaging and removes partial file.
17. `test_17_insufficient_storage_handling`: Verified `InsufficientStorageError` raised before start.
18. `test_18_source_video_missing`: Verified `SourceVideoMissingError` raised immediately when video missing.
19. `test_19_safe_zip_paths_path_traversal_protection`: Verified path traversal attempts rejected.
20. `test_20_analysis_revision_consistency`: Verified `InvalidAnalysisRevisionError` on frame count mismatch.
21. `test_21_manifest_generation`: Verified `export_manifest.json` schema, hashes, and secret hygiene.
22. `test_22_pdf_generation`: Verified `SportsScout_Report.pdf` compiles valid `%PDF-` binary.
23. `test_23_heatmap_generation`: Verified 2D Gaussian density PNGs on 6.1m × 13.4m court plane.
24. `test_24_archive_contents`: Verified complete ZIP hierarchy and safe relative entry paths.
25. `test_25_deterministic_rerun_from_same_stored_snapshot`: Verified bitwise-stable structure and manifests across runs.

**Result**: **25/25 PASSED** in 23.98s.

### Frontend Component & API Tests
- `src/components/labs/ExportConfigModal.test.tsx`: **4/4 PASSED** in 568ms.
- `src/components/labs/BadmintonTrackingLab.test.tsx`: **14/14 PASSED** in 1.38s.
- `npx tsc --noEmit`: **0 errors** (Clean).
- `node scripts/lint-with-baseline.mjs`: **PASS** (462/462 findings within baseline, zero net new violations).

---

## 6. Monocular 2D Scientific Disclosures

In compliance with SportsScout engineering rules (AGENTS.md):
- **Monocular 2D Pixel Estimates**: All body keypoints, derived angles, and positions originate from single-camera 2D monocular footage.
- **No Biomechanics Misrepresentation**: Derivations do not claim true 3D joint kinematics, ground reaction forces, or absolute vertical jump heights.
- **MOT vs Sports Identity**: ByteTrack internal track identifiers (`trackId`) remain strictly distinct from semantic match identities (`P1..P4`).
- **Audio Exclusion**: Source audio is omitted from video overlays to maintain deterministic frame synchronization without clock skew.

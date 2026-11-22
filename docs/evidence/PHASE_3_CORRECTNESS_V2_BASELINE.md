# Phase 3 correctness V2 — baseline (2026-10-08)

Base/inspected HEAD: e6b4068fa045b93d8fd5c1dfb6258468db8f81b5. Clean checkout; PR #33 diff inspected against b611a9651c8a6aed18a286e1e01b35ee412199a0. Work branch fix/phase3-sol-correctness-v2. No merge authorized.

| CLAIM | IMPLEMENTATION | EVIDENCE | STATUS |
|---|---|---|---|
| Unknown persons cannot seed identities without court | SIDE_PLAY explicitly returns ELIGIBLE; raw MOT integer also compared against semantic profile keys | player_eligibility.py; semantic_identity.py auto-seeding | FALSE |
| Established appearance can recover after cuts | Hungarian matching gates distinctive HSV/ReID and three confirmations | semantic_identity.py; identity quarantine tests | PARTIAL |
| Reliable physical distance | Per-frame 3 cm threshold; ankle and bbox transitions accepted unless fast large jump | court_mapper.py; no physical-noise validation in closeout | UNSUPPORTED |
| Canonical ground provenance | Both/single ankle/bbox, confidence, source and age exist; explicit metric quality absent | ground_position.py | PARTIAL |
| Zero false preview gaps | RAM/prefetch implemented; local lookup always cursor 0; cache spans can cover holes | BadmintonTrackingLab.tsx; trackingOverlayWindow.ts; synthetic unit tests | UNSUPPORTED |
| Exact source video alignment | Export indexes frameIndex, ignoring sourceFrame | analysis_exporter.py; server sourceFrame assignment | FALSE |
| Canonical export overlays | Court corners legacy-only; debug expects snake_case; pose assumes dicts | exporter versus analyzer payload | PARTIAL |
| Shuttle tactical heatmap | shuttle_pts never populated; flight called landing | analysis_exporter.py | FALSE |
| Shot/landing/off-camera analytics | Tracking/recovery exist; no canonical evidence-based shot event layer | shuttle_pipeline.py; shuttle_trajectory.py | UNSUPPORTED |
| Explicit CUDA execution | Unavailable CUDA and inference failures silently retry CPU | device_runtime.py | FALSE |
| Runtime doctor supports production workflows | CUDA required, hard-coded model names/device | runtime_doctor.py | PARTIAL |
| GT annotator commands reachable | a is previous frame and absent; absent unreachable | annotate_gt.py | FALSE |
| Truthful export provenance | Default models, precision, runtime/device, codec, resolution and placeholder session | analysis_exporter.py | FALSE |
| All mandatory capabilities validated; ready for integration | Unit gate enforcement exists, held-out annotation explicitly pending | closeout; frozen gate tests; certification JSON | FALSE |
| Real-video endurance | Checked-in 600 s report is historical evidence; not correctness or held-out proof | phase3-real-2026-10-05-10min-report.json | PARTIAL |
| Frontend baseline green | 107 files, 1021 tests pass on inspected base | local Vitest run 2026-10-08 | SUPPORTED |

Python baseline completed before production edits: 729 tests run, 4 skipped, no failures (54.681 s). Real source found: OneDrive/Documents/Vedio Bad/Badminton test.mp4; local detector/pose/RallyLens weights exist. Real-video validation will require inspecting results, not treating a successful run as correctness proof.

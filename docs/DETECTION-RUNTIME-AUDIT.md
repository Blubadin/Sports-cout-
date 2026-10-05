# Detection runtime repair — 2026-10-05

Scope: automatic court calibration, selected inference hardware, and regression
checks for player/pose/shuttle inference and camera segment safety.

## Findings and changes

- The running user session already executed person detection, pose and shuttle
  inference on CUDA. All three providers reported READY without CPU fallback.
  The Ultralytics wrapper intentionally uses CPU profiling contexts and keeps a
  pristine CPU model; its actual predictor backend owns the CUDA model.
- Selecting GPU for a cancelled CPU session previously resumed that CPU session.
  A different device request now creates a new analysis and retains the old job.
  Shuttle receives the same hardware preference, and the UI's actual device label
  uses session execution status ahead of service capabilities.
- AutoCourt previously included broadcast graphics and advertising in line groups,
  grouped perspective fragments by their midpoints, and required an elevated net
  as a ground-plane landmark. It now isolates white markings on large green
  playing surfaces when available, groups fragments at common reference axes,
  rejects short/disjoint logo strokes and checks the dominant cross-line direction.
  Other surface colours retain the generic edge path.
- Three width markings and three length markings still supply nine independent
  intersections. A measured doubles long-service marking may replace the elevated
  net. Boundary coverage, reprojection, homography and confidence gates remain.
  The shorter painted centre line permits 35% measured full-length support.
- The production validator requires three accepted, consistent candidates within
  at most five frames. Missing evidence never becomes a candidate. Segment cuts,
  excessive geometric drift and excluded scene intervals clear pending evidence.
- Windows Uvicorn's Proactor listener stopped accepting HTTP requests after
  WinError 64 while the analysis worker remained alive. Local Windows startup now
  installs the Selector policy and prevents Uvicorn from overriding it. Other
  platforms retain the automatic loop. The user job resumed from its journal.

Court line extraction, video decoding and identity bookkeeping run on CPU.
Selecting CUDA controls neural inference; it does not move every stage to GPU.

## Verification

- Real decoded `Badminton test.mp4`, frames 100–129: two initial uncalibrated
  frames, then 28 CALIBRATED frames. Detector, pose and shuttle providers READY on
  CUDA. Actual detector predictor parameters: `cuda:0`; shuttle forward output
  received with shape `[1, 8, 288, 512]`.
- Full camera-cut scan of this fixed-view clip: 8,869 real frames, zero cut events.
  This checks false cuts on that clip, not recall on other broadcast footage.
  Existing unit cases verify hard cuts, viewpoint changes, return cuts, homography
  invalidation, identity separation and metric segment breaks.
- New regression cases: perspective ground markings with external scoreboard,
  bounded missing-evidence confirmation, cross-segment reset, and GPU selection
  after cancelled CPU analysis without deleting the prior job.
- Full TypeScript check passed; Vitest: 105 files / 1,000 tests passed. Python:
  636 tests, 633 passed / 3 opt-in skipped. ESLint baseline comparison passed.
  ESLint retains the pre-existing baseline
  of 430 errors and 30 warnings; no new baseline violations are accepted.
- After restarting with the repair, the actual user session reported PROCESSING,
  CALIBRATED and CUDA at source frame 2,984, without an execution error.

This is runtime and regression verification, not a court or shuttle accuracy
benchmark. Close-up, replay or obscured views can still require manual calibration.

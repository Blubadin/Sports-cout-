# Phase 3 real-video evidence — 2026-10-05

## Scope and code

Branch: `feat/phase-three-camera-cut`. Starting HEAD:
`06d5482b861835f9f132f90a9c3ab31260bb6b82`. Main comparison reference:
`0856ba0660073b1d8ab180f4086fbfd07c96d719`. No reset, push, merge or deploy.

The frozen protocols record the exact HEAD, working-tree diff, untracked Python
source contents, service-file hashes, runner hash, packages, media and model
hashes. The final delivery commit contains the evaluated production patch.
The offline verifier is separate postprocessing and records its own hash.

## Reproduction and necessary correction

The real 5-second CPU comparison exposed a timestamp defect: uninterrupted
analysis rejected the first decoder PTS of zero and used a one-frame-later
fallback. A seeked resume accepted positive decoder PTS, placing new rows
33.333 ms earlier than baseline. Real decoder/seek reproduction confirms this
on 22 samples; see `phase3-real-2026-10-05-timestamp-reproduction.json`.

`server.py::_video_frame_timestamp` now accepts valid zero PTS and uses
zero-based source time for unavailable PTS. A 1 ns comparison allowance avoids
near-equal decoder timestamps bypassing monotonic fallback. The existing
repeated-PTS expected values were retained; two regressions were added.
No detector, tracker, model, sampling, precision or confidence threshold changed.

The corrected real CPU 8-second baseline/cancel/process-kill runs each completed
120 observations with zero duplicate/order/schema/frame-gap/timestamp-alignment
violations. Both resumed jobs retained every committed prefix chunk. Tracking
differences remain reported diagnostics; this is safe-boundary warmup, not exact
tracker restoration. The earlier 5-second comparison is bug reproduction and
**fails timestamp parity**, even though its narrower original durability checks
passed. The initial launcher-PID smoke attempt is incomplete instrumentation
evidence and supplies no valid worker-RAM or recovery comparison.

## Frozen configurations

**Reduced configuration actually executed:** unchanged YOLOv8n person detection
and YOLOv8n-pose ROI inference, ByteTrack, detector 640, confidence 0.35, pose
confidence 0.4, frameStride 2, poseStride 1, four doubles player slots, no ReID,
no court ROI, existing auto court calibration enabled, shuttle disabled.
All source frames are decoded in order; only the requested source duration is
limited. CPU execution uses Torch 2.5.1+cpu; NVIDIA execution uses Torch
2.5.1+cu124 / CUDA 12.4, Ultralytics 8.3.203, FP32 tensors, existing PyTorch
backend and backend defaults. No TensorRT, FP16 or vendor tuning was performed.
The protocols include TF32/backend default flags and the installed default/NMS
and ByteTrack YAML hashes. CPU thread count stays at the existing evaluator's 1.

NVIDIA device: RTX 4050 Laptop GPU, driver 577.09, 6,141 MiB VRAM. Real 5-second
GPU smoke completed 75 observations; detector and pose provenance both report
CUDA/FP32 with no fallback. This validates that execution scope on this device;
it does not certify every NVIDIA runtime or the absent shuttle pipeline.
AMD Radeon 680M inference is **NOT VALIDATED**.

**Full configuration not executed:** the protocol separately records the
consecutive-frame stride-1 RallyLens configuration. Required checkpoint SHA-256
`08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`
is unavailable locally. Reduced player/pose runs are never described as full
pipeline validation.

## A. Held-out scenarios

**NOT VALIDATED** for all 14 buckets. Qualified held-out sample count is zero;
coverage and accuracy metrics are null. The existing GT is a development-only
one-second interval, source frames 180–209: 20 visible and 10 unknown labels.
Reviewer identity and independent second review are unrecorded. Unknown was
not converted to absent. No model predictions were made into GT.

`phase3_benchmark.evaluate_phase3_benchmark` was not scored with absent GT or
invented approved thresholds. The annotation-plan preflight fails qualification;
Phase 3 quality thresholds remain **UNSET**. Calibration/ground error, true ID
continuity/switches, cut/relock and shuttle accuracy remain unavailable. The
per-bucket reasons and reverified media hashes/durations are in the readiness JSON.
The production observation/validity counts are separate from GT accuracy.

## B. Long-video execution

10-minute source: the first 18,000 real source frames of
`Asian Double Men 2026.mp4`, SHA-256
`84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817`.
Original source: 29,359 frames, 978.633333 seconds, 1280×720 at 30 FPS.
The long run uses the same frozen NVIDIA reduced configuration for all passes.

**Long-video runs completed:** The uninterrupted baseline and cancel/restart
recovery completed to source frame 18,000 (9,000 analyzed observations). The
original process-kill attempt was stopped after durable progress at source frame
1,067 / cursor 512 and is preserved as `INTERRUPTED_BY_USER`. A fresh process-kill
retry run under `long-10min-process-kill-retry` reached completion at source frame
18,000 (9,000 observations) with ungraceful process termination after frame 9,000,
retaining every committed prefix chunk and passing all wire contract checks.

Canonical `frameIndex` counts analyzed observations; checkpoint
`lastProcessedFrame` counts decoded source frames. Source duration is computed
from the latter, not by treating analyzed rows as source frames. A source read
ordinal of 2 maps to source PTS 1/30 second; source ordinal 18,000 maps to PTS
599.966667 seconds and represents completion of a 600-second source interval.

Recovery is tested separately as production cancel/process exit/restart and
abrupt OS termination of the evaluator-owned inference interpreter. Windows
venv launcher PIDs are distinguished from the actual worker PID. Interruption
is requested only after durable progress, around half the source duration.
Fresh interpreters reconstruct the job from the production journal.

Exact checks: committed chain/schema, sequence/cursor, no duplicate or reordered
rows, source timestamp/frame alignment, and unchanged committed prefix hashes.
Diagnostic tolerances were frozen before comparison: 1 ns timestamp and 1e-6
numeric coordinate units. Player/track/state/segment/numeric differences are
reported separately; they are not approved GT accuracy thresholds.

Tracker, visual lifecycle and shuttle temporal internals are recreated with
recent-frame warmup; exact temporal state is not restored. Metric continuity
breaks at resume. Warmup does not append duplicate canonical observations.
Human correction persistence is **NOT VALIDATED**: no real human corrections
were supplied; checkpoint/unit-test evidence is kept separate.

RAM is the actual inference process RSS, not the Windows launcher RSS. Reports
include CUDA allocated/reserved memory and sampled bounds for the result window,
pending chunk, semantic owner map and scene transition history. Samples cannot
prove every internal vendor buffer bounded. RAM growth acceptance is **UNSET**;
the report provides first/last RSS medians and maxima without inventing a leak
threshold. Wall/video ratios include startup, warmup, polling tail and normal
machine background load. CPU unit checks ran concurrently with the beginning
of baseline; these timings are execution evidence, not a controlled hardware
performance comparison.

30/60-minute runs: **NOT VALIDATED — MISSING_MEDIA**. The three real sources are
978.633333, 811.166667 and 295.633333 seconds. No loop, duplication or artificial
concatenation is used to fill missing durations.

## Reproduce

From the repository root, use the recorded isolated interpreter/environment.
The protocols contain full package freezes; CPU and CUDA environments are
separate under `C:\Users\sport\.cache\sportscout-evidence\phase3-2026-10-05`.
Model acquisition happened in explicit preflight, not inside benchmark inference.
Media must match its recorded hash; local YOLO files must match artifact hashes.

```powershell
$evalRoot = 'C:\Users\sport\.cache\sportscout-evidence\phase3-2026-10-05'
$evalPython = "$evalRoot\cuda-venv\Scripts\python.exe"
$evalGit = 'C:\Users\sport\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\git\cmd\git.exe'
# Use a NEW directory/protocol for a new run; existing frozen jobs are not overwritten.
& $evalPython ai_service/evaluate_phase3_real.py --prepare --protocol "$evalRoot\new-run\protocol.json" --media 'C:\Users\sport\OneDrive\Documents\Vedio Bad\Asian Double Men 2026.mp4' --models "$evalRoot\models" --seconds 600 --device cuda --git $evalGit
& $evalPython ai_service/evaluate_phase3_real.py --protocol "$evalRoot\new-run\protocol.json" --output "$evalRoot\new-run" --mode all
# ONLY after all workers have exited:
& $evalPython scripts/verify_phase3_real_evidence.py "$evalRoot\new-run" --output "$evalRoot\new-run\contracts.json"
```

The runner rejects code/media/model drift after freeze. Its 5-second monitoring
samples and each worker's 2-second snapshots are retained. Raw journals, chunks,
startup/finish snapshots, prefix hashes and logs remain in the persistent cache;
the evidence index records hashes and sizes. Canonical rows are not put into GT.

## Verification actually run

| Check | Result |
| --- | --- |
| Python coordinate mapping | PASS, 23 tests |
| Python capability gates | PASS, 16 tests |
| Timestamp regression | PASS, 3 tests; old expectations retained |
| Calibration checkpoint regressions | PASS, 6 tests |
| Evaluator numeric diagnostics | PASS, 2 tests |
| CPU Python unittest discovery | PASS, 653 tests, 4 skips |
| Unmasked CUDA Python discovery | FAIL, one existing GPU-unavailable test assumes no CUDA hardware without mocking that condition; other tests completed; 4 skips |
| Same unavailable-GPU test with `CUDA_VISIBLE_DEVICES=-1` | PASS, explicit unavailable-device scenario; expected values unchanged |
| TypeScript `tsc --noEmit` | PASS |
| ESLint baseline runner | PASS, 432 errors + 30 warnings all within declared 462-finding baseline; not zero-debt/full-repo coverage |
| Vitest | PASS, 105 files / 1,004 tests |
| Icon generation + Vite build | PASS; existing chunk-size warning |

Actual entry points: `node node_modules/typescript/bin/tsc --noEmit`,
`node scripts/lint-with-baseline.mjs`, `node node_modules/vitest/vitest.mjs run`,
`node scripts/generate-pwa-icons.mjs`, `node node_modules/vite/bin/vite.js build`,
`python -m unittest discover -s ai_service/tests -v`, and the targeted test
patterns listed above. Git was added to the verification process PATH after
the first CPU discovery attempt had one missing-Git error; the full rerun passed.
An empty `CUDA_VISIBLE_DEVICES` assignment on PowerShell removed the variable
and did not hide CUDA; that extra attempt retains the same one-test failure.
The explicit `-1` scenario is reported separately, not as unmasked CUDA success.

Python skips: the existing integration test searches root-local YOLO files
(its fallback can render a synthetic image, so it is not used as real evidence),
two real RallyLens tests and one reviewed-shuttle real-model test require missing
explicit checkpoint/media inputs. Real YOLO inference is covered by the actual
video jobs. Node 24.19.0 was used; package.json declares Node 22, which is not
validated by this local run. JSDOM media/canvas warnings are not video evidence.

## Remaining actions

Supply the pinned RallyLens checkpoint; qualify independent held-out GT by
recording/match group and required stream; approve/freeze quality thresholds;
provide continuous 30/60-minute source media; supply real corrections for their
persistence evaluation. Fix the existing unavailable-GPU unit-test setup in a
separate authorized change without weakening its assertions. AMD/full pipeline,
held-out quality and missing long durations remain NOT VALIDATED.

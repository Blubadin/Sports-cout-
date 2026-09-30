# Inference runtime boundary and accelerator readiness — 2026-09-30

## Scope and decision

The existing PyTorch/Ultralytics and RallyLens runtimes remain the production baseline. The changes reuse the existing runtime and detector/pose/shuttle adapter seams; they do not add a second Runtime Manager, change model family, alter precision, frame interval/sampling, or install a production dependency. `auto` no longer silently changes `ProcessingProfile` workload based on available hardware.

ONNX is an isolated CPU feasibility spike only. The three existing model artifacts passed the bounded parity scope below, but this does not promote ONNX as a production provider. GPU/vendor readiness is `NOT VALIDATED`: this host reports no CUDA device and no GPU execution was performed.

## Runtime boundary implemented

- Requested device remains `auto`, `cpu`, or `cuda`; provenance records requested and effective device separately.
- Existing adapter boundary accepts the canonical frame/temporal input and returns the existing canonical detection, pose, or shuttle outputs. Tracking and analytics do not call a provider API directly.
- Provider provenance includes backend/provider, runtime and versions, precision, model version and SHA-256 artifact identity, preprocessing/postprocessing versions, execution status, and fallback reason where one occurred. Session/server telemetry carries detector, pose, and shuttle provenance.
- For `auto`, CUDA is selected only after availability, initialization and a successful inference probe. Otherwise the provider uses CPU and records a warning reason. An inference-time CUDA exception switches to CPU and retries the same input before tracking/analytics mutate; recreation preserves temporal tracker/model semantics. CPU failure is terminal and surfaces a job error rather than claiming successful fallback.
- Fault-injection tests exercise initialization/runtime fallback, same-frame retry/no duplicate observation, state preservation and terminal CPU error. This is software fallback evidence, not hardware validation.
- No production dependencies or model artifacts were added. Temporary ONNX evaluation packages and exports remained outside the repository.

## ONNX protocol fixed before execution

- The paired evaluation used identical local artifact bytes, FP32, preprocessing, postprocessing, and consecutive decoded source frames 100–159 (60 frames) from `Badminton test.mp4`; source video SHA-256: `e7c5581bdf88f622aff88901bab139133fea50f93c25c0a928056294a2bc9a4e`.
- Tolerances fixed before running: tensor `atol=1e-4`, `rtol=1e-3`, finite values required; source box/keypoint displacement at most `1.0 px`; confidence at most `1e-4`; 2D angles `0.1°`; stance width `1.0 px`; counts/classes/identities/states exact.
- YOLO export graph names, dtype, input/output shapes and symbolic dimensions were inspected; dynamic batch/spatial behavior was exercised with an additional `[2,3,384,640]` input.
- TrackNet temporal contract was kept intact: `[1,27,288,512]` nine-frame input, `[1,8,288,512]` output, map 7 used for the latest input frame. Consecutive temporal windows were compared.
- A generated ONNX file alone does not pass. Each status below means only that model passed the measured CPU feasibility scope, not production adoption or GT quality.

## Evaluation results

Environment: PyTorch `2.14.0+cpu`, Ultralytics `8.4.142`, OpenCV `5.0.0.93`, NumPy `2.4.6`; isolated ONNX `1.23.1` and ONNX Runtime `1.30.0`. CUDA availability: false.

| Existing model | Status and measured scope | Output parity evidence |
| --- | --- | --- |
| YOLOv8n detection (`f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36`) | `VALIDATED` for 60 consecutive real frames, CPU feasibility only | Raw tensor shape `[1,84,5040]`; maximum elementwise absolute tensor difference `0.00344849`, with every element meeting the predeclared `atol=1e-4, rtol=1e-3` comparison. Source boxes max difference `0.0001221 px`, confidence `1.34e-6`, classes exact. Dynamic `[2,3,384,640]` probe passed. ByteTrack IDs/classes/boxes and downstream semantic identity/metrics matched exactly across all 60 frames. |
| YOLOv8n pose (`c6fa93dd1ee4a2c18c900a45c1d864a1c6f7aba75d84f91648a30b7fb641d212`) | `VALIDATED` for 60 consecutive real frames, CPU feasibility only | Raw tensor shape `[1,56,5040]`; maximum elementwise absolute tensor difference `0.00079346`, with every element meeting the predeclared `atol=1e-4, rtol=1e-3` comparison. Source boxes max difference `0.0001221 px`; keypoints `0.0001526 px`; confidence and keypoint confidence within tolerance. 2D derived values and boolean metrics matched exactly for the measured pose outputs. Dynamic `[2,3,384,640]` probe passed. |
| RallyLens TrackNet (`08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`) | `VALIDATED` for 52 temporal windows from the same 60 frames, CPU feasibility only | Input `[1,27,288,512]`, output `[1,8,288,512]`; every window met fixed tolerance and temporal contract. Canonical pipeline state/recovery/trajectory outputs matched: 10 observed, 2 predicted, 39 lost, 9 unknown; observed/predicted accounting and trajectory analytics were identical. |

The production CPU adapter smoke also passed on the real source frame: detector produced 6 person detections and both detector/pose adapters reported `READY` provenance. The ROI pose invocation returned 0 keypoints on that frame; this is recorded as a no-candidate smoke observation, not a pose-quality claim.

ONNX model/artifact hashes, graph metadata, per-frame/window comparisons and downstream details are in [`scripts/runtime_evaluation/results-2026-09-30.json`](../scripts/runtime_evaluation/results-2026-09-30.json). The isolated runner is [`scripts/runtime_evaluation/onnx_feasibility.py`](../scripts/runtime_evaluation/onnx_feasibility.py).

## Evidence limits

- `VALIDATED` above is bounded CPU tensor/postprocessing/contract parity using real decoded frames, not benchmark accuracy. This clip does not have a frozen ground-truth manifest, so shuttle/player precision, recall, reacquisition and per-scenario quality are **NOT VALIDATED** here.
- GPU, CUDA, Windows ML, ORT vendor providers, AMD/Intel/NPU, speedup, live readiness and minimum hardware specifications are **NOT VALIDATED**. Fault injection is software-only fallback validation.
- No ONNX model is promoted. Production continues on the current runtimes until broader held-out, hardware, and deployment evidence exists.

## Repository verification

- `npm run lint` (`tsc --noEmit` in this repository): passed.
- Temporary isolated ESLint 10 + TypeScript parser/plugin run on the four touched TypeScript files: passed. The repository itself has no ESLint configuration or ESLint dependency.
- `npm test`: 102 files and 947 tests passed.
- Runtime-focused Python checks: fallback/provenance 8 passed; device selection 5 passed; RallyLens 9 passed with 2 artifact-dependent tests skipped; tracking-session provenance 4 passed.
- Full current-worktree Python suite: 568 run, 3 skipped, 2 failed. Failures are `test_cut_invalidates_h_before_mapping_and_preserves_image_observations` and `test_court_to_cut_to_close_up_to_return_to_court`; both pass against branch `HEAD` and exercise the pre-existing unstaged player/camera lifecycle work. They remain visible and are not represented as passing runtime evidence.

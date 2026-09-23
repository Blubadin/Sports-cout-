# PHASE 2.9B REAL MODEL REPORT

## Artifact inspection

Available: **YES**, found locally in `Downloads/rallylens-main.zip`, archive entry
`rallylens-main/models/shuttle_tracknet.pth`. No weights were downloaded or invented.
The 45,431,245-byte checkpoint was extracted to the active worktree's ignored
`.local-models/rallylens-shuttle-tracknet.pth`. It is not committed or redistributed.

SHA256: `08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`.
The adapter pins this exact artifact and uses `torch.load(weights_only=True)` plus
strict state-dictionary loading. All 104 entries matched the audited architecture.

Accompanying local sources inspected: `src/rallylens/vision/tracknet.py`,
`src/rallylens/vision/shuttle_tracker.py`, and conversion documentation/code.
Architecture source SHA256:
`b2b153990578c193535d2519a922e6feb2ba31ada7ffcf94ab31596590229438`.
The Python package declares MIT; checkpoint training provenance and redistribution
rights are not independently established. Keep the weights local.

## Actual contract, not a filename assumption

This is a PyTorch state dictionary, **not an ONNX graph**. ONNX input/output names
and graph dynamic-dimension metadata do not exist for this artifact.

| Property | Audited adapter contract |
| --- | --- |
| Inputs | One `forward(x)` tensor; float32 `[1,27,288,512]` |
| Temporal layout | Nine consecutive frames, oldest first; concatenate RGB on channels |
| Preprocessing | Source OpenCV BGR uint8; bilinear resize to 512x288; RGB; divide by 255; no mean/std |
| Outputs | One forward return; float32 `[1,8,288,512]` |
| Semantics | Eight sigmoid probability heatmaps, not logits |
| Alignment | Output i maps to input i+1; consume output 7 for the newest input |
| Coordinates | Heatmap x * source width / 512; y * source height / 288, clipped to image bounds |
| Runtime | PyTorch, CPU, FP32; fixed dimensions supported by this adapter |

Preprocessing/alignment are verified against the **accompanying inference source**,
not independently recovered training records. The convolutional architecture can
accept other sizes in principle; this adapter deliberately rejects them rather
than guessing a contract. The existing generic OpenCV ONNX provider remains
unchanged in its default scaling and does not attempt to load this checkpoint.

## Integration

`RallyLensTemporalModelAdapter` implements `ShuttleTrackerProvider`. Runtime factory
selection is explicit: `rallylens_tracknet`. Incompatible window, dimensions,
precision, runtime, device or skipped source frames are rejected. Frame stride
must be 1. Frontend settings follow the backend's advertised model contract,
instead of forcing a three-frame ONNX configuration.

Provenance exposes exact contracts, model name/hash, actual runtime/device,
model-loaded state, inference/extraction counters, raw output shape and range.
No synthetic provider is used in the real tests or production smoke test.
Default shuttle enablement remains off; no weights are fetched automatically.

## Real execution evidence (2026-09-23)

Initial independent forward using the archived reference architecture and nine
real decoded frames: **PASS**, `[1,27,288,512]` -> `[1,8,288,512]`, finite FP32.
Output range approximately `0.00006223 .. 0.57463` across all eight maps.
The selected newest-frame map had no candidate above 0.5.

Production smoke uses ten decoded frames from local `Downloads/1.mp4`, encoded
into a tiny temporary AVI, through the actual upload -> calibration -> start ->
worker -> results endpoints and real player/shuttle pipelines. No detector,
provider, frames or heatmaps are mocked. Image-boundary calibration is only a
lifecycle check, **not valid measured court calibration or tactical evidence**.

- Artifact loaded: YES.
- Session completed with ten real, non-synthetic telemetry samples.
- Production inference calls: **2**.
- Actual output tensor received: **YES**, `[1,8,288,512]`.
- Candidate extraction calls: **2**.
- Last tensor range: approximately `0.00007766 .. 0.35113`.
- Real shuttle candidate produced in this smoke clip: **NO** at confidence 0.5.
- Synthetic provider used: **NO**.

The clip starts with a person at a gym rather than a useful match rally. This is
execution evidence, not an accuracy benchmark. No threshold tuning or shot
recognition was performed. Domain/quality evaluation belongs to Phase 2.11.

## Reproduce without large assets

From the active worktree, using existing local weights and video:

```powershell
$env:SPORTSCOUT_TEST_SHUTTLE_MODEL = (Join-Path (Get-Location) '.local-models/rallylens-shuttle-tracknet.pth')
$env:SPORTSCOUT_TEST_REAL_VIDEO = 'C:\Users\Sport-Science-R3909\Downloads\1.mp4'
python -m unittest ai_service.tests.test_rallylens_model -q
```

Real tests are explicitly skipped when these local artifacts are not supplied;
contract/unit tests still run. Production smoke retains only ten frames and
deletes its session upload and temporary clip. Tests do not download weights.

For an already secured local service process, explicitly configure
`SHUTTLE_ENABLED=true`, `SHUTTLE_PROVIDER=rallylens_tracknet`, and
`SHUTTLE_MODEL_PATH` pointing to this audited file. Provider-specific defaults
select 9 frames / 512x288 / pytorch / fp32 / cpu. These environment values are not
persisted automatically and `.env.example` is documentation, not a secret store.

## Limitations and security gates

Final regression validation: Python unittest discovery **380 passed, no skips**
(including both real-artifact tests); TypeScript `tsc --noEmit` passed; Vitest
**95 files / 865 tests passed**. Independent read-only review checked the actual
archive, state-dict hash, architecture, temporal alignment, scaling and frontend
configuration, with no remaining actionable blockers.

CPU execution is not promised to be real-time. Model accuracy, training provenance,
licensing for redistribution, CUDA/FP16 and other checkpoints are not validated.
Only this exact hash is supported. A new checkpoint requires its own review.

SEC-0.2 upload hardening does not fix the baseline's missing SEC-0.1 authentication
or public bind. **Do not expose this service to a shared LAN.**
ESLint is not configured in this repository; `npm run lint` is TypeScript only.
The repository's all-tools gate cannot be claimed as fully passed until that
existing tooling gap is addressed separately.

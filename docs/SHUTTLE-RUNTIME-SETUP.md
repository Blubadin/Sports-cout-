# Shuttle inference runtime setup

The existing `rallylens_tracknet` provider can load the public checkpoint at
[RallyLens commit 98db909](https://github.com/YeonSeong-Lee/rallylens/blob/98db909c5a11569e43677cdfb5e2ad1e752936d6/models/shuttle_tracknet.pth).
The web preview's empty release manifest does not describe whether the Python
checkpoint is tracked in Git. This file matches SportsScout's existing audit:

- Size: 45,431,245 bytes.
- SHA-256: `08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`.
- Input: nine consecutive real RGB frames, FP32 `[1,27,288,512]`.
- Output: eight sigmoid heatmaps, FP32 `[1,8,288,512]`; map 7 belongs to the newest input frame.

## Install and start on Windows

From the project directory, explicitly install the checkpoint:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-shuttle-model.ps1
```

`npm run setup:shuttle` runs the same installer. The pinned GitHub download is
verified before installation into ignored `.local-models`. An existing valid
file is reused; an invalid file is rejected. `-SourcePath` supports installing
a local checkpoint subject to the same checks. Analysis never downloads weights.

Use an installed Python with the project's requirements. A local Windows virtual
environment at `.local-services/python` is selected by the launcher automatically:

```powershell
python -m venv .local-services/python
.local-services/python/Scripts/python.exe -m pip install -r ai_service/requirements.txt
```

For this machine's NVIDIA CUDA 12.4 environment, the tested PyTorch packages are
`torch==2.5.1` and `torchvision==0.20.1` from `https://download.pytorch.org/whl/cu124`.
CPU is also supported. Select the desired device in the process environment:

```powershell
$env:SHUTTLE_DEVICE = 'cuda' # or 'cpu'
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/start-local.ps1
```

Explicit `-Python` still overrides the launcher's local environment. The launcher
recognizes the verified model path and selects `rallylens_tracknet`. Stop an
existing AI process before relaunching with changed environment values.

Open the Lab and enable **Shuttle Tracking Engine**. Overlay controls are
independent. Use frame stride 1; the model requires consecutive frames.
`/api/capabilities` should report `modelAvailable: true`, `probeStatus: AVAILABLE`,
provider `rallylens_tracknet`, and a nine-frame window. Only actual inference
can establish `executionValidated`, output tensor receipt, and inference counts.

The checkpoint's training provenance and redistribution rights were not
independently established by the earlier SportsScout audit. Keep the downloaded
weights local; this change commits only setup code/documentation. Readiness and
real-video execution do not certify detection accuracy or 3D shuttle motion.

## Verification on 2026-10-05

Executed on `refactor/scouting-core-tracking-lab`, Windows, RTX 4050 Laptop GPU,
Python 3.12 / PyTorch 2.5.1+cu124. The two missing-resource unit fixtures were
isolated from the developer's installed weights and GPU availability. Their
original failure and fallback assertions remain enforced.

| Check | Result |
| --- | --- |
| Pinned GitHub download, repeat install | PASS; matching size/hash, existing verified file reused |
| Wrong-size and correct-size tampered checkpoint | PASS; rejected before destination publication |
| TypeScript `tsc --noEmit` | PASS |
| Vitest full suite | 105 files / 999 tests passed |
| Python full discovery | 632 tests: 629 passed, 3 opt-in tests skipped |
| Opt-in RallyLens tests with supplied real model/video | 9 passed; actual upload, Auto Court startup and production worker exercised |
| CUDA production shuttle pipeline, real video frames 100–119 | 20 decoded frames, 8 warm-up unknowns, 12 forward calls, 12 observed candidates; tensor `[1,8,288,512]`, effective device CUDA, execution status READY |
| Live API | `modelAvailable=true`, `probeStatus=AVAILABLE`, provider `rallylens_tracknet`, window 9 |
| Live Lab | Engine enabled, `Ready / Model ready`, `pytorch / fp32`, `cuda / 9` |
| Diff whitespace | PASS |

Real-video checks used local `Badminton test.mp4`; they establish execution,
not ground-truth accuracy. Temporary test stores were isolated from the live
analysis store. Detailed logs, tensor provenance and UI screenshot are retained
in ignored `.local-services`.

ESLint was also run over 287 source files using the existing workspace's
`eslint.config.js` and `.eslint-baseline.json`: 430 legacy errors and 30 legacy
warnings, with zero findings exceeding that baseline. The target branch's
`lint` npm script still invokes TypeScript, so this is an explicit ESLint
baseline check rather than a claim that legacy source is lint-clean.

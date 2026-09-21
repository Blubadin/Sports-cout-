# SportsScout Vision Benchmark Protocol (Phase 1.0)

## 1. Overview & Purpose
The SportsScout Vision Benchmark Protocol provides a standardized, vendor-neutral measurement methodology for evaluating player detection, multi-object tracking (MOT), 2D pose estimation, and execution runtimes.

Future model candidates (e.g. YOLOv8 baseline, YOLO11, YOLO26, TensorRT runtimes, alternative trackers) must be evaluated on the exact same benchmark manifest using identical metric definitions.

> **Principle**: No winning model is selected in Phase 1.0. This phase defines the measurement instrument and experimental protocol only.

---

## 2. Benchmark Clips & Manifest Structure

### What is a Benchmark Clip?
A benchmark clip is a standardized, logically referenced video segment designed to challenge vision tracking algorithms across specific real-world sports conditions.
- **Duration**: Recommended 30–120 seconds per clip (guideline for rapid test iteration).
- **Storage Rule**: Video binaries are **never** committed to Git. The manifest references local video assets by stable logical identifiers (`videoReference`).

### Standard Categories (Initial B01–B05)
| Category ID | Name | Match Type | Target Players | Difficulty / Evaluation Focus |
| :--- | :--- | :--- | :--- | :--- |
| `B01_singles_easy` | Singles / Easy (Static Rear) | Singles | 2 | Clear lighting, static rear camera, minimal occlusion baseline. |
| `B02_singles_fast_rally` | Singles / Fast Rally | Singles | 2 | High-velocity movement, motion blur, sudden direction changes. |
| `B03_doubles_standard` | Doubles / Standard | Doubles | 4 | 4 athletes, standard offensive/defensive rotational crossings. |
| `B04_doubles_occlusion` | Doubles / Occlusion | Doubles | 4 | Frequent teammate overlaps, line-of-sight occlusions, identity stress. |
| `B05_difficult_broadcast` | Difficult / Broadcast | Singles | 2 | Broadcast pan/tilt/zoom, spectators in background, small far-court players. |

### How to Add a New Benchmark Clip
1. Place the local video file in your local workspace data folder (e.g. `benchmarks/videos/B06_custom.mp4`).
2. Add an entry to [`src/benchmarks/visionBenchmarkManifest.json`](file:///c:/Users/Sport-Science-R3909/Documents/GitHub/Sports-cout-/src/benchmarks/visionBenchmarkManifest.json) or use `createBenchmarkClip(...)`:
   ```json
   {
     "id": "B06_doubles_lighting_shift",
     "name": "Doubles / Lighting Shift",
     "sport": "badminton",
     "gameType": "doubles",
     "playerCount": 4,
     "videoReference": "benchmarks/videos/B06_doubles_lighting_shift.mp4",
     "durationSec": 45.0,
     "sourceWidth": 1920,
     "sourceHeight": 1080,
     "sourceFps": 30.0,
     "cameraType": "static_rear",
     "cameraMotion": "static",
     "difficultyTags": ["doubles", "lighting_variation", "shadows"],
     "courtCalibrationReference": "calibration_rear_perspective_standard",
     "groundTruthAvailable": false,
     "notes": "Testing detector confidence stability across variable lighting.",
     "knownDifficultSegments": [
       { "startSec": 15.0, "endSec": 22.0, "tags": ["shadow_crossing"] }
     ]
   }
   ```
3. Run `validateBenchmarkClip(newClip)` to verify schema adherence.

---

## 3. Experiment Configuration

Every trial is defined by a `VisionBenchmarkExperimentConfig`:
- **`detector`**: Detection model name (e.g. `yolov8n`, `yolo11n`, `yolo26`).
- **`detectorVersion`**: Optional model weight version string.
- **`poseModel`**: Pose estimation model (e.g. `yolov8n-pose`, `null` if pose disabled).
- **`tracker`**: Multi-object tracker algorithm (e.g. `bytetrack`, `norfair`, `ocsort`).
- **`trackerVersion`**: Optional tracker implementation version.
- **`runtime`**: Execution environment (`pytorch`, `onnxruntime`, `tensorrt`, `openvino`).
- **`inputSize`**: Square input pixel dimension fed to detector (e.g. `416`, `512`, `640`).
- **`confidenceThreshold`**: Confidence filter cutoff (e.g. `0.25`, `0.50`).
- **`frameStride`**: Detector execution cadence (`1` = every frame, `2` = alternate frames).
- **`poseStride`**: Pose estimation cadence.
- **`courtRoiEnabled`**: Boolean indicating whether court boundary cropping was applied.
- **`device`**: Target hardware (`cpu`, `cuda`, `mps`).
- **`precision`**: Execution precision (`fp32`, `fp16`, `int8`, `bf16`).

---

## 4. Run Identity & Traceability

To eliminate non-reproducible manual naming (e.g. `test1`, `best`, `final2`), all runs use deterministic structured run IDs:
$$\text{Run ID} = \text{RUN\_\_}\{\text{clipId}\}\text{\_\_}\{\text{configSlug}\}\text{\_\_}\{\text{UTC timestamp}\}$$
Example:
`RUN__B01_singles_easy__yolov8n_bytetrack_640px_cpu_pytorch_fp32__20260921T140000Z`

Every benchmark result is explicitly traceable to:
$$\text{Video ID} + \text{Experiment Config} + \text{Model Config} + \text{Runtime / Device}$$

---

## 5. Metrics Specification

### Required Quality Metrics (Reused from Phase 0)
- **Per-Player Observed Coverage** ($0.0 \dots 1.0$): Fraction of expected frames where target athlete was actively observed.
- **Mean Target Coverage** ($0.0 \dots 1.0$): Arithmetic mean of observed coverage across all expected players.
- **Simultaneous Target Coverage** ($0.0 \dots 1.0$): Fraction of frames where **all** expected targets were simultaneously observed.
- **Predicted %** ($0.0 \dots 100.0\%$): Fraction of frames where target state was extrapolated without fresh detection.
- **Lost %** ($0.0 \dots 100.0\%$): Fraction of frames where target tracking was completely lost.
- **Mean Observed Confidence** ($0.0 \dots 1.0$): Average detection confidence during observed frames.

### Required Performance Metrics
- **Analysis FPS**: Real frames analyzed per second of wall-clock time.
- **Elapsed Seconds**: Total wall-clock processing time.
- **Processing Ratio** ($\text{elapsedSec} / \text{durationSec}$): Multiplier relative to video duration ($< 1.0$ is faster than real-time).
- **Effective Telemetry Hz**: Frequency of recorded output points.

### Optional Ground Truth Metrics (When `groundTruthAvailable = true`)
- **Mean Court-Position Error** (meters)
- **Median Court-Position Error** (meters)
- **P95 Court-Position Error** (meters)
- **Distance Error** (meters)
- **Identity Accuracy** ($0.0 \dots 1.0$)
- **Identity Continuity** ($0.0 \dots 1.0$)
- **ID Switch Count** (integer)

---

## 6. Strict Honesty: Missing Data vs. Measured Zero

- **Missing / Unmeasured Values**: Must be represented as `null` (or `None` in Python).
  - Example: A clip without ground truth has `meanCourtPositionError = null`. It must **never** default to `0.0`.
  - An unknown device or uncalibrated court must be `null`, not `"unknown"` or `"0"`.
- **Measured Zero**: Represents an actual measurement yielding zero.
  - Example: A perfect tracking run has `idSwitchCount = 0` and `distanceError = 0.0`. These are valid numbers and preserved as `0`.
- **UI Presentation**: All `null` or `undefined` values are rendered as `'—'` (em dash) or `"Not available"`.

---

## 7. How Phase 1 Will Use the Protocol
1. **Model Evaluation (Phase 1.1+)**: Compare candidate models (YOLOv8 baseline, YOLO11, etc.) across the B01–B05 clips under identical `inputSize`, `frameStride`, and `device` parameters.
2. **Speedup Verification**: `areBenchmarkConfigsMatching` ensures hardware or architecture speedup claims are only valid when algorithmic parameters are strictly identical.
3. **Reproducibility**: Experiments are checked in using `VisionBenchmarkExperimentConfig`, allowing any analyst or automated CI job to recreate the exact trial.

---

## 8. Phase 1.3 Local Detector Matrix Runner

Run the fixed detector matrix from the repository root:

```powershell
python ai_service/benchmark_runner.py
```

The default matrix is exactly:

- YOLOv8n: 640
- YOLO11s: 640, 960
- YOLO11m: 640, 960
- YOLO26s: 640, 960
- YOLO26m: 640, 960

The runner never schedules 1280 and never downloads a missing model. It reads the local references in `src/benchmarks/visionBenchmarkManifest.json`; video files remain outside Git. Named calibration files are resolved from `benchmarks/calibrations/<courtCalibrationReference>.json` and contain a `corners` array of four pixel-coordinate pairs.

Selection examples:

```powershell
python ai_service/benchmark_runner.py --clips B01_singles_easy,B04_doubles_occlusion
python ai_service/benchmark_runner.py --detectors yolov8n,yolo11s --input-sizes 640 --device cpu
python ai_service/benchmark_runner.py --output-dir D:\local-benchmark-results
```

The default ignored output directory is `benchmark_results/`. Each invocation writes:

- a JSON bundle preserving configuration, successes, failures, unavailable inputs, per-player quality, optional ground-truth metrics, and nullable resource measurements;
- a flat CSV comparison table sortable by detector, resolution, quality, speed, processing ratio, and measured peak VRAM.

Each invocation receives a unique run-group ID. Individual run IDs include the clip, detector/input pair, tracker, pose model, runtime, precision, device, strides, confidence threshold, ROI mode, timestamp, and run group. JSON and CSV are written through temporary files and never overwrite an existing run group.

`UNAVAILABLE` means a local clip or model weight was absent. `FAILED` means an available run reached the runtime but failed at a recorded stage. Neither status receives zero-filled metrics. If no selected video exists locally, the runner reports `BENCHMARK DATASET NOT AVAILABLE LOCALLY` and writes no run records.

The 1280 follow-up indicator is deliberately conservative. It returns `Yes` only when a completed 960 run on a clip tagged `far_court_small_scale` has mean target coverage below 0.80, `No` only when every such measured run is at least 0.95, and `Cannot determine` for missing or mixed evidence. The runner never schedules a 1280 run itself.

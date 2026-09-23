# Detector Benchmark Runner Design

## Scope

Phase 1.3 adds a repeatable local detector benchmark runner on top of the existing Phase 1.0 protocol, Phase 1.1 configurable engine, and Phase 1.2 candidate registry. It does not add model families, alter identity semantics, tune ReID, enable TensorRT, track shuttles, benchmark pose models, or choose a production detector.

## Architecture

The runner is a Python CLI in `ai_service`. It loads the checked-in vision benchmark manifest, resolves locally referenced clips, creates the fixed nine-entry detector/input-size matrix in stable order, checks local model availability before analyzer construction, and executes each available clip/configuration pair through the existing SportsScout tracking pipeline. The execution function is injected at the orchestration boundary so failure isolation and result persistence can be tested without video inference.

All non-detector variables come from one immutable common configuration: ByteTrack, YOLOv8n pose, confidence threshold 0.35, frame stride 1, pose stride 1, PyTorch FP32, one selected device, and the manifest's court calibration reference. Only detector model and detector input size vary.

## Results

Each attempted pair produces a result record with a deterministic full-configuration identity and a unique timestamped run-group ID. Status is one of `SUCCESS`, `FAILED`, or `UNAVAILABLE`. Failures retain the failure stage, concise error summary, and full configuration. Missing measurements remain JSON `null` and empty CSV cells; measured zero remains numeric zero. Result files are written atomically and never overwrite an existing run group.

Successful results contain Phase 0 quality and performance metrics, optional ground-truth metrics, and measured peak GPU memory only when the active runtime exposes it. The runner writes a lossless JSON result bundle and a flat CSV comparison table suitable for sorting by quality, speed, processing ratio, resolution, and resource use.

## Dataset and Safety Rules

Videos remain local and are never copied into the repository. Missing clips produce the explicit dataset-unavailable outcome and no fabricated run metrics. Missing detector or pose weights are recorded as unavailable and never trigger remote model downloads. Resolved weights use absolute local paths during execution. One failed configuration never prevents later configurations from running.

The runner never schedules 1280. It reports whether a 1280 follow-up can be assessed from measured 960 results and difficulty metadata; without completed local measurements it returns `Cannot determine`.

## Verification

Tests cover deterministic matrix generation, failure isolation, unavailable model preservation, null-versus-zero semantics, required run identity, saved-result reload, and the no-dataset path. After targeted tests, the full Python, frontend, lint/TypeScript, and production-build checks guard the existing project.

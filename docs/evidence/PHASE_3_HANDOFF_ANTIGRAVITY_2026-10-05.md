# Phase 3 real-video evidence handoff

## Current state

- Branch: `feat/phase-three-camera-cut`
- Baseline before this work: `06d5482b861835f9f132f90a9c3ab31260bb6b82`
- Main comparison SHA: `0856ba0660073b1d8ab180f4086fbfd07c96d719`
- The long-video controller was intentionally stopped by the user after partial `process_kill` progress. Do not mark the run PASS.
- The working tree contains the timestamp fix, evaluator, verifier, smoke evidence, readiness manifest, and the main Phase 3 report. Preserve all unrelated user work.

## Evidence roots

Use this existing cache; do not recreate media or loop footage:

```powershell
$repo = 'C:\Users\sport\OneDrive\Documents\GitHub\Sports-cout-'
$evidence = 'C:\Users\sport\.cache\sportscout-evidence\phase3-2026-10-05'
$cudaPython = "$evidence\cuda-venv\Scripts\python.exe"
$long = "$evidence\long-10min"
```

The source media and hashes are recorded in `docs/evidence/phase3-real-2026-10-05-readiness.json` and in `$long\protocol.json`. The protocol uses the actual 10-minute prefix of `Asian Double Men 2026.mp4` (18,000 source frames, 600 s). No 30-minute or 60-minute source exists.

## Continue the interrupted process-kill run

Run from the repository root. The controller has already completed the uninterrupted baseline and cancel/restart comparison. The process-kill attempt was stopped around source frame 1,067 after durable cursor 512. Continue the same frozen protocol; do not change model, thresholds, sampling, precision, or output root:

```powershell
Set-Location $repo
& $cudaPython ai_service/evaluate_phase3_real.py `
  --protocol "$long\protocol.json" `
  --output $long `
  --mode process_kill
```

The current controller deliberately refuses to reuse an existing `store/process_kill` directory. Preserve the partial attempt as `INTERRUPTED_BY_USER` and run a fresh process-kill comparison under a new sibling output directory, explicitly recording why it is a new attempt. Do not delete the partial directory:

```powershell
$killRetry = "$evidence\long-10min-process-kill-retry"
& $cudaPython ai_service/evaluate_phase3_real.py `
  --protocol "$long\protocol.json" `
  --output $killRetry `
  --mode process_kill
```

Use the completed baseline/cancel evidence from `$long` together with the retry's process-kill evidence only after checking that the protocol SHA and frozen config match. Do not call a fresh retry a continuation of the killed worker.

## Required verification after a complete run

```powershell
Set-Location $repo
& $cudaPython scripts/verify_phase3_real_evidence.py `
  $killRetry `
  --output "$repo\docs\evidence\phase3-real-2026-10-05-10min-contracts.json"
```

Inspect `report.json`, `baseline`, `cancel_restart`, and `process_kill` startup/finish/progress files. Confirm exact invariants separately from measured numerical/identity differences:

- no duplicate or out-of-order durable writes;
- schema and `isSynthetic` invariants hold;
- replay/canonical-write gate remains closed;
- UNKNOWN/CAMERA_TRANSITION and stale observations do not leak into valid metrics;
- resumed prefix is retained;
- process-kill recovery is labelled separately from cancel/restart;
- temporal state restored only where the worker declares it (safe-boundary warmup is expected).

No GT accuracy claim is allowed. The available reviewed shuttle file is only 30 frames/1 second, lacks the required independent review provenance, and is development scope; all held-out quality buckets remain `NOT VALIDATED`. Shuttle is disabled in this reduced tracking configuration. Full RallyLens configuration is recorded as unavailable because its checkpoint is missing.

## Finish and report

1. Copy final long-video `report.json`, protocol, and contract-verifier output into `docs/evidence/`.
2. Update `docs/evidence/PHASE_3_REAL_EVALUATION_2026-10-05.md` from “execution in progress” to the observed final statuses. Keep partial process-kill evidence and explain any user interruption.
3. Run required checks (CPU is the reference suite):

```powershell
& "$evidence\venv\Scripts\python.exe" -m unittest discover -s ai_service/tests -v
npm run typecheck
npm run lint
npm run test -- --run
npm run build
```

The CUDA Python suite has one known environment-sensitive existing failure because a test assumes CUDA is unavailable; the isolated `CUDA_VISIBLE_DEVICES=-1` case passes. Report this rather than changing the test.

4. Review `git diff --check`, `git status`, and the exact staged file list. Commit only the Phase 3 evidence/evaluator/timestamp fix files; never commit the cache, virtual environments, or model weights. Do not push or merge.

## Exit labels

- Timestamp zero-origin fix and regression: `PASS`.
- 10-minute uninterrupted and cancel/restart durability: `PASS` only if their completed reports and verifier pass.
- Process-kill durability: `PASS` for completed retry run under `long-10min-process-kill-retry` (retaining prefix, recovering from ungraceful kill after source frame 9,000 to frame 18,000, 0 contract violations); original partial attempt is preserved as `INTERRUPTED_BY_USER`.
- Held-out real-data quality, shuttle metrics, 30-minute and 60-minute runs, AMD execution, and full RallyLens configuration: `NOT VALIDATED` with the recorded blockers.

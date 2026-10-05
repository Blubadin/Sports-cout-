# Phase 3.4 / 3.5D foundation — Astra handoff

Date: **2026-10-01 (Asia/Bangkok)**
Branch: `feat/phase-three-camera-cut`
Implementation SHA: **`053f3ccc227e5c3bab0566da27035438adc9767b`**
Contract baseline: `fadf3bf2a8a0208fe2977c2c93d74f6e02e681f9`
Status: **IMPLEMENTED / FIXTURE VERIFIED; BLOCKED REVIEW. Phase gate remains open.**

## Delivered behavior

Backend telemetry commits in chunks of 64 and retains a 128-row live window. Results use a durable binary cursor index and a maximum page size of 250. Job listings are paged and read journal metadata without recreating every analyzer. One analysis worker is admitted at a time; competing starts return 429. Distance histories, scene/calibration runtime histories and raw tracker ownership history are bounded. Frontend telemetry retains at most 512 rows, writes cursor pages to IndexedDB, and builds saved sample chunks sequentially with bounded aggregation.

The local backend store retains journals, media, checksummed chunks, committed write sequences and resume events. `PROCESSING`/`CANCEL_REQUESTED` journals become `INTERRUPTED` after restart. Progress and decoded cursors are separately exposed from the durable committed cursor. Completion/cancellation is exposed after durable writes; storage errors and premature decoder termination cannot become completed jobs.

Resume validates config, media bytes, model artifact hashes and runtime/provider versions. It restores aggregate totals, quality counts, player name/team/appearance, active calibration identity/source and segment index. ByteTrack IDs, old boxes/poses, detector/shuttle temporal inputs and scene motion history require reconstruction. Recent source frames are replayed without canonical writes; warm-up length covers the configured temporal window. Metric continuity is broken at the resume boundary. **Exact temporal resume is not claimed.** Immutable resume event files record the range/reason and explicitly state that committed canonical chunks were retained, with no supersession of those chunks.

Media replacement journals a new revision before removing the prior upload and rolls back on journal failure. File writes flush before journal commit. Delete tombstones remain outside the deleted tree, allowing repair after an inner marker has already been removed. Recovery removes uncommitted chunk/index tails and unreferenced owned media. Media needed to resume has no automatic TTL purge. IndexedDB deletion uses one transaction across analysis/chunk/candidate/raw-page stores; unavailable storage and transaction failures are surfaced. Replaying completion reloads an existing completed record and preserves corrections.

No queue, Redis, Celery, database migration, production dependency, model/precision/sampling change or new runtime vendor was introduced.

## Requirement evidence

| Requirement | Status | Evidence / limit |
|---|---|---|
| Bounded backend/frontend raw buffers and cursor retrieval | PASS — FIXTURE VERIFIED | `test_analysis_job_api`, `test_bounded_distance_tracker`, `trackingStorage.test.ts`; 64/128/250/512 bounds above. Calibration timeline metadata remains proportional to segment changes; it is not raw frame history. |
| Bounded worker concurrency/backpressure | PASS — FIXTURE VERIFIED | Competing jobs rejected; frontend awaits page persistence and chunk writes. |
| Backend-accessible job state, interrupted detection | PASS — FIXTURE VERIFIED | Journal reconstruction tests; frontend IndexedDB is not worker commit authority. |
| Commit proof separate from progress | PASS — FIXTURE VERIFIED | Checksummed journal/chunk/index chain and durable cursor/sequence. |
| Resume input/config/model compatibility | PASS — FIXTURE VERIFIED | Missing media, config mismatch and changed artifact hash reject resume. |
| Idempotent canonical data, repeated resume | PASS — FIXTURE VERIFIED | Repeated cancel/restart/resume retains frames 1–60 exactly once; changed sequences and duplicate/reordered frames reject writes. |
| No duplicate statistics/corrections | PASS — FIXTURE VERIFIED | Aggregate restoration excludes warm-up writes; completed record replay preserves correction count. |
| Restore segment/calibration and re-warm temporal state | PASS — FIXTURE VERIFIED | Lost calibration remains lost, segment index advances correctly, appearance/summary/provenance survive reconstruction. |
| Resume/reprocessing lineage | PASS — FIXTURE VERIFIED | Immutable `resume-events`, sequence and range/reason; canonical data retained, no exact-state claim. |
| Disk full, permission denied, partial write | PASS — FAULT INJECTION | Journal write faults leave no visible uncommitted rows; partial media commit preserves previous upload. |
| Corrupt checkpoint/checksum/index | PASS — FAULT INJECTION | Chain validation rejects; recovery reports errors and does not retain completed status for invalid committed data. |
| Interrupted backend delete / orphan repair | PASS — FAULT INJECTION | External tombstone survives partial tree removal; restart repairs deletion. |
| Native browser quota/crash/delete interruption | NOT VALIDATED | Transaction/error paths implemented; memory-driver and unavailable-store fixtures are not real browser quota evidence. |
| CPU path and short real-video recovery/output parity | Limited real-media evidence | Five-second prefix, CPU reference; details below. Final additional metadata/appearance/history hardening has fixture evidence; a real-media rerun at final SHA remains open. |
| 10-minute full pipeline RAM/throughput/recovery/parity | NOT VALIDATED — gate blocked | Available media; attempt interrupted after only 207 source frames. |
| 30/60-minute full pipeline runs | NOT VALIDATED — gate blocked | Suitable local media not established. |
| Full current working-tree integration regression | FAIL — pre-existing dependency blocker | Two player eligibility/camera scene assertions fail; originals retained. |
| TypeScript / Vitest | PASS | 103 files, 953 tests; `tsc --noEmit` passes. |
| ESLint | NOT VALIDATED | ESLint is absent and `npm run lint` runs TypeScript only. |

## Verification and reproduction

- [Phase baseline Python](evidence/phase3-analysis-job-python-baseline.json): **578 tests executed, zero failures/errors, three skips**. Loads the three pre-existing dirty player files from the frozen Git baseline and excludes the unrelated untracked player eligibility suite. Reproduce: `python ai_service/evaluate_analysis_job_baseline.py --baseline-ref fadf3bf2a8a0208fe2977c2c93d74f6e02e681f9 --output docs/evidence/phase3-analysis-job-python-baseline.json`.
- [Working-tree Python](evidence/phase3-analysis-job-working-tree-python.json): **596 tests executed, two failures, zero errors, three skips**. Reproduce with `python -m unittest discover -s ai_service/tests -p "test_*.py"`; evaluation used one CPU thread to avoid test oversubscription.
- [Frontend verification](evidence/phase3-analysis-job-frontend-verification.json): TypeScript and full Vitest plus focused durable completion/storage/navigation tests. `npm run lint` is not evidence of an ESLint pass.
- Fault injection validates failure behavior; it does not establish physical power-loss or real browser quota behavior.

## Real-media evidence

[Short real-video evaluation](evidence/phase3-analysis-job-short-real.json) used the first five seconds of `01 Badminton.mp4`, CPU reference configuration, YOLOv8n detector/pose, FP32, frame stride 2 and pose stride 1. Shuttle was disabled by the existing reference default, calibration/GT was not provided. Therefore there is **no shuttle quality, eligible court-metric or ground-truth accuracy claim**. Both passes used identical video/model/config; exact canonical-field comparison was declared before execution. This was an early working-tree smoke run, before final additional checkpoint metadata/history hardening.

| Run | Processing / source duration | Peak sampled process RSS | Canonical rows |
|---|---|---|---|
| Baseline | 175.282 s / 5 s (35.06×) | 571.88 MiB | 75 |
| Cancel/journal reconstruction/resume | 110.609 s / 5 s (22.12×) | 576.49 MiB | 75 |

Canonical comparison: **0 mismatched rows; 0 duplicate/reordered frames** across frame index, timestamp, camera segment, player output, shuttle output and scene state. Journal reconstruction startup was 0.328 s. This is same-process registry/journal reconstruction on real media, not an OS-kill crash experiment. Peak RSS is sampled and includes model/runtime memory; these five seconds do not prove long-run memory stability. CPU: Intel Core i7-4790, four cores/eight logical processors; evaluation explicitly used one inference thread for both passes.

[Ten-minute attempt](evidence/phase3-analysis-job-10min-attempt.json) requested 600 seconds and was interrupted at 160.14 processing seconds / 207 source frames (~6.9 source seconds). Peak sampled RSS was 575.80 MiB and live window was 103 rows. It did **not** finish baseline, resume or parity; it is partial performance data only. Local media longer than ten minutes exists, so the remaining action is an extended evaluation run on available hardware, not a claim that no media exists. Use `python ai_service/evaluate_analysis_job.py <media> --seconds 600 --output <evidence.json>`. Longer durations require suitable real source media; do not loop or duplicate footage to claim a 30/60-minute run.

## Blocker register / next actions for Astra

| ID | Severity | Impact / reproduction | Owner / next action | Open requirement |
|---|---|---|---|---|
| AJ-01 | P1 | Dirty player eligibility implementation suppresses promotion in replay/close-up while original tests expect track 42 / bbox. Run `test_camera_cut_safety.TestCutCalibrationSafety.test_cut_invalidates_h_before_mapping_and_preserves_image_observations` and `test_scene_lifecycle.TestSceneLifecycleAndSegmentManager.test_court_to_cut_to_close_up_to_return_to_court`. | Astra + player eligibility owner: review contract and implement or approve an explicit contract/test change; do not hide by weakening assertions. | Full integration regression / dependency review. |
| AJ-02 | P1 gate | 10/30/60-minute recovery, RAM stability, throughput and correctness lack completed evidence. Partial attempt cannot close it. | Astra / evaluation owner: run final SHA with identical frozen model/config; obtain 30/60-minute media and report parity/identity uncertainty. | Long-video exit gate. |
| AJ-03 | P2 gate | No native IndexedDB quota/crash/transaction-abort experiment. | Astra / frontend storage owner: browser fault injection and interrupted save/delete validation. | Real browser durability evidence. |
| AJ-04 | P2 verification | Required ESLint check cannot run: no installed ESLint/config; `npm ls eslint --depth=0` is empty. | Astra / repository tooling owner: establish approved dev lint setup and run it. | Mandatory verification rule. |
| AJ-05 | P2 evidence | Real five-second smoke predates the final additional checkpoint/profile/history hardening. | Astra / evaluation owner: rerun short and long evidence at the implementation SHA above. | Exact-SHA real-media validation. |

Pre-existing dirty `analyzer_v2.py`, `ground_position.py`, `semantic_identity.py`, player eligibility files/tests and their unrelated `src/types.ts` hunks were preserved outside this implementation commit. No Astra high agent was used. Stop here for Astra review; this handoff does not close the Phase 3 gate or start another phase.

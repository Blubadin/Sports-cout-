# Phase 3 correctness remediation V2 — validation status

Date: 2026-10-08. Branch: `fix/phase3-sol-correctness-v2`.
Base: `e6b4068fa045b93d8fd5c1dfb6258468db8f81b5` (PR #33 head).
Main reference: `b611a9651c8a6aed18a286e1e01b35ee412199a0`.

**Status: CONDITIONAL PASS for code review. Phase 3 is not fully validated. Do not merge PR #33 or this remediation until the outstanding data gates are satisfied.**

The previous statement that all mandatory capabilities and safety gates were validated was unsupported. Passing a gate-enforcement unit test establishes that the evaluator rejects bad evidence; it does not establish that a real model meets an accuracy threshold. The initial audit is recorded in [the baseline discrepancy table](PHASE_3_CORRECTNESS_V2_BASELINE.md). Historical endurance, recovery and runtime reports remain historical evidence for their recorded revision and configuration.

## Evidence levels

| Area | Implemented behavior | Current validation level | Limit |
|---|---|---|---|
| Player eligibility | Unknown people without court evidence remain raw tracks, including SIDE_PLAY. Semantic keys cannot stand in for MOT track IDs. Known continuity is bounded; new-track reacquisition needs distinctive appearance and consecutive confirmation. Initial jersey evidence is retained; partial seeding cannot transfer a live athlete to an empty slot. | UNIT-VALIDATED; pipeline INTEGRATION-VALIDATED; real samples reviewed | No independent spectator/identity accuracy certification. Singles/doubles counts remain maxima. Similar jerseys remain ambiguous. |
| Ground points | Both ankles, single ankle, bbox hierarchy retained. Raw point reports confidence, pose source, age, freshness, metric eligibility and quality. Bbox is visual only. | UNIT-VALIDATED; sampled real overlays reviewed | Monocular foot estimates and calibration have no independently measured error bounds. |
| Distance | Bounded robust median/adaptive EMA; confidence/calibration/identity uncertainty; provenance, gap, camera and calibration resets; speed plausibility gate. | UNIT-VALIDATED on physical synthetic trajectories; real-video execution evidence | Correctness on synthetic motion is not real distance ground truth. |
| Preview | Time/cursor-aware indexed local reads, bounded pages/RAM, cache-hole detection, cancellation and owner/generation checks. | UNIT-VALIDATED; browser INTEGRATION-VALIDATED with real full-clip telemetry and IndexedDB | Full lab interactive control flow and all scene boundaries remain NOT VALIDATED. |
| Export | Exact sourceFrame mapping; fallback only for absent sourceFrame; canonical court/raw/pose normalization. | INTEGRATION-VALIDATED using decoded rendered pixels and production telemetry fixture | Full real DEBUG export is execution/sample evidence, not exhaustive frame review. |
| CUDA | AUTO alone may retry CPU. Explicit CUDA unavailability/failure is terminal. Actual provider/device execution is recorded. | UNIT-VALIDATED; real CUDA tensor/detector/pose/shuttle execution | No hardware portability certification. |
| Doctor | auto/cpu/cuda modes; configured artifact paths; actual inference; optional configured shuttle. | INTEGRATION-VALIDATED on CPU and CUDA | CPU inference on a CUDA-enabled workstation does not validate a separate CPU-only installation. Mock tests cover absent CUDA. |
| Shuttle shot layer | Contact/return/terminal lifecycle, visibility/edge continuity, conservative reacquisition, null unknowns, nine metric landing zones, separate plots and coverage. | UNIT-VALIDATED; connected to analyzer/exporter | Automatic wrist/reversal contact is experimental. Production terminal/3D metric measurement is NOT VALIDATED. |
| Held-out GT | Existing annotation/gate protocol retained; conflicting annotation key fixed. | NOT VALIDATED | Independent reviewed labels, blinded evaluation, approved held-out results remain required. |

## Metric definitions and limitations

`rawGroundPoint` is the observed anatomical/bbox point; `filteredGroundPoint` is a separate stabilized metric point. Raw telemetry is retained. Both ankles need fresh non-stale pose and sufficient confidence for metric use; one ankle carries larger uncertainty. Bbox fallback contributes no physical distance or metric heatmap samples.

The stabilization window is three observations. A median suppresses isolated jitter; coherent translation bypasses median delay. An adaptive EMA raises its cutoff for faster motion. Its state resets at every anatomical provenance change, identity gap, calibration change or camera change. Confidence-weighted uncertainty uses conservative **assumptions**, 0.12 m for both ankles and 0.24 m for a single ankle before confidence scaling. Missing calibration confidence uses a conservative 0.5 assumption instead of perfect confidence. These are not calibrated statistical confidence intervals. Accepted travel exceeds twice this uncertainty radius and respects 11 m/s for both instantaneous filtered motion and the accepted-anchor interval. The accepted anchor is retained for small steps, allowing slow coherent travel to accumulate without integrating every noisy frame.

`totalTrackedDistanceM` includes valid COURT_PLAY/RALLY and COURT_IDLE intervals. `distanceDuringActivePlayM` excludes COURT_IDLE. Replay, transition, invalid calibration and unavailable identity intervals contribute no travel. `metricDistanceCoverage` is metric-eligible ground observations divided by counted ground observations, not a claim of full-video coverage. `validMovementSamples` counts accepted integration updates. Provenance distributions include observed fallback points. `rawMovementM` and `filteredMovementM` are path lengths within eligible continuous intervals; resets are not bridges. `jitterRejectedDistanceM` is the nonnegative filtered path minus accepted travel. It names rejected movement diagnostically; it is not proof that all rejected displacement was noise. Local frontend samples preserve accepted cumulative travel and canonical speed, so queries do not reconstruct pose noise as physical distance. Lateral/front-back summaries remain approximate directional allocation between sampled points.

Reports use **Total Distance (m)**. Lower results than the old 644.7/811.5 m do not, by themselves, prove correctness. Review ground quality and coverage alongside totals. Small oscillatory motion below the assumed uncertainty and frequent provenance changes can be undercounted; real error must be measured against reviewed trajectories.

## Shuttle semantics

A detector point is an image observation, not a landing or an airborne metric point. Flight heatmaps require observed, explicitly metric-eligible measured positions from a validated source. An image-plane homography is not a 3D shuttle model. If those positions are unavailable, trajectory output explicitly says `INSUFFICIENT_SHUTTLE_METRIC_DATA`.

Contact inference needs three confident measured observations, a velocity reversal, a unique nearby fresh wrist and sufficient identity evidence. It may miss real contacts and is not accuracy-certified. Explicit contact and terminal evidence are accepted only above the documented confidence gates. Tracking loss, off-frame absence and camera cuts end unresolved shots as UNKNOWN, with no invented landing. While OUT_OF_FRAME, measured coordinates are null; exit observations and velocity are continuity evidence only.

Reacquisition is bounded by elapsed time, edge, direction, velocity, court/rally state and camera segment. Ambiguous entry does not inherit the old shot. A supported next contact ends the prior shot RETURNED and begins a new one. Confirmed out-of-court metric landings become OUT_SIDE/OUT_LONG. Nine-zone percentages use confirmed **in-court metric landings** as denominator. Landing coverage is confirmed metric landings divided by detected shots, including confirmed OUT results. Unknown and returned shots never enter landing heatmaps. Hitter filtering requires sufficient semantic evidence.

The analyzer does not currently supply a validated automatic ground-contact/net/out classifier or 3D shuttle measurement. The event layer supports evidence from such a provider or reviewed annotations. Do not infer that fixture landings establish production landing accuracy. A real clip with zero supported metric landings must report insufficient data.

## Export and provenance

Source frames are decoded source-video numbers, distinct from telemetry indices. Stride-2 regression renders six frames and inspects pixels to verify overlays only on 2, 4 and 6. Legacy frameIndex fallback is counted explicitly. Schema normalization occurs at the export boundary; the actual frame-150 fixture exercises court, pose and rejected raw-person rendering.

Manifest values come from recorded engine/job facts or remain null. Actual selected codec is recorded after encoder fallback. Session/job identifiers are existing job keys; project may legitimately be null for a standalone run. Source SHA256 is recorded when provided. `repositorySha` and `repositoryDirty` describe the export-time checkout; `analysisRepositorySha`/`analysisRepositoryDirty` are null unless captured at analysis time. A dirty checkout must not be presented as execution of its clean HEAD. Source audio is not multiplexed into the overlay MP4 and this is recorded.

## Verification and real footage

Baseline before production edits: 729 Python tests run, four skipped, no failures; 1,021 Vitest tests across 107 files passed. Final verification and real-video results are recorded in [V2 evidence](PHASE_3_CORRECTNESS_V2_RESULTS.md).

The local `Badminton test.mp4` is 1,280 × 720, 30 fps, 8,869 frames, 295.633 s. A fresh bounded run and an initial full run executed detector/pose/RallyLens on CUDA. Sample review of the full run exposed identity swaps when athletes changed ends; distinctive-appearance reassociation now has a regression and rejects contradictory court-side/MOT ownership.

The final full staged run replayed recorded neural observations through fresh identity/ground/distance/shot logic at `8ba56690d8f26448ea0569277509f7088bd74272`, using measured source-frame-matched detector, pose and shuttle observations from the first full CUDA run. No neural inference was rerun in this full stage; final bounded detector/pose inference ran separately on CUDA. Stage provenance and the original execution facts are recorded. Approximate visually inspected calibration is not GT. Final metrics and ground provenance are in the V2 results; conservative gating can undercount movement and lower totals are not proof of correctness. Sample overlays and the real browser seek harness were reviewed. Zero supported shots/landings produces explicitly insufficient shuttle metric plots, not invented flight/landing coordinates. Independently reviewed accuracy labels remain missing. **HELD-OUT-VALIDATED: no.**

## Outstanding acceptance work

1. Independently annotate real player trajectories and calibration uncertainty; evaluate stationary jitter, fast direction changes and singles/doubles spectators on held-out footage.
2. Supply reviewed terminal/metric shuttle evidence or validate an automatic provider before claiming real tactical landing/flight analytics.
3. Extend the production-module browser seek evidence to complete interactive lab controls and real scene boundaries.
4. Run the frozen held-out evaluator with reviewer independence and blinding requirements intact. Do not lower thresholds to pass.

Code and fixture verification can support review. They do not support the previous PHASE 3 COMPLETE, all capabilities validated, zero false gaps across real playback, or merge-ready claims. No merge is performed by this remediation.

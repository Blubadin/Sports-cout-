# SportsScout Phase 2 closeout — 2026-09-25

Decision: **PHASE 2 COMPLETE WITH VALIDATION LIMITATIONS**.
Phase 3 readiness: **READY WITH LIMITATIONS**; Phase 3 was not started.

This report records the closeout evidence from the
`refactor/scouting-core-tracking-lab` branch. It distinguishes a working real
model and production pipeline from broader tracking accuracy. The local video
and model artifact are deliberately not checked into Git.

## Security and local connection

- The AI service binds `127.0.0.1:8000` by default. A non-loopback bind fails
  without both `SPORTSCOUT_AI_REMOTE_ENABLED=true` and a configured token.
- When configured, Bearer authentication protects sensitive REST endpoints;
  `/api/status` remains a limited public health endpoint. WebSocket
  authentication is checked before acceptance. Browser clients use the
  `sportscout` and `auth.<token>` subprotocols; URL query tokens are rejected.
- Browser credentials remain runtime/session-scoped, not persisted into project
  data or exported scouting data. Authentication errors do not expose tokens.
- Direct webcam/local-file legacy sources are opt-in. Network URLs and UNC
  direct sources remain unsupported. Uploaded TrackingSession videos are
  unaffected.
- The frontend does not infer port 8000 for arbitrary production hosts and
  reports HTTPS-to-HTTP mixed content explicitly. The deployed CSP keeps a
  restricted `connect-src`, not `*`. Remote HTTPS use requires a deliberately
  configured secure endpoint, TLS boundary, and matching CSP allowance.

See [the local service contract](../security/local-ai-service.md).

## Real model and production execution

- Artifact: local `rallylens-shuttle-tracknet.pth`, SHA-256
  `08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`.
- Provider: `rallylens_tracknet`, real PyTorch CPU/FP32 inference, not the
  synthetic provider. The 9-frame input contract is `[1,27,288,512]` and the
  output contract is `[1,8,288,512]`.
- The opt-in production smoke test exercised TrackingSession creation,
  video upload, calibration, start, results, and canonical `frame.shuttle`
  telemetry. It asserted a completed session, real/non-synthetic frames,
  `inferenceCalls > 0`, and an actual output tensor. The separate reviewed
  video replay performed 30 real forward inference calls.
- A freshly launched local service reported `active=true`,
  `modelLoaded=true`, provider `rallylens_tracknet`, and matching model SHA.
  Its initial `inferenceCalls=0` was expected before a user upload; the
  production smoke and reviewed replay are the execution evidence.

## Reviewed real-video ground truth and quality

The source is the local `Asian Double Men 2026.mp4` (SHA-256
`84160d026a350716e227cb2f6f4c4c3d35cf52ab6aac6977d8e787b0299a6817`),
1280×720 at 30 FPS. The complete *annotation interval* is only source frames
180–209, 6.000–6.967 seconds: 30 consecutively reviewed frames, 20 with
manually located visible shuttle centroids and 10 `unknown`. No frame was
annotated `not_visible` or `occluded`. This is not complete match GT.

Using the corrected Phase 2.10B evaluator and a 30 px spatial tolerance, the
scorable visible frames gave 20 TP, 0 FP, 0 FN; visible-frame recall 1.0,
conditional precision 1.0, mean/median/P95 position error 2.78/1.71/6.22 px,
and spatial continuity 1.0 across the 20 visible frames. Seven predictions
on `unknown` GT frames were neither true nor false positives. No reviewed
reacquisition event occurred. Absent-shuttle precision and reacquisition
latency are **unavailable**, not zero. These metrics must not be generalized
to the match.

Separate real-model replay on frames 507–508 placed `observed` candidates on
the lower-left broadcast scoreboard, a visually confirmed false-positive
failure mode outside the scored interval. No unvalidated scoreboard mask was
added. Quality classification: **WORKS WITH SIGNIFICANT LIMITATIONS**.

See [the reviewed clip evidence](2026-09-24-reviewed-real-shuttle.md) and
[the committed frame annotations](../../src/benchmarks/reviewedRealShuttleGt.json).

## Correctness and regression evidence

- Canonical shuttle states remain distinct: `observed`, `predicted`,
  `interpolated`, `lost`, `unknown`. `lost`/`unknown` have no stale current
  coordinate; unmeasured values are not converted into zero.
- Trajectory processing has explicit segment identity. Long gaps break the
  segment; velocity is unavailable across a break. Smoothing uses video-time
  deltas; canonical observations are unchanged. Runtime trajectory working
  history is bounded separately from persisted telemetry.
- The benchmark rejects frame/timestamp conflicts and duplicate keys,
  requires spatial correctness, treats sparse annotations by source time,
  and returns unavailable metrics for insufficient GT. Python and TypeScript
  benchmark suites were exercised during closeout.
- Player MOT IDs remain separate from P1–P4 semantic identity. Player and
  shuttle-disabled regression paths were covered by the closeout suites.
- A recovery-event list can still grow with very long videos and warrants
  future profiling; no unsupported performance claim is made for it.

## Validation recorded during closeout

| Gate | Recorded result |
| --- | --- |
| Python `unittest discover -s ai_service/tests -p 'test_*.py' -q` | 429 run, 3 skipped (426 executed successfully) |
| Opt-in real-model tests | 2 passed |
| Frontend `vitest run` | 907 tests passed across 98 files |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed; the script invokes TypeScript, not a separate ESLint run |
| `npm run build` | Passed; bundle-size warning remained |
| Targeted Chromium browser tests | 3 passed |
| Live loopback HTTP probe | Web and AI status HTTP 200; model loaded |
| GitHub CI | Not run locally |

The reviewed 30-inference replay took 69.452 seconds including temporal
warm-up and decode: 0.432 inference calls per wall-clock second, about
0.0144× real time on CPU, with mean inference time 2304.47 ms. GPU
performance was not validated.

## Remaining risks and next evidence needed

The scored GT is only one second and has no reviewed absent-shuttle interval.
Broader precision, false-positive frequency, and reacquisition performance
are therefore unmeasured. The scoreboard failure is confirmed, and CPU
runtime is much slower than real time. Expand reviewed GT across rallies and
explicit `not_visible`/occluded frames, then validate false positives and
reacquisition with the corrected evaluator. Benchmark GPU separately if that
is a target runtime. Do not expose a remote AI endpoint without TLS and an
explicitly restricted CSP rule. Phase 3 requires a separate user decision.

Implementation commits: `80deb51` (`fix(security): enforce local ai service
boundary`) and `36470b8` (`test(shuttle): add reviewed real-video ground
truth`).

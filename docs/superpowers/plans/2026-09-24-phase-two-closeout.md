# Phase 2 Closeout Implementation Plan

> **For agentic workers:** Execute the security boundary, real-video annotation, and final audit in this order. The user has authorized inline execution in one task.

**Goal:** Enforce the existing local AI authentication contract, evaluate real shuttle candidates against manually reviewed frames, and issue a fresh Phase 2 decision.

**Architecture:** A focused backend security module reads and validates environment configuration; FastAPI middleware guards sensitive REST operations, and the WebSocket handler authorizes before acceptance. A small interval-specific benchmark manifest stores reviewed GT metadata; the real production-compatible model output is evaluated with the existing Phase 2.10B evaluator. The final audit uses only fresh source and test evidence.

**Tech Stack:** FastAPI, Starlette TestClient, Python unittest, OpenCV, PyTorch, React/TypeScript, Vitest, Playwright.

## Global Constraints

- Work on `refactor/scouting-core-tracking-lab`; preserve existing changes and local model/video assets.
- Use the audited RallyLens checkpoint with SHA-256 `08b7e904dae4fd5250d51cd82c4d58d1663351f32037df6aed77547065f026a5`.
- Do not commit video, model weights, or extracted frame images.
- Keep legacy direct video sources disabled by default and remote bind fail closed.
- Do not claim GT accuracy or Phase 2 completion without reviewed visual evidence.
- Do not start Phase 3 or merge branches.

---

### Task 1: Backend security configuration and enforcement

**Files:**
- Create: `ai_service/local_security.py` — parse configuration, classify loopback, validate remote bind, authenticate bearer and WebSocket credentials, classify legacy sources.
- Modify: `ai_service/server.py` — startup validation, REST guard, pre-accept WebSocket guard, legacy source policy, safe bind and log redaction.
- Test: `ai_service/tests/test_ai_security.py`.

**Interfaces:** `SecuritySettings.from_env(mapping)`, `validate_bind()`, `requires_auth`, `authorize_bearer(header)`, `authorize_websocket(headers, protocols)`, and `validate_legacy_source(source)` are used by `server.py`.

- [ ] Add failing deterministic tests for loopback/remote config, REST 401 and valid bearer, WebSocket rejection before accept, legacy source rejection, log redaction, and uploaded session lifecycle.
- [ ] Run `python -m unittest ai_service.tests.test_ai_security -v` and confirm the tests fail on current behavior.
- [ ] Implement the minimal configuration module and FastAPI boundary; preserve public `GET /api/status` while guarding `GET /api/capabilities` and all other `/api` routes.
- [ ] Update frontend capability requests and connection probing to send the existing runtime bearer credential; run focused frontend connection tests.
- [ ] Run focused security and upload tests, then commit `fix(security): enforce local ai service boundary`.

### Task 2: Reviewed real-video GT

**Files:**
- Create: a small interval-specific benchmark JSON file under `ai_service/benchmarks/` and a source-linked validation report under `docs/`.
- Test: existing `ai_service/tests/test_shuttle_benchmark.py` and GT schema validation; add a focused test only if the new dataset exposes a measurable contract gap.

- [ ] Confirm local video and checkpoint SHA; choose a 5–10 second rally interval from source frames.
- [ ] Inspect 30–60 distributed decoded frames independently of model predictions and record manual visible/not-visible/occluded coordinates or unknown values.
- [ ] Validate the annotation schema and completeness scope for only the reviewed interval.
- [ ] Run the actual RallyLens pipeline on the exact interval; align predictions with reviewed GT and calculate only supported metrics.
- [ ] Inspect stationary and scoreboard-region predictions against frames, document examples, and commit `test(shuttle): add reviewed real-video ground truth` without media assets.

### Task 3: Final re-audit

**Files:** No production edits unless the GT identifies a small independently verified correctness defect.

- [ ] Recheck model artifact/forward inference, upload→results→frontend transport, auth boundary, telemetry, recovery, trajectory, benchmark, player invariants, and performance.
- [ ] Run Python, opt-in real-model, backend security, benchmark, frontend, TypeScript, build, and targeted browser gates. Record skipped or unavailable gates explicitly.
- [ ] Report one quality classification, one final Phase 2 decision, Phase 3 readiness, remaining risks, and commit SHAs. Stop after the report.

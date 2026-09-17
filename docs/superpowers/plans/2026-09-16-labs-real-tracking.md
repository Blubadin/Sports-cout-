# Labs and real tracking repair

**Goal:** Repair the user-approved missing Labs menu and disconnected body detection using the existing tracking architecture.

**Design:** Keep Classic preferences; provide a visible Labs tab in Classic and keep the existing Workstation menu. Upload local video bytes into a session-owned temporary file. Calibrate on actual video pixels; use detector assignments rather than fabricated player boxes. Run ByteTrack and ROI pose inference, publish measured confidence and 2D pose, and overlay results at the matching video time. Offline failures must not trigger simulation.

**Scope:** Current refactor checkout. No redesign or changes to unrelated sports. Explicit demo API remains available. Local frontend and AI backend must both be reachable at delivery.

- [ ] Add failing browser regression for Classic Labs access; expose the tab and verify desktop/narrow layouts.
- [ ] Add backend regressions for upload lifecycle, measured detection confidence, ByteTrack IDs and observed ROI pose; connect production inference and remove silent fallback.
- [ ] Repair Lab file upload, real calibration, error/cancel lifecycle and synchronized pose overlay; test missing file/backend and coordinate alignment.
- [ ] Verify typecheck, frontend tests, Python tests, build and browser smoke checks. Run actual local model inference and document its limits.
- [ ] Start both local services in hidden background processes, verify HTTP responses, and provide the local URL.

# Pilot RC And Pilot Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare SPORTSCOUT for hardware QA and a privacy-safe coach pilot without claiming unperformed physical or user tests.

**Architecture:** Keep QA evidence outside project scouting data. A pure TypeScript evaluator consumes a versioned evidence file and produces a deterministic release decision; Playwright covers browser/viewports while physical hardware and real-user results remain explicit evidence entries.

**Tech Stack:** React 19, TypeScript, Vitest, Playwright, Vite PWA, IndexedDB.

## Global Constraints

- Export schema remains `1.1` and core scouting types remain backward compatible.
- Controller V1 remains opt-in until the hardware gate passes.
- No backend, login, cloud sync, raw device identifier, participant name, or raw video is added.
- PS4, PS5, and Xbox must be tested through USB and Bluetooth on Chrome and Edge before Pilot RC approval.

---

### Task 1: Pilot Readiness Evaluator

**Files:**
- Create: `src/pilot/pilotReadiness.ts`
- Test: `src/__tests__/pilot/pilotReadiness.test.ts`

**Interfaces:**
- Produces: `createPilotEvidenceTemplate()` and `evaluatePilotReadiness(evidence)`.

- [ ] Write tests for an empty blocked gate, a complete passing matrix, and failed hardware evidence.
- [ ] Run the focused Vitest test and confirm it fails because the module does not exist.
- [ ] Implement immutable required-case generation and threshold evaluation.
- [ ] Run the focused Vitest test and confirm all cases pass.

### Task 2: Pilot Evidence Command And Protocol

**Files:**
- Create: `scripts/check-pilot-readiness.ts`
- Create: `docs/pilot/pilot-evidence.json`
- Create: `docs/pilot/HARDWARE_QA_TH.md`
- Create: `docs/pilot/COACH_PILOT_PROTOCOL_TH.md`
- Create: `docs/pilot/PILOT_FEEDBACK_FORM_TH.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: `evaluatePilotReadiness`.
- Produces: `npm run pilot:readiness` with exit code `1` while required evidence is pending or failed.

- [ ] Generate a versioned pending evidence file with no personal identifiers.
- [ ] Add a command that prints missing/failed gates and exits `1` until Pilot-ready.
- [ ] Document exact USB/Bluetooth, browser, viewport, endurance, recovery, and observer procedures.
- [ ] Verify the pending template reports blocked rather than passed.

### Task 3: Browser Acceptance Matrix

**Files:**
- Modify: `e2e/pilot-packaging.spec.ts`

**Interfaces:**
- Produces: automated evidence for four sports, Controller Settings visibility, and target viewport containment.

- [ ] Add four-sport project opening checks.
- [ ] Add Controller V1 default opt-in check.
- [ ] Add 1366x768, 1920x1080, tablet landscape, and phone landscape checks.
- [ ] Run Playwright and confirm all scenarios pass.

### Task 4: Overall Audit And GridGeist Usage

**Files:**
- Create: `docs/pilot/OVERALL_READINESS_AUDIT_TH.md`
- Create: `docs/GRIDGEIST_USAGE_TH.md`
- Modify: `README.md`

**Interfaces:**
- Produces: confirmed-vs-pending readiness report and paste-ready `$gridgeist` prompts for SPORTSCOUT.

- [ ] Review rendered desktop and mobile interfaces using the installed GridGeist checklist.
- [ ] Record confirmed automated evidence, residual risks, and physical/user blockers.
- [ ] Document Review, Redesign, HUD, Field Map, and Controller Settings prompts.
- [ ] Run lint, unit tests, icons, build, Playwright, and diff checks.

# HUD Toolbar Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Workstation command bar the only visible HUD entry point while preserving Classic-mode access and all HUD behavior.

**Architecture:** Keep the existing `toggle-hud-mode` event as the single behavior path. Add presentation-only visibility props to the two shared components that render duplicate controls, and remove the Workstation left-rail duplicate at its source. `App` supplies the Workstation/Classic visibility decision so Classic remains unchanged.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Vite/Tailwind utility classes.

## Global Constraints

- Preserve the professional high-density dark workstation UI and existing Workstation/Classic behavior.
- Keep the command-bar HUD action wired to `toggle-hud-mode`.
- Do not change HUD runtime, keyboard shortcuts, controller bindings, settings, persistence, or tracking logic.
- Work only on `refactor/scouting-core-tracking-lab`; do not modify `main`.
- After the phase, run TypeScript checks, ESLint/repository lint, Vitest, and Python unit tests with zero regressions.

## File Map

- Modify `src/App.tsx`: pass Workstation-specific presentation flags and stop wiring the removed left-rail HUD callback.
- Modify `src/components/workstation/WorkstationChrome.tsx`: remove the duplicate HUD rail action and callback prop.
- Modify `src/components/VideoPlayer.tsx`: add an opt-out presentation prop for the standard transport-row HUD button.
- Modify `src/components/InputPanel.tsx`: add an opt-out presentation prop for the scouting-console HUD button.
- Create `src/__tests__/workstation/WorkstationChrome.test.tsx`: verify command-bar retention and left-rail duplicate removal.
- Create `src/__tests__/hud/HudEntryPointVisibility.test.tsx`: verify the shared component visibility contract with lightweight mocks.

### Task 1: Lock the visible-entry contract with focused tests

**Files:**
- Create: `src/__tests__/workstation/WorkstationChrome.test.tsx`
- Create: `src/__tests__/hud/HudEntryPointVisibility.test.tsx`

**Interfaces:**
- Consumes: existing `WorkstationCommandBar`, `WorkstationLeftRail`, `VideoPlayer`, and `InputPanel` component props.
- Produces: executable assertions that the command bar retains HUD, the left rail no longer exposes HUD, and the shared controls honor `showHudToggle`.

- [ ] **Step 1: Write the failing Workstation chrome tests**

  Render `WorkstationCommandBar` with no-op callbacks and assert its button named `HUD Mode` exists. Render `WorkstationLeftRail` with no-op callbacks and assert there is no button named `HUD`, while the `FS` control remains. The left-rail test should not depend on visual CSS.

- [ ] **Step 2: Run the focused chrome test and verify it fails**

  Run:

  ```powershell
  npm test -- --run src/__tests__/workstation/WorkstationChrome.test.tsx
  ```

  Expected: the command-bar assertion passes and the left-rail assertion fails because the current rail still renders its HUD button.

- [ ] **Step 3: Write the shared visibility tests**

  Mock the context and heavyweight child dependencies used by `VideoPlayer` and `InputPanel`, then assert the new presentation prop controls only the HUD button: `showHudToggle={false}` hides it and the default/`true` value keeps it. Keep the tests focused on the button label/accessible name and avoid asserting unrelated controls.

- [ ] **Step 4: Run the shared visibility test and verify it fails**

  Run:

  ```powershell
  npm test -- --run src/__tests__/hud/HudEntryPointVisibility.test.tsx
  ```

  Expected: TypeScript/test failure because the new `showHudToggle` props do not exist yet.

### Task 2: Remove duplicate Workstation HUD presentation

**Files:**
- Modify: `src/components/workstation/WorkstationChrome.tsx`
- Modify: `src/components/VideoPlayer.tsx`
- Modify: `src/components/InputPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: the failing tests from Task 1 and the existing `toggle-hud-mode` event contract.
- Produces: Workstation with one visible HUD button in `WorkstationCommandBar`; Classic with its current HUD controls.

- [ ] **Step 1: Remove the left-rail HUD prop and button**

  Delete `onToggleHUD?: () => void` from `WorkstationLeftRailProps`, remove it from the destructured parameters, and remove the HUD button in the bottom action group. Keep the fullscreen button and its existing callback unchanged.

- [ ] **Step 2: Add a presentation-only prop to `VideoPlayer`**

  Extend `VideoPlayerProps` with `showHudToggle?: boolean`. Destructure it with a default of `true`, then guard only the existing standard transport-row HUD button with that flag. Keep `enterHUDMode` and the event listeners untouched.

- [ ] **Step 3: Add a presentation-only prop to `InputPanel`**

  Add `showHudToggle?: boolean` to the component props with a default of `true`. Guard only the existing scouting-console HUD button with that flag; do not change the keyboard event handling or context behavior.

- [ ] **Step 4: Pass the Workstation decision from `App`**

  Remove `onToggleHUD` from the `WorkstationLeftRail` call. Pass `showHudToggle={!isWorkstation}` to `VideoPlayer` and `InputPanel`. Leave `WorkstationCommandBar`'s `onToggleHUD` callback intact so it remains the sole Workstation entry point.

- [ ] **Step 5: Run focused tests and verify they pass**

  Run:

  ```powershell
  npm test -- --run src/__tests__/workstation/WorkstationChrome.test.tsx src/__tests__/hud/HudEntryPointVisibility.test.tsx
  ```

  Expected: all focused assertions pass.

### Task 3: Run phase verification and commit

**Files:**
- Modify: only the files listed in Tasks 1–2.

**Interfaces:**
- Consumes: the completed implementation and focused tests.
- Produces: a verified commit on `refactor/scouting-core-tracking-lab`.

- [ ] **Step 1: Inspect the diff for scope**

  Run:

  ```powershell
  git diff --check
  git diff --stat
  git status --short
  ```

  Expected: no whitespace errors and no unrelated files.

- [ ] **Step 2: Run TypeScript/lint verification**

  Run:

  ```powershell
  npm run lint
  ```

  Expected: TypeScript exits with code 0. This is the repository's configured lint/check command.

- [ ] **Step 3: Run the complete Vitest suite**

  Run:

  ```powershell
  npm test -- --run
  ```

  Expected: all tests pass.

- [ ] **Step 4: Run Python unit tests**

  Run:

  ```powershell
  $pyTests = Get-ChildItem -Path . -Recurse -File -Filter 'test_*.py' | Select-Object -ExpandProperty FullName
  if ($pyTests) { python -m pytest $pyTests } else { Write-Output 'No Python unit tests found.' }
  ```

  Expected: all discovered Python tests pass, or the command reports that none exist.

- [ ] **Step 5: Commit the completed phase**

  Run:

  ```powershell
  git add src/App.tsx src/components/workstation/WorkstationChrome.tsx src/components/VideoPlayer.tsx src/components/InputPanel.tsx src/__tests__/workstation/WorkstationChrome.test.tsx src/__tests__/hud/HudEntryPointVisibility.test.tsx
  git commit -m "refactor: reduce duplicate workstation HUD controls"
  git rev-parse --short HEAD
  ```

  Expected: one commit containing only this HUD-surface change, followed by its short SHA for the user report.

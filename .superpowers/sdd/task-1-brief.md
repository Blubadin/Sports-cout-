# Task 1: Complete Checkpoint 5-6

## Goal
Finish the existing uncommitted Pro HUD Area and Workstation Inspector WIP without changing scouting data behavior.

## Existing WIP
- `src/components/hud/ProAreaCommandPad.tsx`
- `src/utils/proAreaLayout.ts`
- `src/__tests__/utils/proAreaLayout.test.ts`
- `e2e/hud-area.spec.ts`
- `src/components/workstation/WorkstationInspector.tsx`
- `src/App.tsx`
- `src/index.css`
- `e2e/workstation.spec.ts`

## Requirements
1. Pro HUD area/out-zone controls stay inside the court pad for Volleyball, Football, Badminton, and Basketball.
2. `proAreaLayout` must be used by production rendering as the shared out-zone layout contract, not only by tests. Keep existing saved `outZone` values backward compatible.
3. Preserve hold `W`, pointer aim, release, Escape cancel, keyboard/gamepad commands, flip-court semantics, and minimum 44px interactive targets.
4. Workstation Inspector reads `currentAction`, validation, and video time from existing `ScoutContext`; it must not create parallel state or validation logic.
5. Inspector copy must work in Thai and English, expose status without relying on color alone, and avoid overflow.
6. Inspector is visible only in Workstation at widths >=1280px. At 1024-1279 Workstation remains 7/5; Classic and phone layouts remain unchanged.
7. Add focused unit/E2E coverage for empty/incomplete/valid Inspector states, TH/EN copy, responsive visibility, and four-sport HUD area bounds.
8. Do not change `Action`, `EventRow`, export schema, storage, analytics, or controller command behavior.

## Validation
Run focused tests first, then:

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run check-icons
npm.cmd run build
npx.cmd playwright test
```

Check rendered Workstation at 1366x768 and 1920x1080 for unintended horizontal overflow.

## Working Rules
- Follow TDD for missing behavior.
- Work with existing edits and do not revert unrelated changes.
- Do not commit; the coordinating agent will review and commit.
- Write the completion report to `.superpowers/sdd/task-1-report.md`.

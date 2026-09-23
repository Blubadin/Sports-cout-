# HUD Toolbar Reduction Design

## Objective

Reduce repeated HUD entry points in the Workstation layout so the interface has one obvious HUD action without removing HUD behavior or keyboard access.

## Scope

In Workstation mode, keep the HUD action in `WorkstationCommandBar` as the single visible entry point. Hide the duplicate HUD controls in:

- `WorkstationLeftRail`
- the standard `VideoPlayer` transport row
- the `InputPanel` scouting-console header

Classic mode keeps its existing HUD entry points because it does not render the Workstation command bar.

## Interaction and behavior

- The command-bar HUD button continues to dispatch `toggle-hud-mode`.
- Keyboard shortcuts and controller/HUD runtime behavior are unchanged.
- Fullscreen remains available in the Workstation left rail.
- No settings, persisted data, or HUD component state is changed.
- The visible reduction is conditional on Workstation mode so existing Classic-mode access is preserved.

## Implementation shape

1. Remove the HUD action from the Workstation left-rail action group and its now-unused prop wiring.
2. Add an explicit `showHudToggle`/equivalent presentation prop to `VideoPlayer` and `InputPanel`, defaulting to the current behavior for compatibility.
3. Pass the prop from `App` based on `isWorkstation`.
4. Preserve the command-bar action as the Workstation source of entry.

## Validation

- Add or update focused component coverage for the Workstation HUD entry point and duplicate-control suppression.
- Run TypeScript checking, ESLint (the repository's lint command), Vitest, and Python unit tests.
- Inspect the final diff to ensure only the HUD presentation surface changed.

## Acceptance criteria

- Workstation shows exactly one visible HUD button, in the command bar.
- Classic mode still exposes its existing HUD controls.
- Clicking the remaining Workstation HUD button opens HUD mode as before.
- No unrelated toolbar, timeline, or scouting controls are removed.
- Required verification commands pass with no regressions.

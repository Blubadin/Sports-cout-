# Volleyball HUD Out-of-Bounds Layout Fix

## Problem

The volleyball Pro HUD Area Wheel displays only one bottom out-of-bounds segment (`own_back_out`). The canonical volleyball geometry and pointer resolver instead distinguish two bottom zones: `back_left` and `back_right`. This makes the visible wheel incomplete and prevents its selected-state display from matching the area produced by pointer aiming.

## Approved outcome

The volleyball wheel must show eight outside-court zones:

- Top: `opp_back_left`, `opp_back_right`
- Left: `side_left_far`, `side_left_near`
- Right: `side_right_far`, `side_right_near`
- Bottom: `back_left`, `back_right`

The existing hold-W, aim, and release interaction remains unchanged. Football, badminton, basketball, court flipping, and the inner-court zones are outside this change.

## Approaches considered

1. **Align the visual layout with canonical volleyball geometry (selected).** Replace the single bottom `own_back_out` item with `back_left` and `back_right`. This is the smallest change and preserves the more precise data already produced by the resolver.
2. Collapse the resolver to one generic `own_back_out` zone. This would make the display match but discard left/right detail and conflict with the volleyball sport template.
3. Generate all Pro HUD lanes directly from the geometry specification. This could reduce future duplication but is a larger architectural change than this bug requires.

## Implementation

Update only the volleyball entry in `src/utils/proAreaLayout.ts`. Add a regression assertion in `src/__tests__/utils/proAreaLayout.test.ts` that expects the complete eight-zone sequence and specifically verifies two bottom zones. Do not change the pointer resolver because it already returns `back_left` and `back_right` correctly.

## Verification

1. Run the focused Pro HUD area-layout test and observe it fail before the production change.
2. Apply the minimal layout change and rerun the focused test.
3. Run the full unit test suite, TypeScript lint, and production build.
4. Open the volleyball Area Wheel on localhost and confirm two separate bottom segments appear and highlight consistently when aiming bottom-left and bottom-right.

## Success criteria

- Eight volleyball outside-court segments are represented in the Pro HUD layout.
- Bottom-left resolves and highlights `back_left`.
- Bottom-right resolves and highlights `back_right`.
- Existing layouts for the other three sports are unchanged.
- No test, type-check, or build regression is introduced.

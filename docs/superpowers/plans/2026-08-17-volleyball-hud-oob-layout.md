# Volleyball HUD Out-of-Bounds Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the volleyball Pro HUD Area Wheel display the same eight out-of-bounds zones that its pointer resolver can select.

**Architecture:** Keep the canonical pointer resolver and sport geometry unchanged. Correct only the volleyball presentation layout so its bottom lane exposes `back_left` and `back_right`, and lock the contract with a focused regression test.

**Tech Stack:** TypeScript, React 19, Vitest 4, Vite 6

## Global Constraints

- Preserve the hold-W, aim, and release interaction.
- Do not change football, badminton, basketball, court flipping, or inner-court zones.
- Use the canonical volleyball out-zone identifiers already returned by `resolveAreaSelectionFromPoint`.
- Make the smallest production change that satisfies the regression test.

---

### Task 1: Lock and correct the volleyball Pro HUD out-zone contract

**Files:**
- Modify: `src/__tests__/utils/proAreaLayout.test.ts:22`
- Modify: `src/utils/proAreaLayout.ts:32`

**Interfaces:**
- Consumes: `getProAreaOutZoneLayout(sportType: SportType): ProAreaOutZoneLayout`
- Produces: A volleyball layout whose `top`, `left`, `right`, and `bottom` arrays collectively contain the eight canonical volleyball out-zone identifiers.

- [ ] **Step 1: Write the failing regression test**

Change the volleyball expected-zone list and add a focused bottom-lane assertion:

```ts
['volleyball', [
  'opp_back_left',
  'opp_back_right',
  'side_left_far',
  'side_left_near',
  'side_right_far',
  'side_right_near',
  'back_left',
  'back_right',
]],
```

```ts
it('splits the volleyball near baseline into left and right out zones', () => {
  const layout = getProAreaOutZoneLayout('volleyball');

  expect(layout.bottom.map(item => item.outZone)).toEqual(['back_left', 'back_right']);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npm.cmd run test -- src/__tests__/utils/proAreaLayout.test.ts
```

Expected: FAIL because the current layout returns `['own_back_out']` instead of `['back_left', 'back_right']`.

- [ ] **Step 3: Implement the minimal production fix**

Replace the volleyball bottom lane in `PRO_AREA_OUT_ZONE_LAYOUTS` with:

```ts
bottom: [
  item('volleyball', 'back-left', 'back_left'),
  item('volleyball', 'back-right', 'back_right'),
],
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```powershell
npm.cmd run test -- src/__tests__/utils/proAreaLayout.test.ts
```

Expected: the test file passes with 12 tests and zero failures.

- [ ] **Step 5: Commit the focused fix**

```powershell
git add -- src/__tests__/utils/proAreaLayout.test.ts src/utils/proAreaLayout.ts
git commit -m "fix: complete volleyball HUD out zones"
```

---

### Task 2: Verify the complete change

**Files:**
- Verify only: `src/__tests__/utils/proAreaLayout.test.ts`
- Verify only: `src/utils/proAreaLayout.ts`

**Interfaces:**
- Consumes: The corrected `getProAreaOutZoneLayout('volleyball')` result.
- Produces: Verification evidence that the focused fix introduces no type, unit-test, or production-build regression.

- [ ] **Step 1: Run all unit tests**

```powershell
npm.cmd run test
```

Expected: all test files and tests pass.

- [ ] **Step 2: Run the TypeScript lint gate**

```powershell
npm.cmd run lint
```

Expected: `tsc --noEmit` exits with code 0.

- [ ] **Step 3: Run the production build**

```powershell
npm.cmd run build
```

Expected: Vite completes the production build with exit code 0.

- [ ] **Step 4: Inspect the localhost Area Wheel**

Open the existing volleyball project, enter HUD mode, hold `W`, and verify that the bottom boundary is split into two visible segments. Aim bottom-left and bottom-right and confirm the footer reports `ออกหลัง (ซ้าย)` and `ออกหลัง (ขวา)` respectively.

- [ ] **Step 5: Confirm the final diff scope**

```powershell
git status --short
git show --stat --oneline HEAD
```

Expected: the implementation commit contains only the regression test and volleyball layout file; the worktree has no unexpected changes.

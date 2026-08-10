# SPORTSCOUT Stabilization Before Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a buildable, data-safe SPORTSCOUT worktree that protects existing projects and can be verified before pilot work resumes.

**Architecture:** Preserve IndexedDB as the local-first source of truth, but make initialization explicitly migrate `scout-projects:v1.1` into the revisioned v1.2 envelope. Route every project-list mutation through the existing FIFO operation queue, deriving its next list only when queued work executes. Keep the report/calibration work coherent with types and accessible UI while preserving legacy recovery data.

**Tech Stack:** React 19, TypeScript 5.8, Vite, Vitest, Playwright, IndexedDB via `idb-keyval`, BroadcastChannel/storage-event synchronization.

## Global Constraints

- Work in `C:\Users\Sport-Science-R3909\Documents\GitHub\Sports-cout-worktrees\security-pwa-pilot-v1` on `feature/typography-area-geometry-v1`.
- Do not reset, checkout away, delete, or overwrite unrelated uncommitted changes.
- Keep IndexedDB and legacy localStorage recovery data through the pilot; never delete the v1.1 record during migration.
- Preserve schema 1.1 export compatibility while project repository storage uses its revisioned v1.2 envelope.
- Do not add backend, login, cloud sync, Electron/Tauri, or real-time AI.
- Every product-code behavior change starts with a failing deterministic test and is committed in its own focused commit.
- Do not reduce Playwright workers, weaken assertions, update snapshots, or skip a failing gate.
- Run `git diff --check`, lint, unit tests, icon validation, build, and Playwright before claiming completion.

---

### Task 1: Repair the accidental commit and preserve a clean worktree boundary

**Files:**
- Modify: `src/components/VideoPlayer.tsx` (restore exactly to `799eab0^`)
- Modify: `docs/superpowers/specs/2026-08-03-sportscout-stabilization-design.md:3` (remove Markdown trailing whitespace)
- Create: `docs/superpowers/plans/2026-08-03-stabilization-before-pilot.md`

**Interfaces:**
- Consumes: `799eab0^:src/components/VideoPlayer.tsx`, the last known good calibration UI.
- Produces: a follow-up commit that removes only the unintended staged VideoPlayer refactor while retaining the stabilization design.

- [ ] **Step 1: Capture the exact repair baseline**

Run:

```powershell
$git = 'C:\Users\Sport-Science-R3909\AppData\Local\GitHubDesktop\app-3.6.3\resources\app\git\cmd\git.exe'
& $git -C . status --short --branch
& $git -C . show --stat --oneline 799eab0
& $git -C . diff 799eab0^ 799eab0 -- src/components/VideoPlayer.tsx
```

Expected: `799eab0` contains the plan document and the unintended `VideoPlayer.tsx` change; other current worktree modifications remain unstaged.

- [ ] **Step 2: Restore only the unintended VideoPlayer content**

Run:

```powershell
& $git -C . restore --source=799eab0^ --staged --worktree -- src/components/VideoPlayer.tsx
```

Expected: calibration UI imports, state, and `CourtZoneOverlay` caller match the parent revision; unrelated `App`, `Dashboard`, `CourtZoneOverlay`, and workstation edits remain unchanged.

- [ ] **Step 3: Correct the design-document whitespace**

Change the metadata line to exactly:

```markdown
Date: 2026-08-03
```

Do not use trailing spaces for Markdown line breaks in tracked project files.

- [ ] **Step 4: Verify the repair before commit**

Run:

```powershell
& $git -C . add docs/superpowers/specs/2026-08-03-sportscout-stabilization-design.md
& $git -C . diff --check --cached
& $git -C . diff --cached -- src/components/VideoPlayer.tsx docs/superpowers/specs/2026-08-03-sportscout-stabilization-design.md
npm.cmd test -- src/__tests__/utils/courtHomography.test.ts
```

Expected: the staged diff reverts only the accidental VideoPlayer change plus the design-document whitespace; homography tests pass.

- [ ] **Step 5: Commit the repair only**

```powershell
& $git -C . add src/components/VideoPlayer.tsx docs/superpowers/specs/2026-08-03-sportscout-stabilization-design.md
& $git -C . commit -m 'fix: restore court calibration player integration'
```

Expected: one follow-up commit; all pre-existing uncommitted report/workstation/spike files remain uncommitted.

### Task 2: Add an idempotent v1.1 IndexedDB migration

**Files:**
- Modify: `src/utils/projectRepository.ts:8-107`
- Modify: `src/__tests__/utils/projectRepository.test.ts`

**Interfaces:**
- Consumes: `StorageAdapter.getItem(key)`, `StorageAdapter.setItem(key, value)`, `executeProjectWriteExclusively`.
- Produces: `PROJECTS_LEGACY_REPOSITORY_KEY = 'scout-projects:v1.1'` and an `initializeWithRevision()` path that preserves and exposes valid v1.1 projects as a v1.2 envelope.

- [ ] **Step 1: Write a failing migration test**

Add a test that seeds only the old key and verifies both returned state and recovery behavior:

```ts
it('migrates a v1.1 IndexedDB envelope without losing projects', async () => {
  const legacyProject = createMockProject({ id: 'v1-legacy' });
  const legacyEnvelope = {
    schemaVersion: '1.1',
    revision: 4,
    updatedAt: '2026-07-01T00:00:00.000Z',
    projects: [legacyProject],
  };
  const { adapter, values } = createMemoryAdapter({
    [PROJECTS_LEGACY_REPOSITORY_KEY]: legacyEnvelope,
  });

  const state = await createProjectRepository(adapter).initializeWithRevision([]);

  expect(state).toEqual({ projects: [legacyProject], revision: 4 });
  expect(values.get(PROJECTS_BACKUP_KEY)).toEqual([legacyProject]);
  expect(values.get(PROJECTS_REPOSITORY_KEY)).toMatchObject({
    schemaVersion: '1.2', revision: 4, projects: [legacyProject],
  });
  expect(values.get(PROJECTS_LEGACY_REPOSITORY_KEY)).toEqual(legacyEnvelope);
});
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```powershell
npm.cmd test -- src/__tests__/utils/projectRepository.test.ts
```

Expected: FAIL because `PROJECTS_LEGACY_REPOSITORY_KEY` and the v1.1 read path do not exist.

- [ ] **Step 3: Implement the minimal migration path**

Add the legacy key constant beside `PROJECTS_REPOSITORY_KEY`:

```ts
export const PROJECTS_LEGACY_REPOSITORY_KEY = 'scout-projects:v1.1';
```

Inside `initializeWithRevision()`, after confirming there is no valid v1.2 envelope and before using `legacyProjects`, read the legacy key, normalize its projects, then persist recovery and v1.2 in this order:

```ts
const legacyStored = await adapter.getItem(PROJECTS_LEGACY_REPOSITORY_KEY);
const legacyEnvelope = legacyStored as Partial<ProjectRepositoryEnvelope> | null;
const migratedProjects = normalizeProjects(
  legacyEnvelope && typeof legacyEnvelope === 'object' && !Array.isArray(legacyEnvelope)
    ? legacyEnvelope.projects
    : legacyStored,
);

if (migratedProjects.length > 0) {
  const revision = getRevision(legacyEnvelope);
  await adapter.setItem(PROJECTS_BACKUP_KEY, migratedProjects);
  const envelope = createEnvelope(migratedProjects, revision);
  await adapter.setItem(PROJECTS_REPOSITORY_KEY, envelope);
  return { projects: migratedProjects, revision };
}
```

Keep the v1.1 key untouched. Add a second test that a valid v1.2 envelope wins over v1.1 and a third test that a failed v1.2 write leaves the v1.1 value readable.

- [ ] **Step 4: Verify GREEN and regression coverage**

Run:

```powershell
npm.cmd test -- src/__tests__/utils/projectRepository.test.ts
npm.cmd run lint
```

Expected: all repository tests and TypeScript pass for this task's change.

- [ ] **Step 5: Commit the migration**

```powershell
& $git -C . add src/utils/projectRepository.ts src/__tests__/utils/projectRepository.test.ts
& $git -C . commit -m 'fix: migrate legacy IndexedDB project envelopes'
```

### Task 3: Restore a buildable VideoPlayer and reapply only court-overlay integration

**Files:**
- Modify: `src/components/VideoPlayer.tsx`
- Test: `npm.cmd run lint`

**Interfaces:**
- Consumes: the last known buildable `66358f8:src/components/VideoPlayer.tsx`, `CourtZoneOverlay`, and `updateProjectVideoCalibration` from `WorkspaceContext`.
- Produces: a parseable `VideoPlayer` that retains the existing player controls and restores only the court-calibration integration intended by `a45e52b`.

- [ ] **Step 1: Reproduce the compiler failure (RED)**

Run:

```powershell
npm.cmd run lint
```

Expected: FAIL with duplicate-import syntax errors near line 17 and unmatched JSX near line 861 of `VideoPlayer.tsx`.

- [ ] **Step 2: Reconstruct from the last known buildable file**

Restore the pre-broken player body without touching unrelated working-tree files:

```powershell
& $git -C . restore --source=66358f8 --staged --worktree -- src/components/VideoPlayer.tsx
```

Then reapply only these four additions from the intended calibration feature:

```ts
import CourtZoneOverlay from './video/CourtZoneOverlay';

const [showCourtOverlay, setShowCourtOverlay] = useState(false);
const [isCalibratingCourt, setIsCalibratingCourt] = useState(false);

const { activeProjectId, projects, updateProjectLastVideoTime, updateProjectVideoCalibration } = useWorkspace();
```

Place the overlay immediately inside the relative video container, after gesture feedback and before loading/error layers:

```tsx
<CourtZoneOverlay
  isVisible={showCourtOverlay || isCalibratingCourt}
  isCalibrating={isCalibratingCourt}
  calibrationPoints={activeProject?.videoMeta?.courtCalibration}
  onCalibrationComplete={(points) => {
    if (points.length === 4) {
      updateProjectVideoCalibration({
        tl: points[0], tr: points[1], bl: points[2], br: points[3],
      });
    }
    setIsCalibratingCourt(false);
    setShowCourtOverlay(true);
  }}
  onCalibrationCancel={() => {
    setIsCalibratingCourt(false);
    setShowCourtOverlay(Boolean(activeProject?.videoMeta?.courtCalibration));
  }}
/>
```

Do not copy the malformed duplicate imports or truncated JSX from `a45e52b`.

- [ ] **Step 3: Verify GREEN**

Run:

```powershell
npm.cmd run lint
npm.cmd test -- src/__tests__/utils/courtHomography.test.ts
& $git -C . diff --check -- src/components/VideoPlayer.tsx
```

Expected: lint is no longer blocked by `VideoPlayer`; the four homography tests pass; the VideoPlayer diff contains only the court-overlay integration relative to `66358f8`.

- [ ] **Step 4: Commit the isolated reconstruction**

```powershell
& $git -C . add src/components/VideoPlayer.tsx
& $git -C . commit -m 'fix: restore buildable video player with calibration overlay'
```

### Task 4: Add an idempotence regression test for completed migration

**Files:**
- Modify: `src/__tests__/utils/projectRepository.test.ts`

**Interfaces:**
- Consumes: `PROJECTS_LEGACY_REPOSITORY_KEY`, `PROJECTS_REPOSITORY_KEY`, `PROJECTS_BACKUP_KEY`, and `initializeWithRevision()`.
- Produces: a regression test proving a second initialization reads the migrated v1.2 envelope without re-writing the backup or v1.2 state.

- [ ] **Step 1: Add a repeat-initialization regression case**

Extend the in-memory adapter helper to record writes, then add:

```ts
it('does not rewrite migration state on a second initialization', async () => {
  const legacyProject = createMockProject({ id: 'idempotent-v1' });
  const { adapter, writes } = createMemoryAdapter({
    [PROJECTS_LEGACY_REPOSITORY_KEY]: {
      schemaVersion: '1.1', revision: 2, updatedAt: '2026-07-01T00:00:00.000Z',
      projects: [legacyProject],
    },
  });
  const repository = createProjectRepository(adapter);

  await repository.initializeWithRevision([]);
  const writesAfterMigration = [...writes];
  const second = await repository.initializeWithRevision([]);

  expect(second).toEqual({ projects: [legacyProject], revision: 2 });
  expect(writes).toEqual(writesAfterMigration);
});
```

- [ ] **Step 2: Verify the existing implementation satisfies the regression**

Run:

```powershell
npm.cmd test -- src/__tests__/utils/projectRepository.test.ts
```

Expected: PASS. This task intentionally adds a regression test for an already-correct code path identified by review; it does not modify production migration code.

- [ ] **Step 3: Commit the regression test**

```powershell
& $git -C . add src/__tests__/utils/projectRepository.test.ts
& $git -C . commit -m 'test: cover idempotent project migration'
```

### Task 5: Serialize project mutations and enforce unique import identities

**Files:**
- Modify: `src/context/WorkspaceContext.tsx:331-695`
- Modify: `src/__tests__/context/WorkspaceContext.test.tsx`
- Modify: `src/utils/projectRepository.ts`
- Modify: `src/__tests__/utils/projectRepository.test.ts`

**Interfaces:**
- Consumes: `projectOperationQueueRef.current.enqueue`, `projectsRef.current`, `persistProjects`, `snapshotCurrentProjectRef`.
- Produces: `enqueueProjectMutation(mutate, options)` internal helper; unique project-ID validation before repository save; queued create/delete/rename/duplicate/import/video-time/calibration mutations.

- [ ] **Step 1: Write failing FIFO-persistence race tests**

Replace the current delete/rename test's eventual-autosave assertion with an assertion that the first deferred delete save reflects the state at the delete operation's queue turn. After that save has started, each later accepted mutation must receive its own immediate FIFO persistence (a later mutation cannot safely amend an IndexedDB payload that has already been handed to storage):

```ts
deleteSave.resolve(savedEnvelope([{
  ...initialProjects[0],
  title: 'Renamed A',
}]));

await waitFor(() => {
  const firstSave = persistence.session.save.mock.calls[0][0];
  expect(firstSave).toEqual([
    expect.objectContaining({ id: 'A' }),
  ]);
});
```

Then release the deferred delete write and assert the subsequent queued save contains the later rename. Add equivalent focused cases for import and `lastVideoTime`; assert no debounce timer emits a stale follow-up. Add a duplicate-import case:

```ts
workspace?.importProject(createProject('A'));
workspace?.importProject(createProject('A'));
expect(new Set(workspace?.projects.map(project => project.id)).size)
  .toBe(workspace?.projects.length);
```

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```powershell
npm.cmd test -- src/__tests__/context/WorkspaceContext.test.tsx
```

Expected: direct mutations following the delete are debounced or use stale pre-queue snapshots; duplicate import either duplicates the ID or proves the test setup needs a collision payload.

- [ ] **Step 3: Implement one queue-owned mutation helper**

Define a private helper near `flushPendingSavesInQueue`:

```ts
const enqueueProjectMutation = (
  mutate: (current: ScoutProject[]) => ScoutProject[],
  { persist = true, afterCommit }: {
    persist?: boolean;
    afterCommit?: (next: ScoutProject[]) => void;
  } = {},
) => projectOperationQueueRef.current.enqueue(async () => {
  if (!repositoryReadyRef.current || !acceptingProjectOperationsRef.current) return;
  const nextProjects = mutate(projectsRef.current);
  if (persist) {
    explicitlyPersistedProjectsRef.current = nextProjects;
    await persistProjects(nextProjects);
  }
  projectsRef.current = nextProjects;
  setProjects(nextProjects);
  afterCommit?.(nextProjects);
});
```

Use it for create, delete, rename, duplicate, import, video-time update, and calibration update. Delete's `mutate` callback must compute `current.filter(...)` inside the queued callback, not before it. Preserve current failure handling: only show success after persistence and leave in-memory state unchanged on a failed destructive write.

Generate a fresh import identity before the mutation:

```ts
const importedId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
const importedProject = { ...sanitizedProject, id: importedId };
```

At repository-save level, reject a list containing duplicate IDs:

```ts
const ids = new Set(projects.map(project => project.id));
if (ids.size !== projects.length) {
  throw new Error('Project IDs must be unique before persistence');
}
```

- [ ] **Step 4: Verify GREEN and no stale persistence**

Run:

```powershell
npm.cmd test -- src/__tests__/context/WorkspaceContext.test.tsx src/__tests__/utils/projectRepository.test.ts
npm.cmd run lint
```

Expected: all mutation sequences persist truthfully in FIFO order, without any stale debounce follow-up; duplicate import creates independently addressable projects; no duplicate IDs reach storage.

- [ ] **Step 5: Commit mutation safety**

```powershell
& $git -C . add src/context/WorkspaceContext.tsx src/__tests__/context/WorkspaceContext.test.tsx src/utils/projectRepository.ts src/__tests__/utils/projectRepository.test.ts
& $git -C . commit -m 'fix: serialize project mutations and import identities'
```

### Task 6: Make report navigation type-safe, accessible, and safe to render

**Files:**
- Modify: `src/types.ts:265-268`
- Modify: `src/App.tsx:34-38, 280-313, 475-570`
- Modify: `src/components/Dashboard.tsx:22-26`
- Modify: `src/components/workstation/WorkstationChrome.tsx`
- Modify: `src/workstation/workstationModel.ts`
- Modify: `src/utils/reportGenerator.ts:50-88`
- Modify: `src/__tests__/workstation/workstationModel.test.ts`
- Modify: `src/__tests__/utils/reportGenerator.test.ts`
- Modify: `e2e/accessibility.spec.ts`

**Interfaces:**
- Consumes: `WorkbenchPresetId`, `WorkstationAnalysisTab`, `AnalysisTab`, `DashboardProps`.
- Produces: a visible `analysis-tab-report` control when report is part of keyboard navigation; `DashboardProps['variant'] = 'classic' | 'workstation' | 'report'`; escaped HTML report fields.

- [ ] **Step 1: Write failing type/behavior tests**

Add a workstation mapping case:

```ts
it.each([
  ['report', 'report'],
])('maps %s preset to %s tab', (preset, tab) => {
  expect(getAnalysisTabForPreset(preset as WorkbenchPresetId)).toBe(tab);
});
```

Add an adversarial report test:

```ts
const html = printMatchReportHTML({
  ...reportData,
  projectTitle: '<img src=x onerror=alert(1)>',
  teamAName: '<script>alert(1)</script>',
});
expect(html).not.toContain('<script>alert(1)</script>');
expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
```

Update the accessibility E2E expectation to locate the visible report tab by role/name and verify `End` focuses that actual final tab.

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```powershell
npm.cmd test -- src/__tests__/workstation/workstationModel.test.ts src/__tests__/utils/reportGenerator.test.ts
```

Expected: the HTML escaping test fails and TypeScript still rejects `report` at the current settings/dashboard boundaries.

- [ ] **Step 3: Implement the minimum coherent contract**

Extend the settings and dashboard unions:

```ts
workbenchPreset?: 'scout' | 'review' | 'analysis' | 'report';

interface DashboardProps {
  variant?: 'classic' | 'workstation' | 'report';
}
```

Render a real tab button with `id="analysis-tab-report"`, `role="tab"`, `aria-selected={activeTab === 'report'}`, and `onClick={() => setActiveTab('report')}`. Keep the tab order synchronized with `ANALYSIS_TABS`.

Escape dynamic HTML values in `reportGenerator`:

```ts
const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');
```

Apply `escapeHtml` to every dynamic string interpolation, including title, sport, and team names. Do not escape numeric metrics as strings unless they are first validated as finite numbers.

- [ ] **Step 4: Verify GREEN**

Run:

```powershell
npm.cmd run lint
npm.cmd test -- src/__tests__/workstation/workstationModel.test.ts src/__tests__/utils/reportGenerator.test.ts
npx.cmd playwright test e2e/accessibility.spec.ts
```

Expected: TypeScript passes; report tab is both keyboard-navigable and visible; HTML report output contains no active imported markup.

- [ ] **Step 5: Commit report coherence**

```powershell
& $git -C . add src/types.ts src/App.tsx src/components/Dashboard.tsx src/components/workstation/WorkstationChrome.tsx src/workstation/workstationModel.ts src/utils/reportGenerator.ts src/__tests__/workstation/workstationModel.test.ts src/__tests__/utils/reportGenerator.test.ts e2e/accessibility.spec.ts
& $git -C . commit -m 'fix: complete accessible report navigation'
```

### Task 7: Verify calibration persistence and isolate unsupported motion artifacts

**Files:**
- Modify: `src/components/video/CourtZoneOverlay.tsx`
- Modify: `src/context/WorkspaceContext.tsx`
- Modify: `src/__tests__/utils/courtHomography.test.ts`
- Modify: `src/__tests__/context/WorkspaceContext.test.tsx`
- Modify: `.gitignore` or project documentation for `patchDashboardReport.cjs`, `refactorDashboard2.cjs`, and `spike-mediapipe.html` only after the owner confirms their intended retention.

**Interfaces:**
- Consumes: `courtCalibration` with `{ tl, tr, bl, br }` normalized corner tuples.
- Produces: validation that accepts four finite 0–1 coordinates in non-self-intersecting corner order, and a documented non-release disposition for experiments.

- [ ] **Step 1: Write failing calibration validation tests**

Add pure utility tests for rejected non-finite and crossed-point calibration input:

```ts
expect(validateCourtCalibration({
  tl: [0, 0], tr: [1, 1], bl: [1, 0], br: [0, 1],
})).toEqual({ valid: false, reason: 'self-intersecting' });

expect(validateCourtCalibration({
  tl: [0, 0], tr: [Number.NaN, 0], bl: [0, 1], br: [1, 1],
})).toEqual({ valid: false, reason: 'non-finite' });
```

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```powershell
npm.cmd test -- src/__tests__/utils/courtHomography.test.ts
```

Expected: FAIL because validation is not yet exported or invoked before `updateProjectVideoCalibration()` persists data.

- [ ] **Step 3: Implement bounded calibration validation**

Create `validateCourtCalibration()` in `src/utils/areaGeometry.ts`. It must require exactly the four named points, finite values, coordinates within `[0, 1]`, non-zero quadrilateral area, and no crossing of the TL→TR→BR→BL perimeter. Call it before persistence; on invalid input, do not mutate the project and show the existing localized error channel.

Keep current 3×2 overlay only as an experimental visual aid. Do not claim canonical sport-zone accuracy until sport-specific mapping is separately designed and validated.

- [ ] **Step 4: Classify experiments without deleting user work**

Inspect each untracked helper/spike file. Record its owner/intended use in `docs/` or add the smallest appropriate ignore rule only after user confirmation. Do not commit any helper/spike as a production feature in this task.

- [ ] **Step 5: Verify GREEN and commit calibration validation**

Run:

```powershell
npm.cmd test -- src/__tests__/utils/courtHomography.test.ts src/__tests__/context/WorkspaceContext.test.tsx
npm.cmd run lint
& $git -C . diff --check
```

Commit only the calibration production files and tests:

```powershell
& $git -C . add src/utils/areaGeometry.ts src/components/video/CourtZoneOverlay.tsx src/context/WorkspaceContext.tsx src/__tests__/utils/courtHomography.test.ts src/__tests__/context/WorkspaceContext.test.tsx
& $git -C . commit -m 'fix: validate persisted court calibration'
```

### Task 8: Run Checkpoint 7 closeout verification and record evidence gaps

**Files:**
- Modify: `docs/pilot/` only if an existing evidence template is available and actual evidence is recorded.
- Test: full repository quality gates and real-browser manual scenarios.

**Interfaces:**
- Consumes: completed migration, mutation, report, and calibration commits.
- Produces: an evidence-backed `PASS`, `FAIL`, or `BLOCKED` assessment; no fabricated pilot-readiness claim.

- [ ] **Step 1: Verify repository integrity**

Run:

```powershell
& $git -C . status --short --branch
& $git -C . diff --check
& $git -C . log --oneline --decorate -10
```

Expected: every production change is in its own focused commit; no accidental staged code; untracked experimental files are intentionally classified.

- [ ] **Step 2: Run all automated gates**

Run:

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run check-icons
npm.cmd run build
npx.cmd playwright test
```

Expected: every command exits 0 using the configured/default workers.

- [ ] **Step 3: Run real-browser data-safety scenarios**

Execute and record browser version, commit SHA, data counts, and screenshots/logs for:

```text
1. Upgrade a v1.1-only IndexedDB store containing multiple projects/events.
2. Import the same export twice; edit each copy; delete one; reload.
3. Repeat save → immediate close/reopen 100 times.
4. Save and reopen a session with 300 events.
5. Edit two tabs concurrently; confirm stale writer warns/fails closed.
6. Reopen offline after an interrupted save.
```

- [ ] **Step 4: Record the honest closeout state**

Mark Checkpoint 7 `PASS` only if every automated gate and the six real-browser scenarios have recorded evidence. If browser-only evidence cannot be executed, mark it `BLOCKED`; do not begin Checkpoint 8 or claim pilot readiness.

- [ ] **Step 5: Request final code review**

Create a review package from the branch merge base through current `HEAD`, then request a read-only review covering migration, queue ordering, import identity, report rendering, calibration validation, and test evidence. Address every Critical or Important finding before merge.

### Task 9: Recover valid v1.1 data when the v1.2 envelope contains corrupt records

**Files:**
- Modify: `src/utils/projectRepository.ts`
- Modify: `src/__tests__/utils/projectRepository.test.ts`

**Interfaces:**
- Consumes: v1.2 and legacy v1.1 persisted envelopes.
- Produces: v1.2 remains canonical only when every stored project record is valid; a valid intentionally-empty v1.2 remains canonical; otherwise valid v1.1 is recovered safely.

- [ ] Add RED cases for a valid v1.1 envelope alongside (a) v1.2 containing `{}` and (b) an intentionally empty valid v1.2. The first must recover v1.1; the second must return its empty v1.2 state.
- [ ] Make envelope parsing distinguish a structurally valid empty v1.2 from a v1.2 envelope containing invalid project records. Do not silently filter corrupt v1.2 projects and return a partial/empty list when a valid v1.1 recovery source exists.
- [ ] Run `npm.cmd test -- src/__tests__/utils/projectRepository.test.ts`, then commit only those files as `fix: recover legacy projects from corrupt envelopes`.

### Task 10: Make project import success contingent on durable persistence

**Files:**
- Modify: `src/context/WorkspaceContext.tsx`
- Modify: import call sites such as `src/App.tsx` and `src/components/WorkspaceMenu.tsx`
- Modify: `src/__tests__/context/WorkspaceContext.test.tsx`

**Interfaces:**
- `importProject(project)` returns `Promise<boolean>`.
- `true` means the unique-ID import was persisted and committed; `false` means it was not persisted and an existing localized failure notification was shown.

- [ ] Add RED tests for a rejected import persistence call: import returns false, projects do not change, and success is not shown by callers. Add a success case that resolves only after persistence.
- [ ] Await the queue-owned import mutation. Generate/verify a fresh collision-free identity inside the queued operation, and show success only after it resolves. On rejection, use the existing localized toast/error channel rather than only `console.error`.
- [ ] Run focused context tests and lint, then commit only scoped files as `fix: report durable project import results`.

### Task 11: Persist the current-project snapshot before committing it in memory

**Files:**
- Modify: `src/context/WorkspaceContext.tsx`
- Modify: `src/__tests__/context/WorkspaceContext.test.tsx`

**Interfaces:**
- Consumes: project-open snapshot and `persistProjects`.
- Produces: project selection and snapshot state change only after the snapshot's write succeeds.

- [ ] Add a RED regression where opening another project triggers a rejected persistence call; assert both the original `projects` snapshot and active project remain unchanged.
- [ ] Stage the snapshot as a candidate, persist it, then commit refs/React state and selection only on success. Retain localized failure reporting.
- [ ] Run focused context tests and lint, then commit only scoped files as `fix: persist project snapshots before activation`.

### Task 12: Provide an accessible calibration entry point and prevent gesture interception

**Files:**
- Modify: `src/components/VideoPlayer.tsx`
- Modify: `src/components/video/CourtZoneOverlay.tsx` only if required for event-layer coordination
- Add or modify: focused component/E2E test already used by the player

**Interfaces:**
- Consumes: persisted `courtCalibration` and the existing overlay callbacks.
- Produces: a visible keyboard-accessible control to start/reopen calibration; pointer events reach calibration points while calibrating; cancel restores the prior display state.

- [ ] Add a RED UI test proving an accessible calibration action enters calibration mode and the overlay is above/has priority over gesture capture. Include a keyboard-accessible name.
- [ ] Add the smallest explicit player control (for example, an aria-labelled button beside existing player controls), set calibration visibility/mode from it, and disable or lower the gesture-capture layer while calibration is active. Preserve normal gesture controls otherwise.
- [ ] Run focused player/component tests, `npm.cmd run lint`, and relevant Playwright coverage. Commit only scoped files as `fix: enable accessible court calibration`.

### Task 13: Make the committed tree independently buildable

**Files:** `src/components/Dashboard.tsx`, `src/components/video/CourtZoneOverlay.tsx`

- [ ] Demonstrate that parsing/type-checking the files from `git show HEAD:<path>` fails even though the dirty worktree passes.
- [ ] Review and commit the existing narrowly relevant Dashboard reconstruction (balanced JSX, real newline, missing map filter/time helpers) and CourtZoneOverlay `Area` field correction. Preserve all unrelated scratch files.
- [ ] Verify the staged tree itself, not only the worktree: parse/type-check staged source or create a temporary detached archive/worktree without destructive commands. Run lint and focused tests. Commit as `fix: make dashboard and court overlay buildable`.

### Task 14: Require complete persisted project structure before v1.2 wins recovery precedence

**Files:** `src/utils/projectRepository.ts`, `src/__tests__/utils/projectRepository.test.ts`

- [ ] Add RED recovery coverage for a v1.2 record containing only `id`, `title`, and `events`, alongside a complete valid v1.1 project.
- [ ] Extend the persisted project predicate to validate the required runtime fields used by `loadProjectState` (`sportType`, `matchInfo`, `teams`, timestamps, and other required top-level fields) without rejecting a valid intentionally empty envelope.
- [ ] Run repository tests and lint; commit as `fix: reject incomplete persisted projects`.

### Task 15: Preserve a pending live snapshot when failed project switch is followed by immediate unmount

**Files:** `src/context/WorkspaceContext.tsx`, `src/__tests__/context/WorkspaceContext.test.tsx`

- [ ] Add RED coverage: edit the active project's live state, reject a project switch save, unmount before the 800ms retry, and assert cleanup persistence contains the live edit.
- [ ] On cleanup, cancel timers but construct the final candidate with `snapshotCurrentProjectRef(projectsRef.current)` before saving; keep refs/selection atomic and avoid duplicate/stale writes.
- [ ] Run focused context tests and lint; commit as `fix: flush live snapshot during workspace cleanup`.

### Task 16: Reject duplicate IDs while initializing canonical v1.2 data

**Files:** `src/utils/projectRepository.ts`, `src/__tests__/utils/projectRepository.test.ts`

- [ ] Add RED coverage for a structurally complete v1.2 envelope containing duplicate project IDs alongside a valid v1.1 recovery source.
- [ ] Make v1.2 envelope acceptance require unique project IDs, using the same identity invariant enforced before save. A valid empty v1.2 remains canonical.
- [ ] Run repository tests and lint; commit as `fix: reject duplicate project ids during initialization`.

### Task 17: Preserve active-project edits accepted while a switch/create save is in flight

**Files:** `src/context/WorkspaceContext.tsx`, `src/__tests__/context/WorkspaceContext.test.tsx`

- [ ] Add delayed-save RED cases for `openProject` and `createNewProject`: after the old snapshot save begins, edit the still-active project, then resolve the old save. The later edit must be durably flushed before switching/loading the next project.
- [ ] Before committing a project-changing operation after awaited persistence, detect a newer pending live generation for the operation's original owner. Persist/flush that newer snapshot in FIFO order, or abort/defer the switch until it is durable. Never cancel a newer accepted edit by loading the next project.
- [ ] Run focused context tests and lint; commit as `fix: flush edits accepted during project transitions`.

### Task 18: Repair duplicate project identities from every legacy migration source

**Files:** `src/utils/projectRepository.ts`, `src/__tests__/utils/projectRepository.test.ts`

- [ ] Add RED cases for duplicate complete IDs from the legacy v1.1 store, a legacy array under the current key, and localStorage fallback input.
- [ ] Before promoting legacy data to canonical v1.2, preserve the original recovery backup and deterministically assign fresh collision-free IDs to repeated records (first occurrence keeps its ID). Never write a v1.2 envelope with duplicates.
- [ ] Run repository tests and lint; commit as `fix: repair duplicate ids during legacy migration`.

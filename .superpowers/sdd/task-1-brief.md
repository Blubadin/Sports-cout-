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


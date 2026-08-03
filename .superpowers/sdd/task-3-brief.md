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


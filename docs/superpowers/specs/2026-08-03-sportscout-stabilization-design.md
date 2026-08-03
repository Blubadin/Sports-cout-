# SPORTSCOUT Stabilization Before Pilot — Design

Date: 2026-08-03
Status: Approved design; implementation requires a separate plan and approval.

## Purpose

Bring SPORTSCOUT back to a demonstrably safe, buildable state before any further report, workstation, court-calibration, or motion work. The immediate outcome is not new functionality. It is a clean, verified Checkpoint 7 closeout boundary that protects existing local-first project data.

## Evidence That Drives This Design

The review of `73a03a1..a45e52b` plus the active working-tree changes found:

1. `src/utils/projectRepository.ts` now reads `scout-projects:v1.2` but does not read the former v1.1 IndexedDB key. Existing v1.1 data can become invisible after upgrade.
2. `WorkspaceContext` still creates destructive snapshots outside the project operation queue. A delayed delete can persist a stale project list over a concurrent rename, import, or video-time update.
3. Import accepts an existing project ID, creating duplicate identities that make open, update, and delete ambiguous.
4. The active worktree does not type-check because report support was added incompletely across `App`, `AppSettings`, and `Dashboard`.
5. The staged `VideoPlayer` change removes the committed court-calibration UI while leaving its persistence API orphaned.
6. Existing tests are useful but do not prove v1.1 upgrade behavior, duplicate-import behavior, browser lifecycle recovery, or multi-tab safety.

On 2026-08-03, `npm.cmd test` passed 49 files / 438 tests, while `npm.cmd run lint` failed with the report type-contract errors. A green unit suite alone is therefore not a release signal.

## Scope

### In scope

- IndexedDB v1.1-to-v1.2 migration and recovery behavior.
- Project identity invariants on import and persistence.
- Serialized project mutation and flush/cleanup correctness.
- Build, type, test, accessibility, and end-to-end quality gates.
- Report navigation coherence and safe report rendering.
- A deliberate keep-or-remove decision for court calibration.
- Documentation of evidence required to close Checkpoint 7.

### Out of scope

- New sport domains, feature expansion, backend, login, cloud sync, real-time AI, or production motion analytics.
- Broad UI redesign.
- Any irreversible migration that deletes legacy localStorage or v1.1 IndexedDB data.
- Declaring pilot readiness without recorded real-browser evidence.

## Operating Principles

1. Local-first project data is more important than visual feature delivery.
2. A project list must have unique IDs at every persistence boundary.
3. Every project-list mutation must execute from the latest authoritative list inside one serialization boundary.
4. No destructive write may silently overwrite a later mutation.
5. Browser lifecycle events may start a save but cannot be treated as proof that IndexedDB completed; recovery must be explicit and measurable.
6. A feature is either coherent across model, UI, persistence, types, and tests, or it stays out of the release.

## Design

### 1. Stabilization boundary and source control

Treat the current mixed worktree as a stabilization boundary, not as one mergeable feature.

- Capture the starting branch, `HEAD`, full Git status, staged diff, unstaged diff, and untracked files.
- Do not discard or overwrite existing work.
- Categorize every uncommitted file as one of: report work, court-calibration work, motion spike, or unrelated helper artifact.
- Keep source changes in small, purpose-specific commits: persistence migration, mutation safety, report coherence, calibration decision, then verification/docs.
- Do not merge a helper script or spike merely because it exists in the working tree. Either document it as a non-product experiment, add an ignore rule if appropriate, or remove it only with explicit approval.

### 2. Safe repository migration

The repository must support an upgrade path from the former v1.1 IndexedDB key to the v1.2 envelope.

Initialization order:

1. Read and validate the v1.2 envelope.
2. If no valid v1.2 envelope exists, read and validate the v1.1 key.
3. If valid v1.1 data exists, preserve a recovery backup before making it the v1.2 canonical envelope.
4. Write the v1.2 envelope using the normal exclusive write mechanism.
5. Confirm the write result before exposing the migrated project list as ready.
6. Retain the legacy v1.1 record and localStorage recovery backup throughout the pilot; do not delete either as part of migration.
7. If any migration write fails, surface a recoverable failure and do not replace the user-visible list with an empty list.

The migration must be idempotent: a second launch uses the valid v1.2 envelope without duplicating projects or incrementing revision unexpectedly.

### 3. Project identity and import policy

The persistence contract requires unique project IDs.

- On import, assign a fresh project ID by default, including when importing a previously exported project.
- Preserve import provenance separately if product requirements later need to identify the source project; never use it as the active storage identity.
- Validate uniqueness immediately before repository save as a fail-safe.
- If an import cannot be made unique, reject it with a localized, actionable error and leave the current project list unchanged.
- Add tests for importing the same payload twice, opening each imported copy, updating each independently, deleting one, and reloading.

### 4. Serialized mutation model

Use a single project operation boundary for all mutations that can alter the authoritative project list:

- create;
- open/switch when it snapshots the current project;
- delete;
- rename;
- duplicate;
- import;
- last-video-time update;
- court-calibration update if retained;
- active-project snapshot;
- explicit flush and cleanup.

Each queued operation must:

1. Read `projectsRef.current` only when its turn starts.
2. Derive the next array from that current value.
3. Update `projectsRef.current` and React state coherently.
4. Persist the exact post-mutation list using the current revision.
5. Expose success only after the required persistence step completes.

Delete must not capture `remaining` before it enters the queue. A mutation occurring while storage is blocked must be present in the first persisted post-delete envelope, not only in a later autosave.

Debounce can reduce write frequency for ordinary snapshots, but it is never the sole durability mechanism for create, import, rename, duplicate, delete, or explicit user save.

### 5. Flush, cleanup, and recovery

- A flush persists the authoritative project list even with no active project.
- `isProjectLoading` may prevent a transient Scout UI snapshot; it must not prevent a committed project-list mutation from being persisted.
- Cleanup stops accepting new work, cancels timers, enqueues/persists the latest authoritative list, drains project operations, drains the persistence session, then closes resources.
- Pagehide and visibility change initiate a flush, but their unawaited IndexedDB write is not considered durable evidence.
- Add a bounded synchronous recovery journal only if real-browser evidence shows IndexedDB cannot satisfy the immediate-close gate. It may contain project/event envelope data required for recovery, never raw video. Clear it only after confirmed repository persistence.

### 6. Report coherence and security

Choose one of two outcomes before implementation begins:

- Complete the report tab as a real accessible feature: extend the type contracts, render a visible tab or intentional workstation-only control, preserve keyboard focus semantics, and add UI/E2E tests.
- Or remove the partial report navigation and mapping from the current worktree, retaining only separately tested report utilities that are not exposed to users.

Any printable HTML report must use DOM text nodes or escape all dynamic values, including project titles, team names, sport labels, and user-entered notes. Include adversarial import data in tests.

### 7. Court calibration decision

Court calibration cannot remain half-integrated.

If retained:

- restore a discoverable UI entry point;
- validate exactly four normalized, finite, non-self-intersecting corner points in a documented order;
- map displayed geometry to sport-specific canonical zones rather than a fixed approximate grid;
- test persistence round trips and invalid-corner rejection;
- label the feature as experimental until accuracy against real video is measured.

If deferred:

- remove calibration UI, API, metadata, and related unsupported claims as one coherent rollback;
- retain the tested homography utility only if it is clearly isolated and not exposed as a product capability.

The default recommendation is to defer calibration from the stabilization release unless its real sport-geometry validation already exists.

## Verification Strategy

### Deterministic automated tests

Add or strengthen tests for:

- v1.1 IndexedDB data migrating to v1.2 while preserving all project fields and revision semantics;
- v1.2 taking precedence only when it is valid;
- migration failure leaving v1.1 recovery data available;
- duplicate import IDs being regenerated or safely rejected;
- delete blocked on persistence while rename, import, duplicate, video-time update, and snapshot happen concurrently;
- the first persisted post-delete envelope containing every later accepted mutation;
- cleanup/pagehide before a debounce expires;
- revision conflict and BroadcastChannel/storage-event fallback behavior;
- report navigation focus and report HTML escaping;
- the chosen calibration outcome.

Use deterministic deferred promises and assert both in-memory state and persisted envelopes. Do not rely on arbitrary sleep or a later autosave to prove race safety.

### Required quality gates

Run in this order from a clean intended change set:

```powershell
git diff --check
npm.cmd run lint
npm.cmd test
npm.cmd run check-icons
npm.cmd run build
npx.cmd playwright test
```

Use the configured/default Playwright worker count. Do not weaken assertions, update snapshots, add skips, or reduce workers to create a passing result.

### Real-browser evidence required for Checkpoint 7

Record browser/version, build identity, exact procedure, expected outcome, actual outcome, and artifact/log location for:

1. Upgrade from a v1.1-only IndexedDB store with multiple projects and events.
2. Importing the same exported project twice, editing each, deleting one, and reopening.
3. 100 cycles of save followed immediately by close/reopen with no lost data.
4. A 300-event round trip with matching event IDs and counts.
5. Two tabs writing concurrently: the stale tab must warn/fail closed rather than overwrite.
6. Offline reopen and recovery after interrupted saves.

Without this recorded evidence, Checkpoint 7 remains `BLOCKED`, not passed.

## Completion Criteria

This stabilization work is complete only when:

- existing v1.1 IndexedDB data is migrated safely and remains recoverable;
- no project ID collision can create ambiguous update/delete behavior;
- all authoritative mutations are serialized and no known stale-snapshot race remains;
- the product type-checks, builds, and passes unit/E2E gates;
- report and calibration code are either complete, tested features or intentionally absent from the release;
- current source control status is intentional and `git diff --check` is clean;
- required real-browser Checkpoint 7 evidence is recorded;
- no claims of pilot readiness exceed the available evidence.

## Deferred Backlog

Only after the completion criteria are met:

1. Checkpoint 8 schema 1.2 sport data contract and strict import reporting.
2. Canonical scouting protocol shared by every input mode.
3. Volleyball golden dataset and pilot workflow.
4. Coach reports with reconciled metrics and safe exports.
5. Desktop workstation expansion.
6. Motion analytics proof of concept.

## Risks and Decisions Needed During Implementation

- Whether to retain or defer court calibration in the next release.
- Whether import should always clone IDs or offer explicit merge/replace UX in a later product phase. This design selects always-clone for safety.
- Whether real-browser evidence demonstrates the need for a recovery journal.
- Whether report view is in the current stabilization release; this design prefers deferral unless a complete accessible implementation is already intended.

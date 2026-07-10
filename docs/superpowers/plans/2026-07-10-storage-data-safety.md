# Storage and Data Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make IndexedDB the reliable project store, migrate legacy localStorage without destructive writes, prevent silent import replacement, and expose truthful save/recovery states.

**Architecture:** Store a small versioned project index and one record per project through a typed repository backed by the existing `StorageAdapter`. Keep settings and active-project metadata in localStorage. Migration writes a recovery backup first, never deletes legacy keys, and is idempotent. Workspace state hydrates explicitly, persists only the changed project, and reports asynchronous save status.

**Tech Stack:** React 19, TypeScript 5.8, Vitest 4, idb-keyval 6, browser localStorage/IndexedDB.

## Global Constraints

- Do not add a backend, authentication, cloud sync, scoring changes, foul changes, or unrelated UI redesign.
- Keep `ScoutProject`, `EventRow`, `Action`, and legacy export/import backward compatible.
- Do not call `localStorage.clear()` or delete legacy project/event keys after migration.
- Import defaults to a new copy with a new project ID; replacement requires explicit confirmation and a backup.
- Persistence failure must remain visible as `save failed`; it must never be reported as `saved`.
- Use test-first changes and run `typecheck`, `lint`, `test`, `test:coverage`, `build`, `check-icons`, and `audit` before completion.

---

### Task 1: Typed project repository

**Files:**
- Create: `src/utils/projectRepository.ts`
- Create: `src/__tests__/utils/projectRepository.test.ts`
- Modify: `src/utils/storageAdapter.ts`

**Interfaces:**
- Produces `ProjectRepository`, `ProjectStoreIndex`, `ProjectRecoveryBackup`, and `createProjectRepository(adapter)`.
- Repository methods: `listProjects`, `getProject`, `saveProject`, `saveProjects`, `deleteProject`, `createBackup`, and `getLatestBackup`.

- [ ] Write failing tests proving projects are stored as separate records, index version is explicit, deletion updates the index, and backup data is recoverable.
- [ ] Run `npm.cmd test -- src/__tests__/utils/projectRepository.test.ts` and confirm failures are caused by the missing module.
- [ ] Implement the minimal repository with `PROJECT_STORE_SCHEMA_VERSION = 2`, stable project/index key helpers, cloning at boundaries, and injectable `StorageAdapter`.
- [ ] Re-run the focused test and confirm all repository cases pass.

### Task 2: Idempotent legacy migration

**Files:**
- Create: `src/utils/storageMigration.ts`
- Create: `src/__tests__/utils/storageMigration.test.ts`
- Modify: `src/utils/projectRepository.ts`

**Interfaces:**
- Produces `migrateLegacyProjectStorage(repository, legacyStorage)` returning `{ status, projects, backupId?, error? }`.
- Consumes legacy keys `scout_projects`, `scout_events`, `scout_match_info`, and `scout_teams` without removing them.

- [ ] Write failing tests for successful migration, repeat migration, malformed legacy JSON, repository failure, legacy events recovery, and preservation of all original keys.
- [ ] Run the focused migration test and confirm expected failures.
- [ ] Implement parse/validation through existing sanitizers, backup-before-write ordering, and a completed migration marker only after project records are readable.
- [ ] Re-run repository and migration tests.

### Task 3: Versioned import validation and collision policy

**Files:**
- Create: `src/utils/projectImport.ts`
- Create: `src/__tests__/utils/projectImport.test.ts`
- Modify: `src/utils/scoutData.ts`

**Interfaces:**
- Produces `parseProjectImport`, `prepareProjectImport`, `validateImportFileSize`, `ImportResult`, and `ImportIssue`.
- Supports legacy event arrays, single projects, schema `1.1` events/projects envelopes, and localStorage recovery backups.

- [ ] Write failing tests for malformed JSON, oversized file, unsupported schema, event limit, import-as-copy, duplicate IDs, confirmed/cancelled replacement, and JSON round trip.
- [ ] Run focused tests and verify failures represent missing behavior.
- [ ] Implement actionable validation results; copy mode always regenerates project/event/action IDs, replacement requires `confirmed: true`.
- [ ] Re-run focused tests and existing `scoutData` tests.

### Task 4: Explicit Workspace hydration and truthful save state

**Files:**
- Modify: `src/context/WorkspaceContext.tsx`
- Modify: `src/context/ScoutContext.tsx`
- Modify: `src/hooks/useLocalStorage.ts`
- Create: `src/__tests__/context/WorkspaceContext.test.tsx`

**Interfaces:**
- Workspace exposes `hydrationStatus`, `saveStatus`, `saveError`, `retrySave`, and `exportEmergencyBackup`.
- Project data uses `ProjectRepository`; localStorage remains for settings and `active_scout_project_id` only.

- [ ] Write failing integration tests for hydration, debounced project-only save, save failure, retry, and switching projects while a save is pending.
- [ ] Run focused context tests and confirm expected failures.
- [ ] Replace time-based loading guards with explicit hydration/project transaction refs; update in-memory project snapshots synchronously and persist only the affected project.
- [ ] Remove `scout_events`, `scout_match_info`, and `scout_teams` as independent persistence sources after hydration while preserving migration reads.
- [ ] Re-run context and utility tests.

### Task 5: Safe UI import and recovery flows

**Files:**
- Modify: `src/components/WorkspaceMenu.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ErrorBoundary.tsx`
- Modify: `public/error-overlay.js`
- Create: `src/utils/recoveryBackup.ts`
- Create: `src/__tests__/utils/recoveryBackup.test.ts`

**Interfaces:**
- File import validates `File.size` before `FileReader`.
- Recovery exports application-owned localStorage plus IndexedDB project data where the React app is available.

- [ ] Write failing tests for application-key filtering, backup payload generation, and destructive reset confirmation.
- [ ] Run focused tests and confirm expected failures.
- [ ] Connect import preview/results and save-failure backup action to the existing workspace UI.
- [ ] Replace `localStorage.clear()` with explicit application-key removal after confirmation; hide production stack details from normal users.
- [ ] Re-run focused tests and manually verify import/recovery dialogs.

### Task 6: Full verification and review

**Files:**
- Review all files changed by Tasks 1-5.

- [ ] Run `npm.cmd run typecheck`.
- [ ] Run `npm.cmd run lint` and require zero errors.
- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run test:coverage`.
- [ ] Run `npm.cmd run build`.
- [ ] Run `npm.cmd run check-icons`.
- [ ] Run `npm.cmd audit`.
- [ ] Inspect the complete git diff for data loss, project-switch races, legacy compatibility, and unrelated changes.
- [ ] Manually verify create/open/edit/save/reload/import/export/recovery in the browser before declaring Sprint 3 complete.

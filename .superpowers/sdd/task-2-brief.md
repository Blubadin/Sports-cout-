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

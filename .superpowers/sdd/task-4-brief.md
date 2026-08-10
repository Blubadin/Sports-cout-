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

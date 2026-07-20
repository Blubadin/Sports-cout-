# Task 2: Checkpoint 7 repository serialization and revisions

## Ownership

- `src/utils/projectRepository.ts`
- `src/__tests__/utils/projectRepository.test.ts`

## Requirements

1. Use TDD: add failing tests before production changes.
2. Keep export/data schema version at `1.1` for this task.
3. Add an optional numeric repository `revision` that reads legacy envelopes without a revision as revision `0`.
4. Serialize writes from one repository instance so a delayed old write cannot finish after and overwrite a newer write.
5. Add compare-before-write through an optional expected revision. A stale expected revision must throw a typed conflict error and leave stored projects unchanged.
6. Every successful save increments the stored revision and returns the saved envelope (or equivalent revision result) for Workspace integration.
7. A failed write must not permanently poison the queue; a later save can still succeed.
8. Preserve current migration, backup, normalization, and source-of-truth behavior.
9. Do not edit WorkspaceContext or unrelated files.

## Acceptance

- Focused repository tests pass.
- Existing repository tests remain compatible.
- TypeScript passes for owned files.
- Report changed files and test evidence.

You are not alone in this codebase. Do not revert others' changes; accommodate current state.

# Task 3: Checkpoint 7 exclusive project writes

## Ownership

- `src/utils/projectWriteCoordinator.ts` (new)
- `src/__tests__/utils/projectWriteCoordinator.test.ts` (new)
- `src/utils/projectRepository.ts`
- `src/__tests__/utils/projectRepository.test.ts`

## Requirements

1. Use TDD.
2. Add a typed exclusive-operation contract that the repository can use around the entire read/compare/write transaction.
3. Browser implementation must use `navigator.locks.request()` with one stable project-write lock name when available.
4. Provide a rejection-resistant in-process FIFO fallback for environments without Web Locks. Clearly do not claim this fallback coordinates separate tabs.
5. Allow `createProjectRepository` to receive the exclusive executor without breaking current callers.
6. Apply exclusivity to revision-sensitive initialize/migration and save operations.
7. Test two repository instances sharing one exclusive executor: when both save with the same expected revision, exactly one succeeds and the other throws `ProjectRepositoryConflictError`; stored data remains the winner.
8. Test Web Locks selection, FIFO fallback, and queue recovery after rejection.
9. Keep schema `1.1`; do not edit WorkspaceContext or add BroadcastChannel yet.

## Acceptance

- Focused coordinator/repository tests pass.
- TypeScript passes.
- No unrelated files changed and no commit created.

You are not alone in the codebase. Preserve current changes and do not revert other work.

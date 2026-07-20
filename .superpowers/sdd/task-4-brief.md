# Task 4: Workspace revision integration and cross-tab notifications

## Goal

Connect the revisioned, Web-Locked repository to Workspace without allowing
same-tab queued saves or another tab to overwrite newer data silently.

## TDD requirements

1. Add a Workspace-level rejection-resistant save queue. Read the expected
   revision only when the queued operation starts, not when it is enqueued.
2. Initialize `repositoryRevisionRef` from `initializeWithRevision()`.
3. Pass the expected revision to every repository save and update the ref only
   from a successful returned envelope.
4. Do not retry `ProjectRepositoryConflictError`. Keep transient storage retry
   bounded as today.
5. On conflict, fail closed: keep current in-memory data, set save status to
   failed, explain that another tab has newer data, and do not silently merge.
6. Add a small cross-tab notifier using BroadcastChannel with a storage-event
   fallback. Messages contain only type, revision, timestamp, and ephemeral
   source ID; never raw project/video/device data.
7. Broadcast after successful save. Ignore own messages and older/equal
   revisions. A newer external revision marks the local session stale; it must
   not advance the expected revision without reloading the actual envelope.
8. Flush before project switch/delete and ensure queued saves settle in order.
9. Preserve current schema `1.1`, local-first source of truth, and existing UI.

## Likely files

- `src/context/WorkspaceContext.tsx`
- `src/utils/projectSyncChannel.ts` (new)
- `src/__tests__/utils/projectSyncChannel.test.ts` (new)
- focused Workspace save-queue helper/tests if extracting logic improves testability

## Acceptance

- Same-tab save A then newer save B persist in order without a false conflict.
- Two tabs at revision N cannot silently overwrite one another.
- Conflict is not retried and stored winner remains unchanged.
- Unsupported BroadcastChannel uses fallback without crashing.
- Focused tests, full unit tests, lint, icons, build, and Playwright pass.

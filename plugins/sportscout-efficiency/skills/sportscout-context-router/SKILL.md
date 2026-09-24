---
name: sportscout-context-router
description: Route SPORTSCOUT engineering tasks to the minimum relevant files and documentation. Use before repository exploration, debugging, implementation, review, or planning when the task concerns SPORTSCOUT.
---

# SPORTSCOUT context router

Never scan the whole repository by default. Start with `AGENTS.md`, the user request, and the current phase/spec only when relevant. Then inspect the smallest likely source and test set; expand only when evidence requires it.

## Route by task

- Workstation/frontend UI: `src/components/`, focused `src/__tests__/`, and directly imported types/utilities. Do not inspect `ai_service/` unless integration requires it.
- Player detection, pose, ReID, or badminton tracking: `ai_service/`, related Python tests, and the frontend tracking protocol/types. Exclude unrelated sport UI.
- Shuttle tracking: shuttle pipeline/tracker/adapter/model, shuttle tests, and required Lab components only.
- Court/heatmap/homography: court mapper, geometry utilities, and focused tests.
- Security: security configuration, FastAPI boundary, security tests, and current security spec.
- Persistence/data: repository/storage/sync files and focused tests.
- Planned phase: active spec/plan and files named by it; do not recursively read historical plans.

## Exclude by default

Do not read `node_modules/`, `dist/`, build artifacts, model weights, videos, generated output, coverage, unrelated sport modules, lockfiles unless dependency work requires them, or historical review/report packages (especially `.superpowers/sdd/task-1-review-package.md`).

Search in this order: exact path, symbol/reference, focused directory, imports/dependencies, then broader repository search as a last resort. Stop once there is enough evidence to act safely.

---
name: sportscout-phase-executor
description: Execute a defined SPORTSCOUT roadmap phase or task using focused context, tests, verification, and one scoped commit. Use when implementing a numbered phase, task, remediation, or planned feature.
---

# SPORTSCOUT phase executor

1. Read `AGENTS.md` and identify exactly one requested phase/task.
2. Apply `sportscout-context-router`; read only the current spec/plan and named files.
3. Establish a focused baseline, implement the minimum change, and run focused tests first.
4. Use existing systematic-debugging and test-driven workflows when needed; fix only failures caused by the change.
5. At the completion gate, run the required repository checks from `AGENTS.md`/the phase plan.
6. Inspect the diff for scope creep, commit only the requested phase, and report changed files, tests/results, and commit SHA.
7. Stop.

Do not pre-implement future phases, reread the whole repository after edits, or rerun expensive full suites after every small change. Reopen only changed files or dependencies implicated by failures.

# Pilot Rollback

Rollback point: `pilot-baseline-0.11.0-pilot.1` (`03d5c1c`).

1. Stop promoting the affected Preview deployment.
2. In Vercel, promote the last known-good production deployment or redeploy the rollback tag.
3. Do not delete IndexedDB or legacy localStorage backups.
4. Export recovery data before asking a user to reset runtime state.
5. Re-run the schema `1.1` import/export check after rollback.

The rollback changes application code only. Project data and controller profiles must remain untouched.

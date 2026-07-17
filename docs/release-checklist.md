# Pilot Release Checklist

1. Confirm the release commit and package version.
2. Run `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run check-icons`, `npm.cmd run build`, and `npx.cmd playwright test`.
3. Export a schema `1.1` project and import it into the candidate build.
4. Verify the Preview deployment before promoting `main`.
5. Record the deployed commit in the release notes.
6. Keep Classic as the default while Workstation is disabled.
7. Confirm the rollback tag exists remotely before pilot use.

Baseline: `0.11.0-pilot.1`, merge commit `03d5c1c`, rollback tag `pilot-baseline-0.11.0-pilot.1`.


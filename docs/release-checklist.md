# Release Checklist

## Pre-release

- Confirm `package.json` is `sportscout` at the intended version and declares Node `22.x`.
- Confirm Settings displays the intended SPORTSCOUT version and export schema.
- Create and import an event export, project export, and recovery export.
- Verify a legacy export without `appVersion` still imports.
- Verify a local video can be reopened after browser permission is granted; verify the reselect flow when it is not.
- Run `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run check-icons`, and `npm.cmd run build`.

## Deployment Gate

- Confirm Vercel Git integration, the production branch, and branch-protection rules directly in GitHub and Vercel.
- These are external settings; this repository does not configure or assert them.
- Confirm the deployment uses the intended Node runtime and release commit.

## Pilot Validation

- Record events for each supported sport.
- Mark a Key Moment and open Sequence Replay for a local-video project.
- Export a recovery bundle before any browser data reset exercise.

# Changelog

## 0.11.0-pilot.1 - 2026-07-13

### Release Baseline

- Set the package identity to `sportscout@0.11.0-pilot.1` and declare Node `22.x` as the intended runtime.
- Centralized the SPORTSCOUT app/version metadata and export schema `1.1`.
- Added `appVersion` to newly created event, project, and recovery exports while preserving legacy imports without that field.
- Added a tested recovery-envelope builder for localStorage snapshots and optional IndexedDB projects.
- Exposed release metadata in Settings and development diagnostic startup logs.
- Documented local-first IndexedDB persistence, legacy localStorage recovery, Key Moments, Sequence Replay, and local-video permission behavior.

### Deployment

Vercel Git integration, production branch selection, and branch protection are external settings. Their configuration is not asserted by this release.

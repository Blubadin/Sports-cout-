# SPORTSCOUT

SPORTSCOUT is a local-first sports scouting application for recording, reviewing, and exporting match events across volleyball, football, badminton, and basketball.

## Pilot Baseline

This repository is the `0.11.0-pilot.1` release baseline. It is intended for pilot use and validation of the local scouting workflow, not as a hosted multi-user service. There is no backend, account system, or cloud synchronization.

## Core Workflow

- Create a project, select a sport, configure teams, and record structured scouting events.
- Review events in the dashboard, event table, court/field views, and sequence views.
- Mark Key Moments (bookmarks), add coach notes, and open Sequence Replay for saved local-video clips.
- Export event and project JSON with export schema `1.1`, or export CSV where available.
- Import current exports and legacy JSON payloads. Legacy imports without an `appVersion` remain supported.

## Storage And Recovery

Projects are stored locally in IndexedDB and are the primary persistent data store. Existing and legacy browser `localStorage` data remains supported for migration and recovery; it is not the primary project store.

The crash recovery export includes the supported localStorage snapshot and, when available, the IndexedDB project envelope. Keep a recovery file before resetting browser runtime data.

All data remains in the browser profile unless it is exported manually. Clearing browser site data can remove local projects and saved handles.

## Local Video Behavior

Local video files are selected from the user device and are not uploaded by SPORTSCOUT. For a project, the app can retain a browser file-system handle in IndexedDB so the video can be reopened later. Browser permission is checked before reuse and may be requested again; users can be asked to select the file again when a handle is unavailable or permission is denied. Playback position is retained with the project when possible.

YouTube URLs are also supported as a separate video source.

## Development

Requirements: Node `22.x` and npm.

```bash
npm install
npm run dev
npm run lint
npm test
npm run check-icons
npm run build
```

The Settings Data tab shows the app version and export schema. Development builds also log the app/version/schema at diagnostic startup.

## Deployment Notes

Vercel Git integration, the production branch, and branch-protection rules are external repository/deployment settings. This repository does not claim that those settings are configured; confirm them in GitHub and Vercel before promoting a release.

See [the release checklist](docs/release-checklist.md) and [the rollback guide](docs/rollback.md).

# Rollback Guide

## Application Rollback

1. Identify the last validated release commit and deploy that commit through the approved GitHub/Vercel workflow.
2. Verify Vercel is serving the rollback commit and run a smoke test for project opening, export, and local-video permission handling.
3. Do not delete browser storage as part of a deployment rollback. Local projects live in IndexedDB and legacy recovery data may live in localStorage.

## Data Recovery

1. Before resetting browser runtime data, use the in-app recovery export when available.
2. Import the recovery bundle. IndexedDB projects are restored when present; legacy `localStorage.scout_projects` is used as a fallback.
3. Reauthorize or reselect local video files if the browser no longer grants access to their saved file handles.

## External Deployment Controls

Vercel Git integration, the production branch, and branch-protection rules are external settings. Verify or change those controls in GitHub and Vercel; this repository does not claim they are configured.

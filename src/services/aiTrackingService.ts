/**
 * aiTrackingService.ts — SportsScout Badminton Tracking Service
 *
 * In Post-Audit Hardening Phase 2, the legacy in-browser sinusoidal simulation engine,
 * optical motion heuristics, fake pose generation, and fake stroke classifications
 * have been permanently removed.
 *
 * Canonical tracking operations are owned by TrackingSessionApiClient in trackingSessionApi.ts.
 * This file re-exports the canonical API and provides a clean compatibility layer.
 */

import { trackingSessionApi, TrackingSessionApiClient } from './trackingSessionApi';

export * from './trackingSessionApi';
export const aiTrackingService = trackingSessionApi;
export { TrackingSessionApiClient as AITrackingService };
export default trackingSessionApi;

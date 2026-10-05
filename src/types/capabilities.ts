/**
 * Canonical consumer capability gates for SportsScout tracking workstation.
 */

export interface CapabilityGate {
  enabled: boolean;
  reason: string;
  confidence: number;
}

export interface SegmentCapabilities {
  canTrackPlayer: CapabilityGate;
  canTrackShuttle: CapabilityGate;
  canUseCourtMetric: CapabilityGate;
  canBuildHeatmap: CapabilityGate;
  canEstimateHit: CapabilityGate;
  canWriteCanonicalMatchData: CapabilityGate;
}

export type CapabilityName = keyof SegmentCapabilities;

export function parseCapabilityGate(value: unknown): CapabilityGate | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.enabled !== 'boolean') return null;
  return {
    enabled: v.enabled,
    reason: typeof v.reason === 'string' ? v.reason : '',
    confidence: typeof v.confidence === 'number' && Number.isFinite(v.confidence) ? v.confidence : 0,
  };
}

export function parseSegmentCapabilities(value: unknown): SegmentCapabilities | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const canTrackPlayer = parseCapabilityGate(v.canTrackPlayer);
  const canTrackShuttle = parseCapabilityGate(v.canTrackShuttle);
  const canUseCourtMetric = parseCapabilityGate(v.canUseCourtMetric);
  const canBuildHeatmap = parseCapabilityGate(v.canBuildHeatmap);
  const canEstimateHit = parseCapabilityGate(v.canEstimateHit);
  const canWriteCanonicalMatchData = parseCapabilityGate(v.canWriteCanonicalMatchData);

  if (
    !canTrackPlayer ||
    !canTrackShuttle ||
    !canUseCourtMetric ||
    !canBuildHeatmap ||
    !canEstimateHit ||
    !canWriteCanonicalMatchData
  ) {
    return null;
  }

  return {
    canTrackPlayer,
    canTrackShuttle,
    canUseCourtMetric,
    canBuildHeatmap,
    canEstimateHit,
    canWriteCanonicalMatchData,
  };
}

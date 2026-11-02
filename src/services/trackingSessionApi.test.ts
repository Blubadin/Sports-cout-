import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProcessingConfig } from '../types';
import { isCompatibleResumableTrackingSession, toTrackingTelemetryV1, TrackingSessionApiClient, type TrackingSessionSummary } from './trackingSessionApi';

afterEach(() => vi.unstubAllGlobals());

describe('tracking session page selection', () => {
  const expected = {
    projectId: 'project-a',
    videoFingerprint: 'video-a',
    gameType: 'singles' as const,
    trackedPlayerCount: 2,
    processingConfig: { device: 'auto', useCourtRoi: false, courtRoiMarginPx: 60, poseStride: 1, frameStride: 2, detectorInputSize: 640, detectorModel: 'yolov8n.pt' } as ProcessingConfig,
  };
  const candidate: TrackingSessionSummary = {
    sessionId: 'run-001',
    runId: 'run-001',
    status: 'INTERRUPTED',
    gameType: 'singles',
    trackedPlayerCount: 2,
    projectId: 'project-a',
    videoFingerprint: 'video-a',
    progressPct: 45,
    currentFrame: 90,
    totalFrames: 200,
    resumable: true,
    resume: { available: true, mode: 'SAFE_BOUNDARY_REPROCESS' },
    checkpointSequence: 2,
    committedCursor: 80,
    processingConfig: { device: 'auto', useCourtRoi: false, courtRoiMarginPx: 60, poseStride: 1, frameStride: 2, detectorInputSize: 640, detectorModel: 'yolov8n.pt' } as ProcessingConfig,
  };

  it('accepts the same project, media, resumable run, and processing semantics', () => {
    expect(isCompatibleResumableTrackingSession(candidate, expected)).toBe(true);
  });

  it.each([
    ['a different project', { projectId: 'project-b' }],
    ['a different media fingerprint', { videoFingerprint: 'video-b' }],
    ['a missing media fingerprint', { videoFingerprint: null }],
    ['a different match type', { gameType: 'doubles' }],
    ['a different player count', { trackedPlayerCount: 4 }],
    ['an unknown player count', { trackedPlayerCount: undefined }],
    ['a different run configuration', { processingConfig: { ...expected.processingConfig, frameStride: 1 } }],
  ])('rejects %s', (_description, override) => {
    expect(isCompatibleResumableTrackingSession({ ...candidate, ...override } as TrackingSessionSummary, expected)).toBe(false);
  });

  it('rejects a run whose checkpoint cannot be resumed', () => {
    expect(isCompatibleResumableTrackingSession({ ...candidate, resume: { available: false } }, expected)).toBe(false);
  });

  it('rejects checkpoint/run identity that does not belong to the listed session', () => {
    expect(isCompatibleResumableTrackingSession({ ...candidate, runId: 'another-run' }, expected)).toBe(false);
    expect(isCompatibleResumableTrackingSession({ ...candidate, committedCursor: 600 }, expected)).toBe(false);
  });
});

describe('tracking session listing page envelope', () => {
  it('keeps the backend cursor and recovery diagnostics and sends the requested page bound', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sessions: [],
      nextCursor: 'session_next',
      maximumPageSize: 2,
      recoveryIssues: ['job-a: corrupt journal'],
      recoveryIssueCount: 3,
      recoveryIssuesTruncated: true,
      pageIssues: ['job-b: journal read failed'],
      pageIssueCount: 1,
      pageIssuesTruncated: false,
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new TrackingSessionApiClient();
    client.setBaseUrl('http://127.0.0.1:8000');

    const page = await client.listSessions('project a', 'session_prev', 2);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.get('project_id')).toBe('project a');
    expect(url.searchParams.get('after')).toBe('session_prev');
    expect(url.searchParams.get('limit')).toBe('2');
    expect(page).toMatchObject({
      nextCursor: 'session_next',
      recoveryIssues: ['job-a: corrupt journal'],
      recoveryIssueCount: 3,
      recoveryIssuesTruncated: true,
      pageIssues: ['job-b: journal read failed'],
      pageIssueCount: 1,
    });
  });
});


describe('canonical metric and shot telemetry transport', () => {
  it('preserves measured quality, separate filtered points, source frame and unknown shot fields', () => {
    const rawGroundPoint = { xPx: 20, yPx: 30, provenance: 'bbox_bottom_center', metricEligible: false };
    const filteredGroundPoint = { xM: 2, yM: 3 };
    const distanceMetrics = { totalTrackedDistanceM: 1, metricDistanceCoverage: 0.5 };
    const shuttleShotEvents = { visibility: 'OUT_OF_FRAME', measuredPositionPx: null, shots: [{ shotId: 's1', hitterPlayerId: null, landingPositionM: null, outcome: 'UNKNOWN' }] };
    const actual = toTrackingTelemetryV1({ schemaVersion: 1, analysisId: 'a', timestampSec: 1, frameIndex: 2, sourceFrame: 4,
      shuttleShotEvents, players: [{ playerId: 'P1', state: 'observed', rawGroundPoint, filteredGroundPoint, distanceMetrics, poseSource: 'fresh', isPoseStale: false }] });
    expect(actual.sourceFrame).toBe(4);
    expect(actual.shuttleShotEvents).toEqual(shuttleShotEvents);
    expect(actual.players[0]).toMatchObject({ rawGroundPoint, filteredGroundPoint, distanceMetrics, poseSource: 'fresh', isPoseStale: false });
  });
});

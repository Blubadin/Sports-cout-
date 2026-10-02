import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProcessingConfig } from '../types';
import { isCompatibleResumableTrackingSession, TrackingSessionApiClient, type TrackingSessionSummary } from './trackingSessionApi';

afterEach(() => vi.unstubAllGlobals());

describe('tracking session page selection', () => {
  const expected = {
    projectId: 'project-a',
    videoFingerprint: 'video-a',
    processingConfig: { device: 'auto', useCourtRoi: false, courtRoiMarginPx: 60, poseStride: 1, frameStride: 2, detectorInputSize: 640, detectorModel: 'yolov8n.pt' } as ProcessingConfig,
  };
  const candidate: TrackingSessionSummary = {
    sessionId: 'run-001',
    runId: 'run-001',
    status: 'INTERRUPTED',
    gameType: 'singles',
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

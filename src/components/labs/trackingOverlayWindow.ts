import type { TrackingSessionStatus, TrackingTelemetryV1 } from '../../types';
import { MAX_TRACKING_RESULTS_PAGE_SIZE } from '../../services/trackingSessionApi';

export const MAX_TRACKING_OVERLAY_WINDOW_FRAMES = MAX_TRACKING_RESULTS_PAGE_SIZE;
const WINDOW_RETRIES = 2;

export interface TrackingOverlayWindowOwner {
  projectId: string;
  sessionId: string;
  cameraSegmentId: string | null;
}

export interface TrackingOverlayWindow extends TrackingOverlayWindowOwner {
  targetTimeSec: number;
  startCursor: number;
  nextCursor: number;
  frames: TrackingTelemetryV1[];
}

export type TrackingOverlayWindowLoadResult =
  | { status: 'ready'; window: TrackingOverlayWindow }
  | { status: 'unavailable' }
  | { status: 'stale' };

export interface TrackingOverlayWindowRequest {
  projectId: string;
  sessionId: string;
  timeSec: number;
  status: TrackingSessionStatus | null;
}

export type TrackingOverlayStatusText = 'loading' | 'error' | 'unavailable' | 'idle';

export function trackingOverlayStatusText(status: TrackingOverlayStatusText, isThai: boolean): string | null {
  if (status === 'loading') return isThai ? 'กำลังโหลดข้อมูลการติดตามช่วงนี้…' : 'Loading tracking data for this time…';
  if (status === 'error') return isThai ? 'โหลดข้อมูลการติดตามไม่สำเร็จ' : 'Could not load tracking data';
  if (status === 'unavailable') return isThai ? 'ไม่มีข้อมูลการติดตามสำหรับช่วงเวลานี้' : 'No tracking data is available for this time';
  return null;
}

function validPositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function estimateCursor(timeSec: number, count: number, status: TrackingSessionStatus): number {
  const duration = validPositive(status.videoDurationSec)
    ? status.videoDurationSec
    : validPositive(status.lastTelemetryTimestampSec)
      ? status.lastTelemetryTimestampSec
      : null;
  if (duration !== null) return Math.min(count - 1, Math.max(0, Math.floor((timeSec / duration) * count)));

  const sourceFps = status.videoMetadata?.nominalFps ?? status.sourceFps;
  const frameStride = Number.isSafeInteger(status.frameStride) && status.frameStride > 0 ? status.frameStride : 1;
  if (validPositive(sourceFps)) return Math.min(count - 1, Math.max(0, Math.floor((timeSec * sourceFps) / frameStride)));
  return 0;
}

function targetSegmentId(frames: TrackingTelemetryV1[], timeSec: number): string | null {
  let target: TrackingTelemetryV1 | undefined;
  for (const frame of frames) {
    if (frame.timestampSec > timeSec) break;
    target = frame;
  }
  target ??= frames[0];
  return typeof target?.cameraSegmentId === 'string' && target.cameraSegmentId.length > 0
    ? target.cameraSegmentId
    : null;
}

/** Restricts every time-based consumer to the camera segment containing the playhead. */
export function framesForCameraSegmentAtTime(
  frames: TrackingTelemetryV1[],
  timeSec: number,
): TrackingTelemetryV1[] {
  if (!frames.length || !Number.isFinite(timeSec)) return [];
  const segmentId = targetSegmentId(frames, timeSec);
  return frames.filter((frame) => (frame.cameraSegmentId ?? null) === segmentId);
}

export function trackingOverlayWindowContainsTime(window: TrackingOverlayWindow, timeSec: number): boolean {
  if (!window.frames.length || !Number.isFinite(timeSec)) return false;
  const first = window.frames[0].timestampSec;
  const last = window.frames[window.frames.length - 1].timestampSec;
  return timeSec >= first && timeSec <= last;
}

export type FetchOverlayStatus = (sessionId: string, signal: AbortSignal) => Promise<TrackingSessionStatus>;
export type FetchOverlayPage = (
  sessionId: string,
  afterCursor: number,
  limit: number,
  signal: AbortSignal,
) => Promise<{
  sessionId: string;
  nextCursor: number;
  telemetry: TrackingTelemetryV1[];
}>;

/** Loads one bounded backend result window and rejects replies from superseded seeks/owners. */
export class TrackingOverlayWindowLoader {
  private generation = 0;
  private controller: AbortController | null = null;

  public cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }

  public async load(
    request: TrackingOverlayWindowRequest,
    fetchStatus: FetchOverlayStatus,
    fetchPage: FetchOverlayPage,
  ): Promise<TrackingOverlayWindowLoadResult> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const isCurrent = () => this.generation === generation && !controller.signal.aborted;
    try {
      let status = request.status;
      if (!status || !Number.isSafeInteger(status.committedResultCursor)) {
        status = await fetchStatus(request.sessionId, controller.signal);
        if (!isCurrent()) return { status: 'stale' };
      }

      const total = status.committedResultCursor;
      if (typeof total !== 'number' || !Number.isSafeInteger(total) || total <= 0 || !Number.isFinite(request.timeSec) || request.timeSec < 0) {
        return { status: 'unavailable' };
      }

      const targetCursor = estimateCursor(request.timeSec, total, status);
      const initialOffset = Math.floor(MAX_TRACKING_OVERLAY_WINDOW_FRAMES * 0.4);
      let startCursor = Math.max(0, targetCursor - initialOffset);
      let page: Awaited<ReturnType<FetchOverlayPage>> | null = null;

      for (let attempt = 0; attempt <= WINDOW_RETRIES; attempt += 1) {
        const limit = Math.min(MAX_TRACKING_OVERLAY_WINDOW_FRAMES, total - startCursor);
        page = await fetchPage(request.sessionId, startCursor, limit, controller.signal);
        if (!isCurrent()) return { status: 'stale' };
        if (page.sessionId !== request.sessionId) throw new Error('Backend tracking page belongs to a different run');
        if (page.telemetry.length > limit || page.nextCursor !== startCursor + page.telemetry.length || page.nextCursor > total) {
          throw new Error('Backend tracking page has an invalid cursor range');
        }
        if (!page.telemetry.length) return { status: 'unavailable' };

        const firstTime = page.telemetry[0].timestampSec;
        const lastTime = page.telemetry[page.telemetry.length - 1].timestampSec;
        if (request.timeSec < firstTime && startCursor > 0 && attempt < WINDOW_RETRIES) {
          startCursor = Math.max(0, startCursor - Math.floor(limit / 2));
          continue;
        }
        if (request.timeSec > lastTime && page.nextCursor < total && attempt < WINDOW_RETRIES) {
          startCursor = Math.min(total - 1, startCursor + Math.max(1, Math.floor(limit / 2)));
          continue;
        }
        break;
      }

      if (!isCurrent()) return { status: 'stale' };
      if (!page?.telemetry.length) return { status: 'unavailable' };
      const frames = page.telemetry;
      return {
        status: 'ready',
        window: {
          projectId: request.projectId,
          sessionId: request.sessionId,
          cameraSegmentId: targetSegmentId(frames, request.timeSec),
          targetTimeSec: request.timeSec,
          startCursor,
          nextCursor: page.nextCursor,
          frames,
        },
      };
    } catch (error) {
      if (!isCurrent()) return { status: 'stale' };
      throw error;
    } finally {
      if (this.generation === generation) this.controller = null;
    }
  }
}

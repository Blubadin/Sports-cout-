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

export type TrackingOverlayStatusText =
  | 'loading'
  | 'error'
  | 'unavailable'
  | 'calibrating'
  | 'calibration_unavailable'
  | 'idle';

export function trackingOverlayStatusText(status: TrackingOverlayStatusText, isThai: boolean): string | null {
  if (status === 'loading') return isThai ? 'กำลังโหลดข้อมูลการติดตามช่วงนี้…' : 'Loading tracking data for this time…';
  if (status === 'error') return isThai ? 'โหลดข้อมูลการติดตามไม่สำเร็จ' : 'Could not load tracking data';
  if (status === 'unavailable') return isThai ? 'ไม่มีข้อมูลการติดตามสำหรับช่วงเวลานี้' : 'No tracking data is available for this time';
  if (status === 'calibrating') return isThai ? 'กำลังคำนวณตำแหน่งเส้นสนาม…' : 'Calibrating court geometry…';
  if (status === 'calibration_unavailable') return isThai ? 'ไม่สามารถระบุตำแหน่งเส้นสนามได้' : 'Court calibration unavailable';
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

export type FetchLocalTelemetry = (
  sessionId: string,
  startTimeSec: number,
  endTimeSec: number,
  signal: AbortSignal,
) => Promise<TrackingTelemetryV1[] | null>;

/**
 * Loads one bounded backend result window and manages IndexedDB -> RAM Cache -> Overlay hierarchy.
 * Rejects replies from superseded seeks/owners and performs non-blocking bounded prefetch.
 */
export class TrackingOverlayWindowLoader {
  private generation = 0;
  private controller: AbortController | null = null;
  private ramCacheSessionId: string | null = null;
  private ramCache: TrackingTelemetryV1[] = [];

  public cancel(): void {
    this.generation += 1;
    this.controller?.abort();
    this.controller = null;
  }

  public clearCache(): void {
    this.ramCacheSessionId = null;
    this.ramCache = [];
  }

  public getCachedFrames(
    sessionId: string,
    targetTimeSec: number,
    pastSec = 5.0,
    futureSec = 15.0,
  ): TrackingTelemetryV1[] | null {
    if (this.ramCacheSessionId !== sessionId || this.ramCache.length === 0) return null;
    const minTime = targetTimeSec - pastSec;
    const maxTime = targetTimeSec + futureSec;
    const slice = this.ramCache.filter((f) => f.timestampSec >= minTime && f.timestampSec <= maxTime);
    if (!slice.length) return null;

    // Verify slice has adequate coverage for the requested playhead
    const hasFrameAtOrBefore = slice.some((f) => f.timestampSec <= targetTimeSec && (targetTimeSec - f.timestampSec) <= 1.0);
    const hasFrameAtOrAfter = slice.some((f) => f.timestampSec >= targetTimeSec && (f.timestampSec - targetTimeSec) <= 2.0);
    if (hasFrameAtOrBefore && (hasFrameAtOrAfter || slice.length >= 5)) {
      return slice;
    }
    return null;
  }

  public addFramesToCache(
    sessionId: string,
    newFrames: TrackingTelemetryV1[],
    centerTimeSec?: number,
  ): void {
    if (this.ramCacheSessionId !== sessionId) {
      this.ramCacheSessionId = sessionId;
      this.ramCache = [];
    }
    if (!newFrames.length) return;

    const frameMap = new Map<number, TrackingTelemetryV1>();
    for (const f of this.ramCache) {
      frameMap.set(f.timestampSec, f);
    }
    for (const f of newFrames) {
      frameMap.set(f.timestampSec, f);
    }
    const merged = Array.from(frameMap.values()).sort((a, b) => a.timestampSec - b.timestampSec);

    // Bounded memory: keep around center playhead [T - 8s, T + 25s] or max 600 frames
    if (centerTimeSec !== undefined && Number.isFinite(centerTimeSec)) {
      const minT = centerTimeSec - 8.0;
      const maxT = centerTimeSec + 25.0;
      this.ramCache = merged.filter((f) => f.timestampSec >= minT && f.timestampSec <= maxT);
    } else if (merged.length > 600) {
      this.ramCache = merged.slice(-600);
    } else {
      this.ramCache = merged;
    }
  }

  public async load(
    request: TrackingOverlayWindowRequest,
    fetchStatus: FetchOverlayStatus,
    fetchPage: FetchOverlayPage,
    fetchLocal?: FetchLocalTelemetry,
  ): Promise<TrackingOverlayWindowLoadResult> {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const isCurrent = () => this.generation === generation && !controller.signal.aborted;

    try {
      // 1. RAM Cache check (0ms immediate hit)
      const cached = this.getCachedFrames(request.sessionId, request.timeSec, 5.0, 15.0);
      if (cached && cached.length > 0) {
        return {
          status: 'ready',
          window: {
            projectId: request.projectId,
            sessionId: request.sessionId,
            cameraSegmentId: targetSegmentId(cached, request.timeSec),
            targetTimeSec: request.timeSec,
            startCursor: 0,
            nextCursor: cached.length,
            frames: cached,
          },
        };
      }

      // 2. Local Persisted Telemetry (IndexedDB) check
      if (fetchLocal) {
        try {
          const localFrames = await fetchLocal(
            request.sessionId,
            Math.max(0, request.timeSec - 5.0),
            request.timeSec + 15.0,
            controller.signal,
          );
          if (!isCurrent()) return { status: 'stale' };
          if (localFrames && localFrames.length > 0) {
            this.addFramesToCache(request.sessionId, localFrames, request.timeSec);
            const readySlice = this.getCachedFrames(request.sessionId, request.timeSec, 5.0, 15.0) || localFrames;
            return {
              status: 'ready',
              window: {
                projectId: request.projectId,
                sessionId: request.sessionId,
                cameraSegmentId: targetSegmentId(readySlice, request.timeSec),
                targetTimeSec: request.timeSec,
                startCursor: 0,
                nextCursor: readySlice.length,
                frames: readySlice,
              },
            };
          }
        } catch {
          // If local storage error occurs, continue to backend recovery
        }
      }

      // 3. Backend Fallback & Gap Recovery
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

      // Populate RAM Cache with retrieved telemetry
      this.addFramesToCache(request.sessionId, page.telemetry, request.timeSec);

      // Non-blocking prefetch next window for seamless playback
      if (page.nextCursor < total) {
        const nextStart = page.nextCursor;
        const prefetchLimit = Math.min(MAX_TRACKING_OVERLAY_WINDOW_FRAMES, total - nextStart);
        void fetchPage(request.sessionId, nextStart, prefetchLimit, controller.signal)
          .then((nextPage) => {
            if (isCurrent() && nextPage?.telemetry?.length) {
              this.addFramesToCache(request.sessionId, nextPage.telemetry, request.timeSec);
            }
          })
          .catch(() => {});
      }

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

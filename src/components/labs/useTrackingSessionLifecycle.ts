import { useCallback, useEffect, useRef } from 'react';
import { aiTrackingService } from '../../services/aiTrackingService';
import { isCompatibleResumableTrackingSession } from '../../services/trackingSessionApi';
import {
  getLatestTrackingAnalysisForProject,
  getTrackingSampleChunkPage,
} from '../../services/storage/trackingStorage';
import {
  computeVideoFingerprint,
  type ProjectTrackingState,
  type trackingSessionStore,
} from '../../services/trackingSessionStore';
import { loadProjectVideoFileHandle } from '../../utils/videoFileStore';
import { normalizeBackendSessionStatus } from './trackingLabStatus';

interface UseTrackingSessionLifecycleParams {
  activeProjectId: string | null;
  file: File | null;
  analysisPresent: boolean;
  stateLocalFileName: string | null;
  contextLocalFileName: string | null;
  online: boolean | null;
  th: boolean;
  store: typeof trackingSessionStore;
  update: (updater: Partial<ProjectTrackingState> | ((prev: ProjectTrackingState) => Partial<ProjectTrackingState>)) => void;
  setFile: (file: File | null) => void;
}

/** Handles IndexedDB analysis restore, FileSystem handle reconnect, backend polling, and session discovery. */
export function useTrackingSessionLifecycle({
  activeProjectId,
  file,
  analysisPresent,
  stateLocalFileName,
  contextLocalFileName,
  online,
  th,
  store,
  update,
  setFile,
}: UseTrackingSessionLifecycleParams) {
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const thRef = useRef(th);
  thRef.current = th;

  // Load persisted project analysis from IndexedDB if not already in state
  useEffect(() => {
    let alive = true;
    if (activeProjectId && !analysisPresent) {
      void getLatestTrackingAnalysisForProject(activeProjectId)
        .then(async (latest) => {
          if (!latest || !alive) return;
          const page = await getTrackingSampleChunkPage(latest.id);
          if (!alive) return;
          const snapshot = store.getProjectState(activeProjectId);
          update({
            analysis: latest,
            chunks: page.chunks,
            chunksNextCursor: page.nextCursor,
            chunksHasMore: page.hasMore,
            trackedPlayerCount: latest.trackedPlayerCount ?? snapshot?.trackedPlayerCount ?? 2,
            gameType: latest.gameType ?? snapshot?.gameType ?? 'singles',
          });
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [activeProjectId, analysisPresent, store, update]);

  // Try restoring file handle from IndexedDB on hard page refresh
  useEffect(() => {
    let alive = true;
    if (activeProjectId && !file) {
      void loadProjectVideoFileHandle(activeProjectId, stateLocalFileName || contextLocalFileName)
        .then(async (handle) => {
          if (!handle || !alive) return;
          if (handle.queryPermission && (await handle.queryPermission({ mode: 'read' })) !== 'granted') return;
          const restored = await handle.getFile();
          if (alive) {
            setFile(restored);
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [activeProjectId, file, stateLocalFileName, contextLocalFileName, setFile]);

  // Polling session helper
  const pollSession = useCallback(
    (sessionId: string, runId: number) => {
      const current = () => generation.current === runId;
      const poll = async (): Promise<void> => {
        try {
          const latestStatus = await aiTrackingService.getSessionStatus(sessionId);
          if (!current()) return;

          const currentState = store.getProjectState(activeProjectId);
          const cur = currentState?.cursor ?? 0;
          if (latestStatus.status !== 'COMPLETED' && latestStatus.status !== 'ERROR') {
            const committedCursor = latestStatus.committedResultCursor;
            const requestCursor = typeof committedCursor === 'number' && Number.isSafeInteger(committedCursor)
              ? Math.min(cur, committedCursor)
              : cur;
            if (requestCursor !== cur) update({ cursor: requestCursor });
            const partial = await aiTrackingService.getSessionResults(sessionId, requestCursor);
            if (!current()) return;

            if (partial.telemetry && partial.telemetry.length > 0) {
              await store.appendTelemetry(activeProjectId!, partial.telemetry, partial.nextCursor);
            } else if (partial.nextCursor !== undefined && partial.nextCursor !== requestCursor) {
              update({ cursor: partial.nextCursor });
            }
          }

          update({
            sessionStatus: latestStatus,
            progress: Math.round(latestStatus.progressPct),
            currentFrame: latestStatus.currentFrame,
            totalFrames: latestStatus.totalFrames,
            analyzedFrames: latestStatus.analyzedFrames,
            status:
              latestStatus.status === 'ERROR'
                ? 'ERROR'
                : latestStatus.status === 'COMPLETED'
                ? 'PROCESSING'
                : latestStatus.status === 'CANCEL_REQUESTED'
                ? 'CANCEL_REQUESTED'
                : latestStatus.status === 'INTERRUPTED'
                ? 'INTERRUPTED'
                : latestStatus.status === 'CANCELLED'
                ? 'CANCELLED'
                : 'PROCESSING',
            error: latestStatus.error || null,
          });

          if (latestStatus.status === 'ERROR') {
            throw new Error(latestStatus.error || 'Tracking engine error');
          }

          if (latestStatus.status === 'COMPLETED') {
            const freshState = store.getProjectState(activeProjectId!);
            if (freshState) {
              await store.persistCompletedAnalysis(activeProjectId!, freshState);
            }
          } else if (latestStatus.status === 'INTERRUPTED' || latestStatus.status === 'CANCELLED') {
            return;
          } else {
            timer.current = setTimeout(() => void poll(), 500);
          }
        } catch (err) {
          if (current()) {
            update({
              error: err instanceof Error ? err.message : 'Tracking failed',
              status: 'ERROR',
            });
          }
        }
      };
      void poll();
    },
    [activeProjectId, store, update]
  );

  // Navigation-Safe Session Lifecycle & Discovery
  useEffect(() => {
    if (!activeProjectId || onlineRef.current === false) return;
    let alive = true;
    const generationRef = generation;
    const timerRef = timer;
    const runId = ++generationRef.current;

    const syncSession = async () => {
      const snapshot = store.getProjectState(activeProjectId);
      if (!snapshot) return;
      const isThai = thRef.current;

      // Case A: active project already has a sessionId in store
      if (
        snapshot.sessionId &&
        ['VIDEO_READY', 'READY_TO_ANALYZE', 'PROCESSING', 'CANCEL_REQUESTED', 'CANCELLED', 'INTERRUPTED', 'UPLOADING', 'COMPLETED', 'ERROR'].includes(snapshot.status)
      ) {
        if (file && snapshot.videoFingerprint) {
          if (snapshot.videoFingerprint !== computeVideoFingerprint(file)) {
            if (['VIDEO_READY', 'READY_TO_ANALYZE', 'CANCELLED', 'INTERRUPTED', 'ERROR'].includes(snapshot.status)) {
              void aiTrackingService.deleteSession(snapshot.sessionId).catch(() => {});
              update({ sessionId: null, status: 'IDLE', sessionStatus: null });
            }
            return;
          }
        }

        try {
          const currentStatus = await aiTrackingService.getSessionStatus(snapshot.sessionId);
          if (!alive) return;
          update({
            sessionStatus: currentStatus,
            progress: Math.round(currentStatus.progressPct),
            currentFrame: currentStatus.currentFrame,
            totalFrames: currentStatus.totalFrames,
            analyzedFrames: currentStatus.analyzedFrames,
          });

          if (currentStatus.status === 'VIDEO_READY') {
            update({ status: 'VIDEO_READY' });
          } else if (currentStatus.status === 'READY_TO_ANALYZE') {
            update({ status: 'READY_TO_ANALYZE' });
          } else if (currentStatus.status === 'PROCESSING') {
            update({ status: 'PROCESSING' });
            pollSession(snapshot.sessionId, runId);
          } else if (currentStatus.status === 'CANCEL_REQUESTED') {
            update({ status: 'CANCEL_REQUESTED' });
            pollSession(snapshot.sessionId, runId);
          } else if (currentStatus.status === 'INTERRUPTED' || currentStatus.status === 'CANCELLED') {
            update({ status: currentStatus.status });
          } else if (currentStatus.status === 'COMPLETED') {
            const freshState = store.getProjectState(activeProjectId);
            if (freshState) {
              update({ status: 'PROCESSING' });
              try {
                await store.persistCompletedAnalysis(activeProjectId, freshState);
              } catch (err) {
                if (alive) {
                  update({
                    status: 'ERROR',
                    error: err instanceof Error ? err.message : 'Unable to persist completed analysis',
                  });
                }
              }
            }
          } else if (currentStatus.status === 'ERROR') {
            update({ status: 'ERROR', error: currentStatus.error || 'Unknown backend error' });
          }
        } catch {
          // Status check failure
        }
        return;
      }

      // Case B: No sessionId in store, discover from backend listSessions
      try {
        const fingerprint = snapshot.videoFingerprint || (file ? computeVideoFingerprint(file) : null);
        const recoveryIssues: string[] = [];
        let recoveryIssueCount = 0;
        let recoveryIssuesTruncated = false;
        let cursor: string | null = null;
        let firstPage = true;
        let candidate = null;
        if (fingerprint) {
          do {
            const page = await aiTrackingService.listSessions(activeProjectId, cursor);
            if (!alive) return;
            if (firstPage) {
              recoveryIssues.push(...page.recoveryIssues.slice(0, 3));
              recoveryIssueCount = page.recoveryIssueCount;
              recoveryIssuesTruncated = page.recoveryIssuesTruncated;
              firstPage = false;
            }
            recoveryIssueCount += page.pageIssueCount;
            for (const issue of page.pageIssues) {
              if (recoveryIssues.length < 3) recoveryIssues.push(issue);
            }
            recoveryIssuesTruncated ||= page.pageIssuesTruncated || page.pageIssueCount > 3;
            candidate = page.sessions.find((item) => isCompatibleResumableTrackingSession(item, {
              projectId: activeProjectId,
              videoFingerprint: fingerprint,
              processingConfig: snapshot.processingConfig,
            })) ?? null;
            if (candidate || !page.nextCursor) break;
            if (page.nextCursor === cursor) throw new Error('Tracking job listing repeated a cursor');
            cursor = page.nextCursor;
          } while (alive);
        }
        const recoveryNotice = recoveryIssueCount > 0
          ? `${isThai ? 'พบปัญหาการกู้คืน' : 'Recovery diagnostics'} (${recoveryIssueCount}): ${recoveryIssues.slice(0, 3).join('; ')}${recoveryIssuesTruncated || recoveryIssueCount > 3 ? '…' : ''}`
          : !fingerprint ? (isThai ? 'ยังเลือกงานกู้คืนไม่ได้: ไม่พบ fingerprint ของวิดีโอสำหรับยืนยันสื่อ' : 'Resume job not selected: video fingerprint is unavailable for media verification') : null;
        if (candidate) {
          update({
            error: recoveryNotice,
            sessionId: candidate.sessionId,
            status: normalizeBackendSessionStatus(candidate.status),
            gameType: candidate.gameType,
            trackedPlayerCount:
              candidate.trackedPlayerCount ?? (candidate.gameType === 'singles' ? 2 : 4),
            progress: Math.round(candidate.progressPct),
            currentFrame: candidate.currentFrame,
            totalFrames: candidate.totalFrames,
            videoFingerprint: candidate.videoFingerprint,
            sessionStatus: candidate,
            processingConfig: candidate.processingConfig
              ? { ...snapshot.processingConfig, ...candidate.processingConfig }
              : snapshot.processingConfig,
          });
          if (['PROCESSING', 'CANCEL_REQUESTED', 'COMPLETED'].includes(candidate.status)) {
            pollSession(candidate.sessionId, runId);
          }
        } else if (recoveryNotice) {
          update({ error: recoveryNotice });
        }
      } catch (error) {
        update({ error: error instanceof Error ? error.message : 'Unable to list compatible tracking jobs' });
      }
    };

    void syncSession();

    return () => {
      alive = false;
      generationRef.current++;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Note: We intentionally do NOT abort or delete session here!
      // Navigation is NOT cancellation!
    };
  }, [activeProjectId, file, pollSession, store, update]);

  return {
    generation,
    timer,
    pollSession,
  };
}

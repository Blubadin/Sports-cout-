import React, { type RefObject } from 'react';
import { computeVideoFingerprint } from '../../services/trackingSessionStore';
import type { TrackingOverlayMode, TrackingSessionStatus, TrackingTelemetryV1 } from '../../types';
import TrackingVideoOverlay from './TrackingVideoOverlay';
import type { ProjectedCourtMarking } from './courtMarkingOverlay';
import { ShuttleControls, ShuttleDiagnostics, ShuttleOverlay, type ShuttleMode } from './ShuttleOverlay';
import { TRACKING_LAB_BUTTON_CLASS } from './trackingLabStatus';

const OVERLAY_MODES: readonly { id: TrackingOverlayMode; en: string; th: string }[] = [
  { id: 'skeleton', en: 'Skeleton', th: 'โครงกระดูก' },
  { id: 'center', en: 'Body Center', th: 'จุดกลางร่างกาย' },
  { id: 'feet', en: 'Feet', th: 'ตำแหน่งเท้า' },
  { id: 'box', en: 'Bounding Box', th: 'กรอบผู้เล่น' },
  { id: 'off', en: 'Off', th: 'ปิด' },
];

interface TrackingVideoStageProps {
  th: boolean;
  url: string;
  file: File | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  dimensions: { width: number; height: number };
  onSetDimensions: (dims: { width: number; height: number }) => void;
  sessionId: string | null;
  sessionStatus: TrackingSessionStatus | null;
  processing: boolean;
  calibrating: boolean;
  onStopCalibrating: () => void;
  videoFingerprint: string | null;
  savedVideoTime: number;
  time: number;
  onSetTime: (time: number) => void;
  onSaveVideoTime: (time: number) => void;
  onLoadOverlayWindow: (targetTime: number, force?: boolean) => Promise<void>;
  displayFrames: TrackingTelemetryV1[];
  framesLength: number;
  overlayMode: TrackingOverlayMode;
  onChangeOverlayMode: (mode: TrackingOverlayMode) => void;
  shuttleMode: ShuttleMode;
  onChangeShuttleMode: (mode: ShuttleMode) => void;
  overlayStatus: string | null;
  overlayWindowStatus: 'idle' | 'loading' | 'ready' | 'unavailable' | 'error';
  overlayFrame: TrackingTelemetryV1 | null;
  courtOverlayCorners: number[][] | null;
  courtOverlayLines: ProjectedCourtMarking[];
  courtStartsLater: boolean;
  firstCourtTime: number | null;
  corners: number[][];
  onUpdateCorners: (corners: number[][]) => void;
  latestFrame: TrackingTelemetryV1 | null;
  lostSegmentId: string | null;
  lostSegmentKey: string | null;
  recoverySelectionKey: string | null;
  recoverySelectionFrame: { frameIndex: number; timestampSec: number } | null;
  recoveryViewReady: boolean;
  onClearRecoveryViewReady: () => void;
  onSyncRecoveryViewOnSeek: (currentTime: number) => void;
  recoveryPending: boolean;
  recoveryError: string | null;
  onStartCornerSelection: () => void;
  onApplySuggestedRecoveryCorners: (corners: number[][]) => void;
  onApplyManualRecovery: () => Promise<void>;
}

export function TrackingVideoStage({
  th,
  url,
  file,
  videoRef,
  dimensions,
  onSetDimensions,
  sessionId,
  sessionStatus,
  processing,
  calibrating,
  onStopCalibrating,
  videoFingerprint,
  savedVideoTime,
  time,
  onSetTime,
  onSaveVideoTime,
  onLoadOverlayWindow,
  displayFrames,
  framesLength,
  overlayMode,
  onChangeOverlayMode,
  shuttleMode,
  onChangeShuttleMode,
  overlayStatus,
  overlayWindowStatus,
  overlayFrame,
  courtOverlayCorners,
  courtOverlayLines,
  courtStartsLater,
  firstCourtTime,
  corners,
  onUpdateCorners,
  latestFrame,
  lostSegmentId,
  lostSegmentKey,
  recoverySelectionKey,
  recoverySelectionFrame,
  recoveryViewReady,
  onClearRecoveryViewReady,
  onSyncRecoveryViewOnSeek,
  recoveryPending,
  recoveryError,
  onStartCornerSelection,
  onApplySuggestedRecoveryCorners,
  onApplyManualRecovery,
}: TrackingVideoStageProps) {
  const suggested = sessionStatus?.runtimeProvenance?.calibration?.suggestedCorners;
  const suggestedConf = sessionStatus?.runtimeProvenance?.calibration?.suggestedConfidence;
  const hasSuggestedCorners = Array.isArray(suggested) && suggested.length === 4;

  return (
    <>
      <div
        className="relative w-full max-w-4xl bg-black"
        style={{
          aspectRatio: dimensions.width ? `${dimensions.width}/${dimensions.height}` : '16/9',
        }}
      >
        <video
          ref={videoRef}
          src={url}
          controls={!calibrating}
          className="w-full h-full"
          onLoadedMetadata={(e) => {
            onSetDimensions({
              width: e.currentTarget.videoWidth,
              height: e.currentTarget.videoHeight,
            });
            const savedTime = videoFingerprint && file
              && videoFingerprint === computeVideoFingerprint(file)
              ? savedVideoTime
              : 0;
            const restoredTime = Number.isFinite(savedTime) && savedTime > 0
              ? (Number.isFinite(e.currentTarget.duration) ? Math.min(savedTime, e.currentTarget.duration) : savedTime)
              : 0;
            if (restoredTime > 0) {
              e.currentTarget.currentTime = restoredTime;
            }
            onSetTime(restoredTime);
            void onLoadOverlayWindow(restoredTime, true);
          }}
          onTimeUpdate={(e) => {
            const cur = e.currentTarget.currentTime;
            onSetTime(cur);
            onSaveVideoTime(cur);
            void onLoadOverlayWindow(cur);
          }}
          onSeeked={(e) => {
            const cur = e.currentTarget.currentTime;
            onSetTime(cur);
            onSaveVideoTime(cur);
            void onLoadOverlayWindow(cur, true);
            onSyncRecoveryViewOnSeek(cur);
          }}
          onSeeking={onClearRecoveryViewReady}
        />
        <TrackingVideoOverlay
          frames={displayFrames}
          time={time}
          mode={overlayMode}
          isProcessing={processing}
        />
        <ShuttleOverlay frames={displayFrames} time={time} mode={shuttleMode} width={dimensions.width} height={dimensions.height} />
        {overlayStatus && (
          <div
            role={overlayWindowStatus === 'error' ? 'alert' : 'status'}
            aria-live={overlayWindowStatus === 'error' ? 'assertive' : 'polite'}
            className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 rounded border border-slate-600 bg-slate-950/90 px-3 py-1.5 text-xs text-slate-200 shadow"
          >
            {overlayStatus}
          </div>
        )}
        {overlayFrame && (
          <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1.5 pointer-events-none z-10 text-[11px] font-mono">
            {overlayFrame.sceneState && (
              <span className={`px-2 py-0.5 rounded border font-semibold ${
                overlayFrame.sceneState === 'COURT_PLAY'
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                  : overlayFrame.sceneState === 'REPLAY'
                    ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                    : overlayFrame.sceneState === 'SIDE_PLAY'
                      ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                      : overlayFrame.sceneState === 'CAMERA_TRANSITION'
                        ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                        : 'bg-slate-900/80 border-slate-700 text-slate-300'
              }`}>
                {overlayFrame.sceneState}
              </span>
            )}
            {overlayFrame.cameraSegmentId && (
              <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-900/80 text-slate-300">
                {overlayFrame.cameraSegmentId}
              </span>
            )}
            {overlayFrame.calibrationState && (
              <span
                className={`px-2 py-0.5 rounded border ${
                  overlayFrame.calibrationState === 'CALIBRATED'
                    ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                    : overlayFrame.calibrationState === 'RECALIBRATING'
                      ? 'bg-amber-950/90 border-amber-500 text-amber-200 animate-pulse motion-reduce:animate-none'
                      : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                }`}
                title={overlayFrame.calibrationUnavailableReason || overlayFrame.calibrationState}
              >
                {overlayFrame.calibrationState}
              </span>
            )}
            {overlayFrame.canTrackPlayer !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded border ${
                  overlayFrame.canTrackPlayer
                    ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/80 border-slate-700 text-slate-500 line-through'
                }`}
                title={overlayFrame.capabilities?.canTrackPlayer?.reason || 'Player tracking'}
              >
                2D
              </span>
            )}
            {overlayFrame.canUseCourtMetric !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded border ${
                  overlayFrame.canUseCourtMetric
                    ? 'bg-sky-950/80 border-sky-500/40 text-sky-300'
                    : 'bg-slate-900/80 border-slate-700 text-slate-500 line-through'
                }`}
                title={overlayFrame.capabilities?.canUseCourtMetric?.reason || 'Court metric'}
              >
                METRIC
              </span>
            )}
            {overlayFrame.canWriteCanonicalMatchData !== undefined && (
              <span
                className={`px-1.5 py-0.5 rounded border ${
                  overlayFrame.canWriteCanonicalMatchData
                    ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/80 border-slate-700 text-slate-500 line-through'
                }`}
                title={overlayFrame.capabilities?.canWriteCanonicalMatchData?.reason || 'Canonical writes'}
              >
                CANONICAL
              </span>
            )}
          </div>
        )}
        {!calibrating && courtOverlayCorners && (
          <svg
            aria-label={th ? 'สนามที่ผ่านการตรวจสอบการปรับเทียบ' : 'Validated court calibration'}
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
          >
            <polygon
              points={courtOverlayCorners.map((point) => point.join(',')).join(' ')}
              fill="none"
              stroke="#38bdf8"
              strokeWidth={dimensions.width / 400}
            />
            {courtOverlayLines.map((line) => (
              <line
                key={line.id}
                data-testid={`court-marking-${line.id}`}
                x1={line.from[0]}
                y1={line.from[1]}
                x2={line.to[0]}
                y2={line.to[1]}
                stroke="#38bdf8"
                strokeOpacity="0.8"
                strokeWidth={dimensions.width / 800}
              />
            ))}
          </svg>
        )}
        {(calibrating || (corners.length > 0 && !sessionId && framesLength === 0) ||
          (corners.length > 0 && lostSegmentKey && recoverySelectionKey === lostSegmentKey)) && (
          <svg
            aria-label="Court calibration"
            viewBox={`0 0 ${dimensions.width || 1} ${dimensions.height || 1}`}
            className={`absolute inset-0 w-full h-full ${
              calibrating ? 'cursor-crosshair' : 'pointer-events-none'
            }`}
            onClick={(e) => {
              if (!calibrating || corners.length >= 4 || (lostSegmentId && !recoveryViewReady)) return;
              const rect = e.currentTarget.getBoundingClientRect();
              if (!rect.width || !rect.height) return;
              const next = [
                ...corners,
                [
                  Math.round(((e.clientX - rect.left) / rect.width) * dimensions.width),
                  Math.round(((e.clientY - rect.top) / rect.height) * dimensions.height),
                ],
              ];
              onUpdateCorners(next);
              if (next.length === 4) onStopCalibrating();
            }}
          >
            {corners.length > 1 && (
              <polyline
                points={[...corners, ...(corners.length === 4 ? [corners[0]] : [])]
                  .map((p) => p.join(','))
                  .join(' ')}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={dimensions.width / 400}
              />
            )}
            {corners.map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r={dimensions.width / 160} fill="#38bdf8" />
                <text
                  x={x + dimensions.width / 100}
                  y={y}
                  fontSize={dimensions.width / 50}
                  fill="white"
                >
                  {['TL', 'TR', 'BR', 'BL'][i]}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
      {courtStartsLater && (
        <div role="status" className="mt-2 flex flex-wrap items-center gap-2 rounded border border-sky-900 bg-slate-900 px-3 py-2 text-sm text-sky-200">
          <span>
            {th
              ? `วิดีโอช่วงนี้ยังไม่ผ่านการปรับเทียบสนาม ระบบเริ่มแสดงแนวเส้นสนามที่ ${firstCourtTime!.toFixed(1)} วินาที`
              : `This part of the video is not court calibrated yet. Court line guides begin at ${firstCourtTime!.toFixed(1)} s.`}
          </span>
          <button
            type="button"
            className="rounded border border-sky-700 bg-sky-950 px-2 py-1 text-sky-100 hover:bg-sky-900"
            onClick={() => {
              const video = videoRef.current;
              if (!video || firstCourtTime == null) return;
              const target = Math.min(firstCourtTime,
                Number.isFinite(video.duration) && video.duration > 0 ? video.duration : Infinity);
              video.currentTime = target;
              onSetTime(target);
              onSaveVideoTime(target);
              void onLoadOverlayWindow(target, true);
            }}
          >
            {th ? 'ไปยังช่วงที่ตรวจพบสนาม' : 'Jump to detected court'}
          </button>
        </div>
      )}
      <ShuttleControls mode={shuttleMode} onChange={onChangeShuttleMode} />
      <ShuttleDiagnostics frames={displayFrames} time={time} />
      <button
        className={TRACKING_LAB_BUTTON_CLASS}
        disabled={(processing && !lostSegmentId) || !dimensions.width}
        onClick={onStartCornerSelection}
      >
        {th ? 'เลือก 4 มุมสนามจากภาพวิดีโอ' : 'Calibrate four court corners'}
      </button>
      {latestFrame?.calibrationState === 'RECALIBRATING' && (
        <div role="status" className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/30 text-amber-200 text-xs space-y-1">
          <p className="font-semibold text-amber-300">
            {th ? 'กำลังปรับเทียบสนามใหม่ (Recalibrating)' : 'Court Recalibration In Progress'}
          </p>
          <p className="text-slate-300">
            {latestFrame.calibrationUnavailableReason ||
              (th
                ? 'ตรวจพบการตัดภาพหรือการเคลื่อนไหวของกล้อง กำลังค้นหาเส้นสนามหรือรอการกู้คืนด้วยตนเอง'
                : 'Camera cut or motion drift detected. System is searching for court lines or awaiting manual recovery.')}
          </p>
        </div>
      )}
      {lostSegmentId && (
        <div role="status" className="text-sm text-amber-300 space-y-2 p-3 rounded-lg border border-amber-600/40 bg-amber-950/20">
          <p>
            {th
              ? 'การปรับเทียบสนามสูญหาย เลือกมุมสนาม 4 จุดจากภาพของช่วงกล้องปัจจุบัน'
              : 'Court calibration unavailable. Select four corners on the current camera segment.'}
          </p>
          {hasSuggestedCorners && (
            <div className="flex items-center justify-between gap-2 text-xs text-sky-300 bg-sky-950/40 p-2 rounded border border-sky-800/50">
              <span>
                {th
                  ? `ข้อเสนอ Hybrid: ตรวจพบจุดสนาม (${Math.round((suggestedConf || 0) * 100)}% ความมั่นใจ)`
                  : `Hybrid Proposal: Candidate corners detected (${Math.round((suggestedConf || 0) * 100)}% conf)`}
              </span>
              <button
                type="button"
                className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium transition-transform active:scale-95 motion-reduce:transform-none"
                onClick={() => onApplySuggestedRecoveryCorners(suggested)}
              >
                {th ? 'ใช้จุดแนะนำ' : 'Use suggested corners'}
              </button>
            </div>
          )}
          <button
            className={TRACKING_LAB_BUTTON_CLASS}
            disabled={corners.length !== 4 || recoverySelectionKey !== lostSegmentKey || !recoverySelectionFrame || !recoveryViewReady || recoveryPending}
            onClick={() => void onApplyManualRecovery()}
          >
            {recoveryPending
              ? (th ? 'กำลังบันทึก...' : 'Applying...')
              : (th ? 'ใช้การปรับเทียบด้วยตนเอง' : 'Apply manual calibration')}
          </button>
          {recoveryError && <p role="alert" className="text-red-300 text-xs">{recoveryError}</p>}
        </div>
      )}
      <p className="text-sm text-slate-400">
        {th
          ? 'เลือกมุมนอกสนามคู่: บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย'
          : 'Choose outer doubles court corners: top left → top right → bottom right → bottom left'}{' '}
        ({corners.length}/4)
      </p>
      <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
        <span className="text-slate-400">{th ? 'โหมดแสดงผลบนวิดีโอ:' : 'Overlay mode:'}</span>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
          {OVERLAY_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={overlayMode === m.id}
              onClick={() => onChangeOverlayMode(m.id)}
              className={`px-2.5 py-1 rounded transition-colors ${
                overlayMode === m.id
                  ? 'bg-sky-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {th ? m.th : m.en}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

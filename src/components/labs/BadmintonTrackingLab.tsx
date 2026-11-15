import React, { useEffect, useRef, useState } from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { BadmintonGameType } from '../../services/aiTrackingService';
import { useProjectTrackingSession } from '../../services/trackingSessionStore';
import BadmintonMovementDashboard from '../analytics/BadmintonMovementDashboard';
import ExportConfigModal from './ExportConfigModal';
import { type ShuttleMode } from './ShuttleOverlay';
import TrackingLabInspector from './TrackingLabInspector';
import { TrackingPerformanceControls } from './TrackingPerformanceControls';
import { TrackingVideoStage } from './TrackingVideoStage';
import { connectionStatusText, deriveShuttleEngineStatus, TRACKING_LAB_BUTTON_CLASS } from './trackingLabStatus';
import { useTrackingBackendConnection } from './useTrackingBackendConnection';
import { useTrackingCourtRecovery } from './useTrackingCourtRecovery';
import { useTrackingOverlayWindow } from './useTrackingOverlayWindow';
import { useTrackingSessionLifecycle } from './useTrackingSessionLifecycle';
import { useTrackingWorkflowActions } from './useTrackingWorkflowActions';

export { deriveShuttleEngineStatus };

export default function BadmintonTrackingLab() {
  const { matchInfo, settings, localFileName, setLocalFileName, setVideoSourceType } = useScoutContext();
  const { activeProjectId } = useWorkspace();
  const th = settings.uiLanguage === 'th';

  const {
    state,
    update,
    setFile,
    setUIPreference,
    cancel: cancelSession,
    store,
  } = useProjectTrackingSession(activeProjectId);

  const [url, setUrl] = useState('');
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [exportTargetSessionId, setExportTargetSessionId] = useState<string | null>(null);
  const [shuttleMode, setShuttleMode] = useState<ShuttleMode>('off');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const file = state.file;
  const processing = state.status === 'PROCESSING' || state.status === 'CANCEL_REQUESTED' || state.status === 'UPLOADING';
  const progress = state.progress;
  const gameType = state.gameType;
  const trackedPlayerCount = state.trackedPlayerCount;
  const corners = state.corners;
  const autoCourtCalibrationEnabled = state.processingConfig?.autoCourtCalibrationEnabled ?? false;
  const existingPreparedSession = !!state.sessionId &&
    ['READY_TO_ANALYZE', 'INTERRUPTED', 'CANCELLED'].includes(state.status);
  const calibrationReadyToStart = autoCourtCalibrationEnabled || corners.length === 4 || existingPreparedSession;
  const frames = state.telemetry;
  const sessionStatus = state.sessionStatus;
  const analysis = state.analysis;
  const completedAnalysisSessionId = analysis?.status === 'completed' && /^session_[a-f0-9]{8}$/.test(analysis.id)
    ? analysis.id : null;
  const exportSessionId = state.sessionId && sessionStatus?.status === 'COMPLETED'
    ? state.sessionId : completedAnalysisSessionId;
  const exportingPreviousAnalysis = Boolean(exportSessionId && exportSessionId !== state.sessionId);
  const chunks = state.chunks;
  const error = state.error;
  const overlayMode = state.uiPreferences.overlayMode;

  const { online, connection, capabilities, inferenceDevice } = useTrackingBackendConnection({
    activeProjectId,
    th,
    store,
    update,
  });

  const actualInferenceDevice = sessionStatus?.effectiveDevice ?? sessionStatus?.device ?? inferenceDevice;

  const courtRecovery = useTrackingCourtRecovery({
    sessionId: state.sessionId,
    status: state.status,
    frames,
    corners,
    gameType,
    videoRef,
    update,
  });

  const overlay = useTrackingOverlayWindow({
    activeProjectId,
    sessionId: state.sessionId,
    sessionStatus,
    frames,
    analysis,
    url,
    videoRef,
    dimensions,
    calibrating: courtRecovery.calibrating,
    th,
  });

  // Object URL for video playback (re-created safely in SPA session)
  useEffect(() => {
    if (!file) {
      setUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    setDimensions({ width: 0, height: 0 });
    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [file]);

  const { generation, timer, pollSession } = useTrackingSessionLifecycle({
    activeProjectId,
    file,
    analysisPresent: Boolean(analysis),
    stateLocalFileName: state.localFileName,
    contextLocalFileName: localFileName,
    online,
    th,
    store,
    update,
    setFile,
  });

  const workflow = useTrackingWorkflowActions({
    activeProjectId,
    sportType: matchInfo.sportType,
    online,
    processing,
    calibrationReadyToStart,
    autoCourtCalibrationEnabled,
    file,
    gameType,
    trackedPlayerCount,
    corners,
    state,
    capabilities,
    generation,
    timer,
    pollSession,
    update,
    setFile,
    setLocalFileName,
    setVideoSourceType,
    setUIPreference,
    cancelSession,
    store,
    onResetVideoView: () => {
      courtRecovery.resetRecovery();
      overlay.resetOverlayWindow();
    },
  });

  // This control describes the runtime available for the next analysis. A
  // completed analysis keeps its historical provenance in the results, but it
  // must not override a fresh capability probe after the service is restarted.
  const effectiveShuttleProv = (processing || sessionStatus?.status === 'PROCESSING')
    ? sessionStatus?.shuttle || sessionStatus?.runtimeProvenance?.shuttle || null
    : null;

  return (
    <div className="h-full overflow-y-auto bg-[#0c1721] text-slate-200 p-4 space-y-4">
      <div>
        <h2 className="font-bold text-lg">
          {th ? 'แล็บตรวจจับร่างกายและการเคลื่อนที่แบดมินตัน' : 'Badminton Tracking Lab'}
        </h2>
        <p className="text-sm text-slate-400">
          {th
            ? 'ตรวจจับผู้เล่นและจุดร่างกายจากวิดีโอจริง • ค่าท่าทางเป็นการประมาณแบบ 2 มิติ'
            : 'Real video player and body detection • Pose measurements are 2D estimates'}
        </p>
      </div>

      <div
        role="status"
        className={connection?.connected ? 'text-emerald-400' : 'text-amber-300'}
      >
        {connectionStatusText(connection, th)}
      </div>

      {actualInferenceDevice && (
        <p className="text-xs text-slate-400">Inference device: {actualInferenceDevice}</p>
      )}

      <TrackingPerformanceControls
        th={th}
        processing={processing}
        profile={workflow.profile}
        onSelectProfile={workflow.selectProfile}
        devicePreference={workflow.devicePreference}
        onChangeDevice={workflow.setDevicePreference}
        onMarkCustomProfile={() => workflow.setProfile('custom')}
        actualInferenceDevice={actualInferenceDevice}
        capabilities={capabilities}
        showAdvancedSettings={workflow.showAdvancedSettings}
        onToggleAdvancedSettings={() => workflow.setShowAdvancedSettings((prev) => !prev)}
        detectorInputSize={workflow.detectorInputSize}
        onChangeDetectorInputSize={workflow.setDetectorInputSize}
        effectiveFrameStride={workflow.effectiveFrameStride}
        requiredShuttleFrameStride={workflow.requiredShuttleFrameStride}
        onChangeFrameStride={workflow.setFrameStride}
        poseStride={workflow.poseStride}
        onChangePoseStride={workflow.setPoseStride}
        useCourtRoi={workflow.useCourtRoi}
        onChangeUseCourtRoi={workflow.setUseCourtRoi}
        courtRoiMarginPx={workflow.courtRoiMarginPx}
        onChangeCourtRoiMarginPx={workflow.setCourtRoiMarginPx}
        shuttleTrackingEnabled={workflow.shuttleTrackingEnabled}
        onToggleShuttleTracking={(enabled) => {
          workflow.setShuttleTrackingEnabled(enabled);
          update({
            processingConfig: {
              ...state.processingConfig,
              shuttleEnabled: enabled,
            },
          });
        }}
        effectiveShuttleProv={effectiveShuttleProv}
        processingConfig={state.processingConfig}
      />

      {online === false && (
        <p className="text-sm">
          {th ? 'เปิดบริการ AI ในเครื่องก่อนเริ่มวิเคราะห์' : 'Start the local AI service before running analysis.'}
        </p>
      )}

      {matchInfo.sportType !== 'badminton' && (
        <p className="text-amber-300">
          {th ? 'เลือกโปรเจกต์กีฬาแบดมินตันก่อนเริ่มวิเคราะห์' : 'Select a Badminton project to enable analysis.'}
        </p>
      )}

      <div className="space-y-1 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoCourtCalibrationEnabled}
            disabled={processing || (!!state.sessionId && ['VIDEO_READY', 'READY_TO_ANALYZE', 'INTERRUPTED', 'CANCELLED'].includes(state.status))}
            onChange={(e) => update({
              processingConfig: {
                ...state.processingConfig,
                autoCourtCalibrationEnabled: e.target.checked,
              },
            })}
            className="rounded bg-slate-800 border-slate-700 text-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500"
          />
          <span>{th ? 'ตรวจจับสนามอัตโนมัติ' : 'Automatic court calibration'}</span>
        </label>
        <p className="text-xs text-slate-400">
          {autoCourtCalibrationEnabled
            ? (th ? 'เริ่มได้โดยไม่ต้องเลือกมุมสนาม ค่าสนามจะแสดงเมื่อระบบตรวจสอบการปรับเทียบผ่านเท่านั้น'
              : 'Start without marking corners. Court metrics become available only after calibration is validated.')
            : (th ? 'เลือกมุมสนาม 4 จุดก่อนเริ่มวิเคราะห์' : 'Mark four court corners before starting analysis.')}
        </p>
      </div>

      {/* Video Selection & Reconnection */}
      <div className="space-y-2">
        <span className="block text-sm">{th ? 'เลือกไฟล์วิดีโอจากเครื่อง' : 'Select video file'}</span>
        {processing && (
          <p className="text-xs text-amber-300">
            {th
              ? 'ยกเลิกการวิเคราะห์และรอให้หยุดก่อนจึงจะเปลี่ยนวิดีโอได้'
              : 'Cancel analysis and wait for it to stop before changing videos.'}
          </p>
        )}
        <input
          ref={fileInputRef}
          aria-label="Select video file"
          type="file"
          accept="video/*"
          disabled={processing}
          onChange={(e) => workflow.choose(e.target.files?.[0])}
          className="sr-only"
        />
        <button
          type="button"
          className={`${TRACKING_LAB_BUTTON_CLASS} bg-sky-700 hover:bg-sky-600`}
          disabled={processing}
          onClick={() => fileInputRef.current?.click()}
        >
          {file
            ? th
              ? 'เปลี่ยนไฟล์วิดีโอ'
              : 'Change video file'
            : th
            ? 'เลือกไฟล์วิดีโอ'
            : 'Choose video file'}
        </button>
      </div>

      {!file && (state.sessionId || state.analysis || state.localFileName) && (
        <div
          data-testid="reconnect-source-video-banner"
          className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-amber-200 text-xs flex flex-wrap items-center justify-between gap-2"
        >
          <div>
            <div className="font-semibold">
              {th ? 'โปรดเชื่อมต่อไฟล์วิดีโอต้นฉบับอีกครั้ง' : 'Reconnect source video'}
            </div>
            <div className="text-[11px] text-amber-300/80">
              {th
                ? `เลือกไฟล์ ${state.localFileName || 'วิดีโอ'} เพื่อดูคลิปและโอเวอร์เลย์ (ข้อมูลผลการวิเคราะห์ยังคงอยู่)`
                : `Select ${state.localFileName || 'the video file'} to view playback & overlays. Analysis data is preserved.`}
            </div>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded font-medium text-xs whitespace-nowrap"
          >
            {th ? 'เชื่อมต่อไฟล์วิดีโอ' : 'Reconnect source video'}
          </button>
        </div>
      )}

      {!file && state.localFileName && !state.sessionId && !state.analysis && (
        <p className="text-sm text-slate-400">
          {th
            ? `เลือกไฟล์ ${state.localFileName} อีกครั้งเพื่อให้ระบบอ่านวิดีโอได้`
            : `Reselect ${state.localFileName} to give the analyzer access to the video.`}
        </p>
      )}

      {/* Match Configuration Controls */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <span>{th ? 'ประเภทการแข่งขัน' : 'Game type'}</span>
          <select
            aria-label={th ? 'ประเภทการแข่งขัน' : 'Game type'}
            disabled={processing}
            value={gameType}
            onChange={(e) => {
              const nextType = e.target.value as BadmintonGameType;
              update({
                gameType: nextType,
                trackedPlayerCount: nextType === 'singles' ? 2 : 4,
              });
            }}
            className="bg-slate-800 p-2 rounded"
          >
            <option value="singles">{th ? 'เดี่ยว' : 'Singles'}</option>
            <option value="doubles">{th ? 'คู่' : 'Doubles'}</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span>{th ? 'จำนวนผู้เล่นที่ตรวจจับ' : 'Players to track'}</span>
          <select
            aria-label={th ? 'จำนวนผู้เล่นที่ตรวจจับ' : 'Players to track'}
            disabled={processing}
            value={trackedPlayerCount}
            onChange={(e) => update({ trackedPlayerCount: Number(e.target.value) })}
            className="bg-slate-800 p-2 rounded"
          >
            <option value={1}>1 {th ? 'คน (เดี่ยวฝึกซ้อม)' : 'player (solo drill)'}</option>
            <option value={2}>2 {th ? 'คน (เดี่ยวแข่งขัน)' : 'players (singles)'}</option>
            <option value={3}>3 {th ? 'คน (2 ต่อ 1 / ป้อนลูก)' : 'players (2v1 / feeder)'}</option>
            <option value={4}>4 {th ? 'คน (คู่แข่งขัน)' : 'players (doubles)'}</option>
          </select>
        </label>
      </div>

      {url && (
        <TrackingVideoStage
          th={th}
          url={url}
          file={file}
          videoRef={videoRef}
          dimensions={dimensions}
          onSetDimensions={setDimensions}
          sessionId={state.sessionId}
          sessionStatus={sessionStatus}
          processing={processing}
          calibrating={courtRecovery.calibrating}
          onStopCalibrating={() => courtRecovery.setCalibrating(false)}
          videoFingerprint={state.videoFingerprint}
          savedVideoTime={state.uiPreferences.videoCurrentTime}
          time={overlay.time}
          onSetTime={overlay.setTime}
          onSaveVideoTime={(nextTime) => setUIPreference('videoCurrentTime', nextTime)}
          onLoadOverlayWindow={overlay.loadOverlayWindow}
          displayFrames={overlay.displayFrames}
          framesLength={frames.length}
          overlayMode={overlayMode}
          onChangeOverlayMode={(mode) => setUIPreference('overlayMode', mode)}
          shuttleMode={shuttleMode}
          onChangeShuttleMode={setShuttleMode}
          overlayStatus={overlay.overlayStatus}
          overlayWindowStatus={overlay.overlayWindowStatus}
          overlayFrame={overlay.overlayFrame}
          courtOverlayCorners={overlay.courtOverlayCorners}
          courtOverlayLines={overlay.courtOverlayLines}
          courtStartsLater={overlay.courtStartsLater}
          firstCourtTime={overlay.firstCourtTime}
          corners={corners}
          onUpdateCorners={(next) => update({ corners: next })}
          latestFrame={courtRecovery.latestFrame}
          lostSegmentId={courtRecovery.lostSegmentId}
          lostSegmentKey={courtRecovery.lostSegmentKey}
          recoverySelectionKey={courtRecovery.recoverySelectionKey}
          recoverySelectionFrame={courtRecovery.recoverySelectionFrame}
          recoveryViewReady={courtRecovery.recoveryViewReady}
          onClearRecoveryViewReady={() => courtRecovery.syncRecoveryViewOnSeek(Number.NaN)}
          onSyncRecoveryViewOnSeek={courtRecovery.syncRecoveryViewOnSeek}
          recoveryPending={courtRecovery.recoveryPending}
          recoveryError={courtRecovery.recoveryError}
          onStartCornerSelection={courtRecovery.startCornerSelection}
          onApplySuggestedRecoveryCorners={courtRecovery.applySuggestedRecoveryCorners}
          onApplyManualRecovery={courtRecovery.applyManualRecovery}
        />
      )}

      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}

      {processing ? (
        <div className="space-x-3">
          <span>
            {th ? 'กำลังวิเคราะห์' : 'Analyzing'} {progress}%
          </span>
          <button className={TRACKING_LAB_BUTTON_CLASS} onClick={workflow.cancel} disabled={state.status === 'CANCEL_REQUESTED'}>
            {state.status === 'CANCEL_REQUESTED'
              ? th ? 'กำลังหยุด…' : 'Stopping…'
              : th ? 'ยกเลิก' : 'Cancel analysis'}
          </button>
        </div>
      ) : (
        <button className={`${TRACKING_LAB_BUTTON_CLASS} bg-sky-700`} disabled={!workflow.canRun} onClick={() => void workflow.run()}>
          {th ? 'เริ่มตรวจจับร่างกายและการเคลื่อนที่' : 'Run Movement Analysis'}
        </button>
      )}

      {exportSessionId && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 shadow-sm">
          <p className="text-sm text-emerald-300 font-medium">
            {exportingPreviousAnalysis
              ? th ? 'ผลวิเคราะห์รอบก่อนเสร็จแล้ว สามารถส่งออกได้ระหว่างรอบปัจจุบัน'
                : 'The previous analysis is complete and can be exported while the current run continues.'
              : th
              ? 'วิเคราะห์เสร็จสมบูรณ์แล้ว กดเล่นวิดีโอเพื่อดูตำแหน่งร่างกายและการเคลื่อนที่'
              : 'Analysis complete. Play the video to inspect detected body positions and movement.'}
          </p>
          <button
            type="button"
            onClick={() => setExportTargetSessionId(exportSessionId)}
            className="flex shrink-0 items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-medium text-sm transition shadow"
          >
            <span>📥</span>
            <span>
              {th
                ? exportingPreviousAnalysis ? 'ส่งออกผลรอบก่อน (EXPORT)' : 'ส่งออกผลลัพธ์ (EXPORT)'
                : exportingPreviousAnalysis ? 'EXPORT PREVIOUS' : 'EXPORT'}
            </span>
          </button>
        </div>
      )}

      <TrackingLabInspector
        status={sessionStatus}
        isProcessing={processing}
        language={th ? 'th' : 'en'}
        projectId={activeProjectId}
        videoFingerprint={state.videoFingerprint}
        localFileName={state.localFileName || localFileName}
      />

      {analysis && (
        <BadmintonMovementDashboard
          analysis={analysis}
          chunks={chunks}
          hasMoreChunks={state.chunksHasMore}
          language={th ? 'th' : 'en'}
          title={th ? 'ผลการเคลื่อนที่ของผู้เล่น' : 'Player movement results'}
        />
      )}

      {exportTargetSessionId && (
        <ExportConfigModal
          isOpen={true}
          onClose={() => setExportTargetSessionId(null)}
          sessionId={exportTargetSessionId}
          language={th ? 'th' : 'en'}
        />
      )}
    </div>
  );
}

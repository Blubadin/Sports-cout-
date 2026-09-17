import React, { useEffect, useRef, useState } from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { aiTrackingService, type BadmintonGameType } from '../../services/aiTrackingService';
import type { TrackingTelemetryV1, TrackingOverlayMode, TrackingSessionStatus, ProcessingConfig, ProcessingProfile } from '../../types';
import { loadProjectVideoFileHandle } from '../../utils/videoFileStore';
import { downsampleAndChunkTrackingSamples, saveTrackingAnalysis, listTrackingAnalyses, getTrackingSampleChunks, type TrackingAnalysis, type TrackingSampleChunk } from '../../services/storage/trackingStorage';
import BadmintonMovementDashboard from '../analytics/BadmintonMovementDashboard';
import TrackingVideoOverlay from './TrackingVideoOverlay';
import TrackingLabInspector from './TrackingLabInspector';

export default function BadmintonTrackingLab() {
  const { matchInfo, settings, localFileName, setLocalFileName, setVideoSourceType } = useScoutContext();
  const { activeProjectId } = useWorkspace();
  const th = settings.uiLanguage === 'th';
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const [inferenceDevice, setInferenceDevice] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<{ selectedDevice: string; cudaAvailable: boolean; mpsAvailable: boolean } | null>(null);
  const [devicePreference, setDevicePreference] = useState<'auto' | 'cpu' | 'cuda' | 'mps'>('auto');
  const [profile, setProfile] = useState<ProcessingProfile>('auto');
  const [detectorInputSize, setDetectorInputSize] = useState<number>(640);
  const [useCourtRoi, setUseCourtRoi] = useState<boolean>(false);
  const [courtRoiMarginPx, setCourtRoiMarginPx] = useState<number>(60);
  const [frameStride, setFrameStride] = useState<number>(2);
  const [poseStride, setPoseStride] = useState<number>(1);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState<boolean>(false);
  const [gameType, setGameType] = useState<BadmintonGameType>('singles');
  const [trackedPlayerCount, setTrackedPlayerCount] = useState<number>(2);
  const [corners, setCorners] = useState<number[][]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [calibrating, setCalibrating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [frames, setFrames] = useState<TrackingTelemetryV1[]>([]);
  const [time, setTime] = useState(0);
  const [overlayMode, setOverlayMode] = useState<TrackingOverlayMode>('skeleton');
  const [sessionStatus, setSessionStatus] = useState<TrackingSessionStatus | null>(null);
  const [analysis, setAnalysis] = useState<TrackingAnalysis | null>(null);
  const [chunks, setChunks] = useState<TrackingSampleChunk[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const generation = useRef(0);
  const session = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upload = useRef<AbortController | null>(null);
  const cursorRef = useRef<number>(0);
  const accumulatedFrames = useRef<TrackingTelemetryV1[]>([]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const ok = await aiTrackingService.checkBackendHealth();
      if (!alive) return;
      setOnline(ok);
      if (ok) {
        try {
          const capabilities = await aiTrackingService.getCapabilities();
          if (alive) {
            setCapabilities(capabilities);
            setInferenceDevice(capabilities.selectedDevice);
          }
        } catch {
          if (alive) { setInferenceDevice(null); setCapabilities(null); }
        }
      } else {
        setInferenceDevice(null); setCapabilities(null);
      }
    };
    void check();
    const interval = setInterval(check, 10000);
    return () => { alive = false; clearInterval(interval); };
  }, []);

  useEffect(() => {
    let alive = true;
    setFile(null); setCorners([]); setFrames([]); setAnalysis(null); setChunks([]);
    void loadProjectVideoFileHandle(activeProjectId, localFileName).then(async handle => {
      if (!handle || (handle.queryPermission && await handle.queryPermission({ mode: 'read' }) !== 'granted')) return;
      const restored = await handle.getFile();
      if (alive) setFile(restored);
    }).catch(() => {});
    if (activeProjectId) void listTrackingAnalyses(activeProjectId).then(async records => {
      const latest = records.at(-1);
      if (!latest) return;
      const saved = await getTrackingSampleChunks(latest.id);
      if (alive) {
        setAnalysis(latest);
        setChunks(saved);
        if (latest.trackedPlayerCount) setTrackedPlayerCount(latest.trackedPlayerCount);
        if (latest.gameType) setGameType(latest.gameType);
      }
    }).catch(() => {});
    return () => {
      alive = false; generation.current++;
      if (timer.current) clearTimeout(timer.current);
      upload.current?.abort();
      session.current = null;
    };
  }, [activeProjectId]);

  const selectProfile = (nextProfile: ProcessingProfile) => {
    setProfile(nextProfile);
    if (nextProfile === 'reference') {
      setDetectorInputSize(640);
      setUseCourtRoi(false);
      setCourtRoiMarginPx(60);
      setFrameStride(2);
      setPoseStride(1);
    } else if (nextProfile === 'quality') {
      setDetectorInputSize(640);
      setUseCourtRoi(false);
      setCourtRoiMarginPx(60);
      setFrameStride(1);
      setPoseStride(1);
    } else if (nextProfile === 'balanced') {
      setDetectorInputSize(512);
      setUseCourtRoi(true);
      setCourtRoiMarginPx(60);
      setFrameStride(2);
      setPoseStride(1);
    } else if (nextProfile === 'fast') {
      setDetectorInputSize(416);
      setUseCourtRoi(true);
      setCourtRoiMarginPx(60);
      setFrameStride(3);
      setPoseStride(2);
    } else if (nextProfile === 'auto') {
      const isCuda = capabilities?.cudaAvailable;
      if (isCuda) {
        setDetectorInputSize(512);
        setUseCourtRoi(true);
        setCourtRoiMarginPx(60);
        setFrameStride(2);
        setPoseStride(1);
      } else {
        setDetectorInputSize(416);
        setUseCourtRoi(true);
        setCourtRoiMarginPx(60);
        setFrameStride(3);
        setPoseStride(2);
      }
    }
  };

  const videoFingerprint = (source: File) => `${source.name}:${source.size}:${source.lastModified}`;

  const persistCompletedResult = async (
    sessionId: string,
    telemetry: TrackingTelemetryV1[],
    sourceFile: File,
    sessionGameType: BadmintonGameType,
    sessionTrackedPlayerCount?: number,
  ) => {
    if (telemetry.some(frame => frame.isSynthetic || frame.source === 'synthetic_demo')) {
      throw new Error('The service returned demo data instead of real video analysis.');
    }
    const saved = downsampleAndChunkTrackingSamples(sessionId, telemetry, 10, 15);
    const inferredCount = Object.keys(saved.summary.players).length || (sessionGameType === 'singles' ? 2 : 4);
    const effectiveCount = sessionTrackedPlayerCount ?? telemetry[0]?.trackedPlayerCount ?? inferredCount;
    const record: TrackingAnalysis = {
      id: sessionId, projectId: activeProjectId || 'current_project', sportType: 'badminton', gameType: sessionGameType,
      trackedPlayerCount: effectiveCount,
      status: 'completed', videoFingerprint: videoFingerprint(sourceFile),
      engineVersion: telemetry[0]?.engineVersion || 'tracking-v2', detectorModel: telemetry[0]?.modelVersion || 'YOLO', trackerModel: 'ByteTrack', poseModel: 'YOLO pose', sampleRateHz: 10,
      createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
      processingConfig: sessionStatus?.processingConfig,
      performance: sessionStatus?.performance,
      qualityStats: sessionStatus?.quality,
      players: Object.keys(saved.summary.players).map(playerId => {
        const pData = telemetry.flatMap(frame => frame.players).find(p => p.playerId === playerId);
        let side: 'near' | 'far' | 'unknown' = 'unknown';
        if (pData?.teamCode === 'team1') {
          side = 'far';
        } else if (pData?.teamCode === 'team2') {
          side = 'near';
        } else if (pData?.courtPosition?.yM !== undefined) {
          side = pData.courtPosition.yM < 6.70 ? 'far' : 'near';
        }
        return { playerId, name: playerId, side };
      }),
      summary: saved.summary, quality: saved.quality,
    };
    await saveTrackingAnalysis(record, saved.chunks);
    setAnalysis(record); setChunks(saved.chunks); setProcessing(false);
    if (videoRef.current) videoRef.current.currentTime = 0;
    setTime(0);
  };

  const pollSession = (sessionId: string, runId: number, sourceFile: File, sessionGameType: BadmintonGameType, sessionTrackedPlayerCount?: number) => {
    const current = () => generation.current === runId;
    const poll = async (): Promise<void> => {
      try {
        const state = await aiTrackingService.getSessionStatus(sessionId);
        if (!current()) return;
        setSessionStatus(state);
        setProgress(Math.round(state.progressPct));
        if (state.status === 'ERROR') throw new Error(state.error || 'Tracking engine error');
        const effectiveCount = sessionTrackedPlayerCount ?? state.trackedPlayerCount;
        const partial = await aiTrackingService.getSessionResults(sessionId, cursorRef.current);
        if (!current()) return;
        if (partial.telemetry.length > 0) {
          cursorRef.current = partial.nextCursor;
          const existingMap = new Set(accumulatedFrames.current.map(f => `${f.frameIndex}:${f.timestampSec}`));
          const uniqueNew = partial.telemetry.filter(f => !existingMap.has(`${f.frameIndex}:${f.timestampSec}`));
          if (uniqueNew.length > 0) {
            accumulatedFrames.current.push(...uniqueNew);
            setFrames([...accumulatedFrames.current]);
          }
        }
        if (state.status === 'COMPLETED') {
          await persistCompletedResult(sessionId, accumulatedFrames.current, sourceFile, sessionGameType, effectiveCount);
          session.current = null;
        } else {
          timer.current = setTimeout(() => void poll(), 500);
        }
      } catch (err) {
        if (current()) {
          setError(err instanceof Error ? err.message : 'Tracking failed');
          setProcessing(false);
        }
      }
    };
    void poll();
  };

  useEffect(() => {
    if (!file || !activeProjectId || online !== true || processing) return;
    let alive = true;
    const recover = async () => {
      try {
        const sessions = await aiTrackingService.listSessions(activeProjectId);
        const candidate = sessions.find(item => item.videoFingerprint === videoFingerprint(file) && (item.status === 'PROCESSING' || item.status === 'COMPLETED'));
        if (!alive || !candidate) return;
        session.current = candidate.sessionId;
        const runId = ++generation.current;
        setProgress(Math.round(candidate.progressPct));
        cursorRef.current = 0;
        accumulatedFrames.current = [];
        setFrames([]);
        setProcessing(candidate.status === 'PROCESSING');
        pollSession(candidate.sessionId, runId, file, candidate.gameType, candidate.trackedPlayerCount);
      } catch {
        // A missing backend should be reported by the normal health indicator.
      }
    };
    void recover();
    return () => { alive = false; };
  }, [file, activeProjectId, online]);

  useEffect(() => {
    if (!file) { setUrl(''); return; }
    const next = URL.createObjectURL(file); setUrl(next); setDimensions({ width: 0, height: 0 });
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const cancel = () => {
    generation.current++;
    if (timer.current) clearTimeout(timer.current);
    upload.current?.abort();
    if (session.current) void aiTrackingService.deleteSession(session.current).catch(() => {});
    session.current = null; setProcessing(false); setProgress(0);
    cursorRef.current = 0;
    accumulatedFrames.current = [];
    setSessionStatus(null);
  };

  const run = async () => {
    if (!file || online !== true || corners.length !== 4 || processing || matchInfo.sportType !== 'badminton') return;
    const runId = ++generation.current;
    const current = () => generation.current === runId;
    setProcessing(true); setError(null); setProgress(0); setFrames([]);
    cursorRef.current = 0;
    accumulatedFrames.current = [];
    setSessionStatus(null);
    let id: string | null = null;
    const fail = (err: unknown) => { if (current()) { setError(err instanceof Error ? err.message : 'Tracking failed'); setProcessing(false); } };
    try {
      const processingConfig: ProcessingConfig = {
        profile,
        device: devicePreference,
        detectorInputSize,
        useCourtRoi,
        courtRoiMarginPx,
        frameStride,
        poseStride,
      };
      const created = await aiTrackingService.createSession(gameType, 'upload', {
        projectId: activeProjectId,
        videoFingerprint: videoFingerprint(file),
        device: devicePreference,
        trackedPlayerCount,
        processingConfig,
      });
      id = created.sessionId;
      if (!current()) { void aiTrackingService.deleteSession(id); return; }
      session.current = id;
      upload.current = new AbortController();
      await aiTrackingService.uploadSessionVideo(id, file, upload.current.signal);
      if (!current()) return;
      await aiTrackingService.calibrateSession(id, corners, gameType);
      if (!current()) return;
      await aiTrackingService.startSessionAnalysis(id);
      if (!current()) return;
      pollSession(id, runId, file, gameType, trackedPlayerCount);
    } catch (err) { fail(err); }
  };

  const choose = (next: File | undefined) => {
    if (!next) return;
    cancel(); setFile(next); setLocalFileName(next.name); setVideoSourceType('local');
    setCorners([]); setFrames([]); setAnalysis(null); setChunks([]); setError(null); setCalibrating(false);
    cursorRef.current = 0;
    accumulatedFrames.current = [];
    setSessionStatus(null);
  };
  const canRun = matchInfo.sportType === 'badminton' && online === true && !!file && corners.length === 4 && !processing;
  const button = 'rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed';
  return <div className="h-full overflow-y-auto bg-[#0c1721] text-slate-200 p-4 space-y-4">
    <div><h2 className="font-bold text-lg">{th ? 'แล็บตรวจจับร่างกายและการเคลื่อนที่แบดมินตัน' : 'Badminton Tracking Lab'}</h2>
      <p className="text-sm text-slate-400">{th ? 'ตรวจจับผู้เล่นและจุดร่างกายจากวิดีโอจริง • ค่าท่าทางเป็นการประมาณแบบ 2 มิติ' : 'Real video player and body detection • Pose measurements are 2D estimates'}</p></div>
    <div role="status" className={online ? 'text-emerald-400' : 'text-amber-300'}>{online === null ? (th ? 'กำลังตรวจสอบบริการ AI…' : 'Checking local AI service…') : online ? (th ? 'บริการ AI พร้อมใช้งาน' : 'Local AI service online') : (th ? 'บริการ AI ยังไม่ทำงาน' : 'Local AI service offline')}</div>
    {inferenceDevice && <p className="text-xs text-slate-400">Inference device: {inferenceDevice}</p>}
    <div className="flex items-center gap-2 text-sm">
      <span>{th ? 'โหมดประมวลผล' : 'Processing mode'}</span>
      <select aria-label="Processing mode" disabled={processing} value={devicePreference} onChange={e => setDevicePreference(e.target.value as 'auto' | 'cpu' | 'cuda' | 'mps')} className="bg-slate-800 p-2 rounded">
        <option value="auto">{th ? 'อัตโนมัติ' : 'Auto'}</option>
        <option value="cpu">CPU</option>
        <option value="cuda" disabled={!capabilities?.cudaAvailable}>GPU (CUDA){capabilities?.cudaAvailable ? '' : ' — unavailable'}</option>
        <option value="mps" disabled={!capabilities?.mpsAvailable}>GPU (MPS){capabilities?.mpsAvailable ? '' : ' — unavailable'}</option>
      </select>
      <button
        type="button"
        className={button}
        disabled={processing || !capabilities?.cudaAvailable}
        title={capabilities?.cudaAvailable ? 'Use NVIDIA CUDA for this analysis' : 'CUDA is unavailable in the current Python environment'}
        onClick={() => setDevicePreference('cuda')}
      >{th ? 'ใช้ GPU' : 'Use GPU'}</button>
    </div>

    {/* Performance Profiles and Advanced Benchmark Controls */}
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className="flex items-center gap-2">
        <span>{th ? 'โปรไฟล์การประมวลผล' : 'Performance profile'}</span>
        <select
          aria-label={th ? 'โปรไฟล์การประมวลผล' : 'Performance profile'}
          disabled={processing}
          value={profile}
          onChange={e => selectProfile(e.target.value as ProcessingProfile)}
          className="bg-slate-800 p-2 rounded"
        >
          <option value="auto">{th ? 'อัตโนมัติ (Auto)' : 'Auto'}</option>
          <option value="reference">{th ? 'มาตรฐาน (Reference baseline)' : 'Reference baseline'}</option>
          <option value="fast">{th ? 'เน้นความเร็ว (Fast)' : 'Fast'}</option>
          <option value="balanced">{th ? 'สมดุล (Balanced)' : 'Balanced'}</option>
          <option value="quality">{th ? 'เน้นความแม่นยำ (Quality)' : 'Quality'}</option>
          {profile === 'custom' && <option value="custom">{th ? 'กำหนดเอง (Custom)' : 'Custom'}</option>}
        </select>
      </label>
      <button
        type="button"
        className="text-xs text-sky-400 hover:text-sky-300 underline"
        onClick={() => setShowAdvancedSettings(prev => !prev)}
      >
        {showAdvancedSettings
          ? th ? 'ซ่อนการตั้งค่าขั้นสูง ▲' : 'Hide advanced settings ▲'
          : th ? 'ตั้งค่าขั้นสูง (Advanced) ▼' : 'Advanced settings ▼'}
      </button>
    </div>

    {showAdvancedSettings && (
      <div data-testid="advanced-settings-drawer" className="bg-slate-900/60 border border-slate-800 rounded p-3 text-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="space-y-1 block">
            <span className="text-slate-400 block">{th ? 'ความละเอียดตัวตรวจจับ' : 'Detector Input Size'}</span>
            <select
              aria-label="Detector Input Size"
              disabled={processing}
              value={detectorInputSize}
              onChange={e => {
                setDetectorInputSize(Number(e.target.value));
                setProfile('custom');
              }}
              className="bg-slate-800 p-1.5 rounded w-full text-slate-200"
            >
              <option value={416}>416 px</option>
              <option value={512}>512 px</option>
              <option value={640}>640 px</option>
            </select>
          </label>
          <label className="space-y-1 block">
            <span className="text-slate-400 block">{th ? 'สุ่มเฟรมตรวจจับ (Frame Stride)' : 'Frame Stride'}</span>
            <select
              aria-label="Frame Stride"
              disabled={processing}
              value={frameStride}
              onChange={e => {
                setFrameStride(Number(e.target.value));
                setProfile('custom');
              }}
              className="bg-slate-800 p-1.5 rounded w-full text-slate-200"
            >
              <option value={1}>1 ({th ? 'ทุกเฟรม' : 'Every frame'})</option>
              <option value={2}>2 ({th ? 'ทุก 2 เฟรม' : 'Every 2nd frame'})</option>
              <option value={3}>3 ({th ? 'ทุก 3 เฟรม' : 'Every 3rd frame'})</option>
              <option value={4}>4 ({th ? 'ทุก 4 เฟรม' : 'Every 4th frame'})</option>
            </select>
          </label>
          <label className="space-y-1 block">
            <span className="text-slate-400 block">{th ? 'สุ่มเฟรมท่าทาง (Pose Stride)' : 'Pose Stride'}</span>
            <select
              aria-label="Pose Stride"
              disabled={processing}
              value={poseStride}
              onChange={e => {
                setPoseStride(Number(e.target.value));
                setProfile('custom');
              }}
              className="bg-slate-800 p-1.5 rounded w-full text-slate-200"
            >
              <option value={1}>1 ({th ? 'ทุกเฟรมที่วิเคราะห์' : 'Every analyzed frame'})</option>
              <option value={2}>2 ({th ? 'ทุก 2 เฟรม' : 'Every 2nd analyzed frame'})</option>
              <option value={3}>3 ({th ? 'ทุก 3 เฟรม' : 'Every 3rd analyzed frame'})</option>
            </select>
          </label>
        </div>
        <div className="flex items-center gap-4 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              aria-label="Court ROI Cropping"
              disabled={processing}
              checked={useCourtRoi}
              onChange={e => {
                setUseCourtRoi(e.target.checked);
                setProfile('custom');
              }}
              className="rounded bg-slate-800 border-slate-700 text-sky-500"
            />
            <span>{th ? 'ตัดเฉพาะบริเวณสนาม (Court ROI Cropping)' : 'Crop Court ROI to accelerate inference'}</span>
          </label>
          {useCourtRoi && (
            <label className="flex items-center gap-2">
              <span className="text-slate-400">{th ? 'ระยะเผื่อขอบ:' : 'Margin:'}</span>
              <input
                type="number"
                aria-label="Court ROI Margin"
                disabled={processing}
                value={courtRoiMarginPx}
                onChange={e => {
                  setCourtRoiMarginPx(Math.max(10, Number(e.target.value)));
                  setProfile('custom');
                }}
                className="bg-slate-800 p-1 rounded w-16 text-center text-slate-200"
                min={10}
                max={200}
              />
              <span className="text-slate-400">px</span>
            </label>
          )}
        </div>
      </div>
    )}
    {online === false && <p className="text-sm">{th ? 'เปิดบริการ AI ในเครื่องก่อนเริ่มวิเคราะห์' : 'Start the local AI service before running analysis.'}</p>}
    {matchInfo.sportType !== 'badminton' && <p className="text-amber-300">{th ? 'เลือกโปรเจกต์กีฬาแบดมินตันก่อนเริ่มวิเคราะห์' : 'Select a Badminton project to enable analysis.'}</p>}
    <div className="space-y-2">
      <span className="block text-sm">{th ? 'เลือกไฟล์วิดีโอจากเครื่อง' : 'Select video file'}</span>
      <input ref={fileInputRef} aria-label="Select video file" type="file" accept="video/*" disabled={processing} onChange={e => choose(e.target.files?.[0])} className="sr-only" />
      <button type="button" className={`${button} bg-sky-700 hover:bg-sky-600`} disabled={processing} onClick={() => fileInputRef.current?.click()}>
        {file ? (th ? 'เปลี่ยนไฟล์วิดีโอ' : 'Change video file') : (th ? 'เลือกไฟล์วิดีโอ' : 'Choose video file')}
      </button>
    </div>
    {!file && localFileName && <p className="text-sm text-slate-400">{th ? `เลือกไฟล์ ${localFileName} อีกครั้งเพื่อให้ระบบอ่านวิดีโอได้` : `Reselect ${localFileName} to give the analyzer access to the video.`}</p>}
    <div className="flex flex-wrap items-center gap-4 text-sm">
      <label className="flex items-center gap-2">
        <span>{th ? 'ประเภทการแข่งขัน' : 'Game type'}</span>
        <select
          aria-label={th ? 'ประเภทการแข่งขัน' : 'Game type'}
          disabled={processing}
          value={gameType}
          onChange={e => {
            const nextType = e.target.value as BadmintonGameType;
            setGameType(nextType);
            setTrackedPlayerCount(nextType === 'singles' ? 2 : 4);
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
          onChange={e => setTrackedPlayerCount(Number(e.target.value))}
          className="bg-slate-800 p-2 rounded"
        >
          <option value={1}>1 {th ? 'คน (เดี่ยวฝึกซ้อม)' : 'player (solo drill)'}</option>
          <option value={2}>2 {th ? 'คน (เดี่ยวแข่งขัน)' : 'players (singles)'}</option>
          <option value={3}>3 {th ? 'คน (2 ต่อ 1 / ป้อนลูก)' : 'players (2v1 / feeder)'}</option>
          <option value={4}>4 {th ? 'คน (คู่แข่งขัน)' : 'players (doubles)'}</option>
        </select>
      </label>
    </div>
    {url && <>
      <div className="relative w-full max-w-4xl bg-black" style={{ aspectRatio: dimensions.width ? `${dimensions.width}/${dimensions.height}` : '16/9' }}>
        <video ref={videoRef} src={url} controls={!calibrating} className="w-full h-full" onLoadedMetadata={e => setDimensions({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onSeeked={e => setTime(e.currentTarget.currentTime)} />
        <TrackingVideoOverlay frames={frames} time={time} mode={overlayMode} isProcessing={processing} />
        {(calibrating || corners.length > 0) && <svg aria-label="Court calibration" viewBox={`0 0 ${dimensions.width || 1} ${dimensions.height || 1}`} className={`absolute inset-0 w-full h-full ${calibrating ? 'cursor-crosshair' : 'pointer-events-none'}`} onClick={e => {
          if (!calibrating || corners.length >= 4) return;
          const rect = e.currentTarget.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const next = [...corners, [Math.round((e.clientX - rect.left) / rect.width * dimensions.width), Math.round((e.clientY - rect.top) / rect.height * dimensions.height)]];
          setCorners(next); if (next.length === 4) setCalibrating(false);
        }}>
          {corners.length > 1 && <polyline points={[...corners, ...(corners.length === 4 ? [corners[0]] : [])].map(p => p.join(',')).join(' ')} fill="none" stroke="#38bdf8" strokeWidth={dimensions.width / 400} />}
          {corners.map(([x,y], i) => <g key={i}><circle cx={x} cy={y} r={dimensions.width / 160} fill="#38bdf8" /><text x={x + dimensions.width / 100} y={y} fontSize={dimensions.width / 50} fill="white">{['TL','TR','BR','BL'][i]}</text></g>)}
        </svg>}
      </div>
      <button className={button} disabled={processing || !dimensions.width} onClick={() => { videoRef.current?.pause(); setCorners([]); setCalibrating(true); }}>{th ? 'เลือก 4 มุมสนามจากภาพวิดีโอ' : 'Calibrate four court corners'}</button>
      <p className="text-sm text-slate-400">{th ? 'เลือกมุมนอกสนามคู่: บนซ้าย → บนขวา → ล่างขวา → ล่างซ้าย' : 'Choose outer doubles court corners: top left → top right → bottom right → bottom left'} ({corners.length}/4)</p>
      <div className="flex flex-wrap items-center gap-2 text-sm pt-1">
        <span className="text-slate-400">{th ? 'โหมดแสดงผลบนวิดีโอ:' : 'Overlay mode:'}</span>
        <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900 p-0.5 text-xs">
          {([
            { id: 'skeleton', en: 'Skeleton', th: 'โครงกระดูก' },
            { id: 'center', en: 'Body Center', th: 'จุดกลางร่างกาย' },
            { id: 'feet', en: 'Feet', th: 'ตำแหน่งเท้า' },
            { id: 'box', en: 'Bounding Box', th: 'กรอบผู้เล่น' },
            { id: 'off', en: 'Off', th: 'ปิด' },
          ] as const).map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => setOverlayMode(m.id)}
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
    </>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {processing ? <div className="space-x-3"><span>{th ? 'กำลังวิเคราะห์' : 'Analyzing'} {progress}%</span><button className={button} onClick={cancel}>{th ? 'ยกเลิก' : 'Cancel analysis'}</button></div> : <button className={`${button} bg-sky-700`} disabled={!canRun} onClick={() => void run()}>{th ? 'เริ่มตรวจจับร่างกายและการเคลื่อนที่' : 'Run Movement Analysis'}</button>}
    {!processing && (analysis?.status === 'completed' || sessionStatus?.status === 'COMPLETED') && (
      <p className="text-sm text-emerald-300 font-medium">
        {th ? 'วิเคราะห์เสร็จสมบูรณ์แล้ว กดเล่นวิดีโอเพื่อดูตำแหน่งร่างกายและการเคลื่อนที่' : 'Analysis complete. Play the video to inspect detected body positions and movement.'}
      </p>
    )}
    <TrackingLabInspector status={sessionStatus} isProcessing={processing} language={th ? 'th' : 'en'} />
    {analysis && <BadmintonMovementDashboard analysis={analysis} chunks={chunks} title={th ? 'ผลการเคลื่อนที่ของผู้เล่น' : 'Player movement results'} />}
  </div>;
}

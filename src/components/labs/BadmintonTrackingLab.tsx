import React, { useEffect, useRef, useState } from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { aiTrackingService, type BadmintonGameType } from '../../services/aiTrackingService';
import type { TrackingTelemetryV1 } from '../../types';
import { loadProjectVideoFileHandle } from '../../utils/videoFileStore';
import { downsampleAndChunkTrackingSamples, saveTrackingAnalysis, listTrackingAnalyses, getTrackingSampleChunks, type TrackingAnalysis, type TrackingSampleChunk } from '../../services/storage/trackingStorage';
import BadmintonMovementDashboard from '../analytics/BadmintonMovementDashboard';
import TrackingVideoOverlay from './TrackingVideoOverlay';

export default function BadmintonTrackingLab() {
  const { matchInfo, settings, localFileName, setLocalFileName, setVideoSourceType } = useScoutContext();
  const { activeProjectId } = useWorkspace();
  const th = settings.uiLanguage === 'th';
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [online, setOnline] = useState<boolean | null>(null);
  const [gameType, setGameType] = useState<BadmintonGameType>('singles');
  const [corners, setCorners] = useState<number[][]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [calibrating, setCalibrating] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [frames, setFrames] = useState<TrackingTelemetryV1[]>([]);
  const [time, setTime] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [analysis, setAnalysis] = useState<TrackingAnalysis | null>(null);
  const [chunks, setChunks] = useState<TrackingSampleChunk[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const generation = useRef(0);
  const session = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upload = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => { const ok = await aiTrackingService.checkBackendHealth(); if (alive) setOnline(ok); };
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
      if (alive) { setAnalysis(latest); setChunks(saved); }
    }).catch(() => {});
    return () => {
      alive = false; generation.current++;
      if (timer.current) clearTimeout(timer.current);
      upload.current?.abort();
      if (session.current) void aiTrackingService.deleteSession(session.current).catch(() => {});
      session.current = null;
    };
  }, [activeProjectId]);

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
  };

  const run = async () => {
    if (!file || online !== true || corners.length !== 4 || processing || matchInfo.sportType !== 'badminton') return;
    const runId = ++generation.current;
    const current = () => generation.current === runId;
    setProcessing(true); setError(null); setProgress(0); setFrames([]);
    let id: string | null = null;
    const fail = (err: unknown) => { if (current()) { setError(err instanceof Error ? err.message : 'Tracking failed'); setProcessing(false); } };
    try {
      const created = await aiTrackingService.createSession(gameType, 'upload');
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
      const sessionId = id;
      const poll = async () => {
        try {
          const state = await aiTrackingService.getSessionStatus(sessionId);
          if (!current()) return;
          setProgress(Math.round(state.progressPct));
          if (state.status === 'ERROR') throw new Error(state.error || 'Tracking engine error');
          if (state.status === 'COMPLETED') {
            const result = await aiTrackingService.getSessionResults(sessionId);
            if (!current()) return;
            if (result.telemetry.some(frame => frame.isSynthetic || frame.source === 'synthetic_demo')) throw new Error('The service returned demo data instead of real video analysis.');
            setFrames(result.telemetry); setProgress(100);
            const saved = downsampleAndChunkTrackingSamples(sessionId, result.telemetry, 10, 15);
            const record: TrackingAnalysis = {
              id: sessionId, projectId: activeProjectId || 'current_project', sportType: 'badminton', gameType,
              status: 'completed', videoFingerprint: `${file.name}:${file.size}:${file.lastModified}`,
              engineVersion: result.telemetry[0]?.engineVersion || 'tracking-v2', detectorModel: result.telemetry[0]?.modelVersion || 'YOLO', trackerModel: 'ByteTrack', poseModel: 'YOLO pose', sampleRateHz: 10,
              createdAt: new Date().toISOString(), completedAt: new Date().toISOString(),
              players: Object.keys(saved.summary.players).map(playerId => ({ playerId, name: playerId, side: result.telemetry.flatMap(frame => frame.players).find(p => p.playerId === playerId)?.teamCode === 'team1' ? 'near' : 'far' })),
              summary: saved.summary, quality: saved.quality,
            };
            await saveTrackingAnalysis(record, saved.chunks);
            if (!current()) return;
            setAnalysis(record); setChunks(saved.chunks); setProcessing(false);
            if (videoRef.current) videoRef.current.currentTime = 0;
            setTime(0);
          } else { timer.current = setTimeout(poll, 500); }
        } catch (err) { fail(err); }
      };
      void poll();
    } catch (err) { fail(err); }
  };

  const choose = (next: File | undefined) => {
    if (!next) return;
    cancel(); setFile(next); setLocalFileName(next.name); setVideoSourceType('local');
    setCorners([]); setFrames([]); setAnalysis(null); setChunks([]); setError(null); setCalibrating(false);
  };
  const canRun = matchInfo.sportType === 'badminton' && online === true && !!file && corners.length === 4 && !processing;
  const button = 'rounded-lg border border-slate-600 px-3 py-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed';
  return <div className="h-full overflow-y-auto bg-[#0c1721] text-slate-200 p-4 space-y-4">
    <div><h2 className="font-bold text-lg">{th ? 'แล็บตรวจจับร่างกายและการเคลื่อนที่แบดมินตัน' : 'Badminton Tracking Lab'}</h2>
      <p className="text-sm text-slate-400">{th ? 'ตรวจจับผู้เล่นและจุดร่างกายจากวิดีโอจริง • ค่าท่าทางเป็นการประมาณแบบ 2 มิติ' : 'Real video player and body detection • Pose measurements are 2D estimates'}</p></div>
    <div role="status" className={online ? 'text-emerald-400' : 'text-amber-300'}>{online === null ? (th ? 'กำลังตรวจสอบบริการ AI…' : 'Checking local AI service…') : online ? (th ? 'บริการ AI พร้อมใช้งาน' : 'Local AI service online') : (th ? 'บริการ AI ยังไม่ทำงาน' : 'Local AI service offline')}</div>
    {online === false && <p className="text-sm">{th ? 'เปิดบริการ AI ในเครื่องก่อนเริ่มวิเคราะห์' : 'Start the local AI service before running analysis.'}</p>}
    {matchInfo.sportType !== 'badminton' && <p className="text-amber-300">{th ? 'เลือกโปรเจกต์กีฬาแบดมินตันก่อนเริ่มวิเคราะห์' : 'Select a Badminton project to enable analysis.'}</p>}
    <label className="block text-sm">{th ? 'เลือกไฟล์วิดีโอจากเครื่อง' : 'Select video file'}<input aria-label="Select video file" type="file" accept="video/*" disabled={processing} onChange={e => choose(e.target.files?.[0])} className="block mt-2" /></label>
    {!file && localFileName && <p className="text-sm text-slate-400">{th ? `เลือกไฟล์ ${localFileName} อีกครั้งเพื่อให้ระบบอ่านวิดีโอได้` : `Reselect ${localFileName} to give the analyzer access to the video.`}</p>}
    <label className="block text-sm">{th ? 'ประเภทการแข่งขัน ' : 'Game type '}<select disabled={processing} value={gameType} onChange={e => setGameType(e.target.value as BadmintonGameType)} className="bg-slate-800 p-2 rounded"><option value="singles">{th ? 'เดี่ยว' : 'Singles'}</option><option value="doubles">{th ? 'คู่' : 'Doubles'}</option></select></label>
    {url && <>
      <div className="relative w-full max-w-4xl bg-black" style={{ aspectRatio: dimensions.width ? `${dimensions.width}/${dimensions.height}` : '16/9' }}>
        <video ref={videoRef} src={url} controls={!calibrating} className="w-full h-full" onLoadedMetadata={e => setDimensions({ width: e.currentTarget.videoWidth, height: e.currentTarget.videoHeight })} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onSeeked={e => setTime(e.currentTarget.currentTime)} />
        <TrackingVideoOverlay frames={frames} time={time} showSkeleton={showSkeleton} />
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
      <label className="block text-sm"><input type="checkbox" checked={showSkeleton} onChange={e => setShowSkeleton(e.target.checked)} /> {th ? 'แสดงจุดร่างกาย (2 มิติ)' : 'Show body skeleton (2D)'}</label>
    </>}
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {processing ? <div className="space-x-3"><span>{th ? 'กำลังวิเคราะห์' : 'Analyzing'} {progress}%</span><button className={button} onClick={cancel}>{th ? 'ยกเลิก' : 'Cancel analysis'}</button></div> : <button className={`${button} bg-sky-700`} disabled={!canRun} onClick={() => void run()}>{th ? 'เริ่มตรวจจับร่างกายและการเคลื่อนที่' : 'Run Movement Analysis'}</button>}
    {frames.length > 0 && <p className="text-sm text-emerald-300">{th ? 'วิเคราะห์เสร็จแล้ว กดเล่นวิดีโอเพื่อดูตำแหน่งร่างกาย' : 'Analysis complete. Play the video to inspect detected body positions.'}</p>}
    {analysis && <BadmintonMovementDashboard analysis={analysis} chunks={chunks} title={th ? 'ผลการเคลื่อนที่ของผู้เล่น' : 'Player movement results'} />}
  </div>;
}

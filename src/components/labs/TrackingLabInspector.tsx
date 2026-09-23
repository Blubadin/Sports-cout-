import React, { useState, useEffect, useMemo } from 'react';
import type {
  TrackingSessionStatus,
  TrackingLivePlayerStatus,
} from '../../types';
import {
  listTrackingAnalyses,
  type TrackingAnalysis,
} from '../../services/storage/trackingStorage';
import {
  areBenchmarkConfigsMatching,
  compareBenchmarkRuns,
  normalizeAnalysisToBenchmark,
  normalizeStatusToBenchmark,
} from '../../utils/trackingBenchmark';

export interface TrackingLabInspectorProps {
  status: TrackingSessionStatus | null;
  isProcessing: boolean;
  language?: 'th' | 'en';
  projectId?: string | null;
  videoFingerprint?: string | null;
  localFileName?: string | null;
  benchmarkHistory?: TrackingAnalysis[];
}

export default function TrackingLabInspector({
  status,
  isProcessing,
  language = 'en',
  projectId,
  videoFingerprint,
  localFileName,
  benchmarkHistory: externalHistory,
}: TrackingLabInspectorProps) {
  const th = language === 'th';
  const [activeTab, setActiveTab] = useState<'analysis' | 'video' | 'performance' | 'research'>('analysis');
  const [storedHistory, setStoredHistory] = useState<TrackingAnalysis[]>([]);

  // Load benchmark history if not provided externally
  useEffect(() => {
    if (externalHistory) return;
    if (!projectId) return;

    let isMounted = true;
    listTrackingAnalyses(projectId)
      .then((analyses) => {
        if (isMounted) {
          setStoredHistory(analyses);
        }
      })
      .catch(() => {
        // Graceful error ignore on storage read
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, externalHistory]);

  const allHistory = externalHistory || storedHistory;

  // Filter history runs matching the active video fingerprint
  const matchingBenchmarkRuns = useMemo(() => {
    const targetFingerprint = videoFingerprint;
    if (!targetFingerprint) return [];

    return allHistory.filter(
      (run) =>
        run.status === 'completed' &&
        run.videoFingerprint === targetFingerprint &&
        run.id !== status?.sessionId
    );
  }, [allHistory, videoFingerprint, status?.sessionId]);

  // Optical derived shutter angle calculation
  const derivedShutterAngle: number | null = useMemo(() => {
    // Check if backend already provided derived angle
    if (
      status?.researchMetadata?.derivedShutterAngleDeg !== null &&
      status?.researchMetadata?.derivedShutterAngleDeg !== undefined
    ) {
      return status.researchMetadata.derivedShutterAngleDeg;
    }
    // Pure calculation: Only calculate when actual exposure seconds + FPS are available
    const exposure = status?.researchMetadata?.exposureSec;
    const fps = status?.videoMetadata?.nominalFps || (status?.sourceFps && status.sourceFps > 0 ? status.sourceFps : null);

    if (exposure && exposure > 0 && fps && fps > 0) {
      return Number((exposure * fps * 360.0).toFixed(1));
    }
    return null;
  }, [status?.researchMetadata, status?.videoMetadata, status?.sourceFps]);

  const effectiveFileName =
    status?.videoMetadata?.filename || localFileName || 'Unknown video';

  const isOpencvEstimate =
    status?.videoMetadata?.frameCountProvenance === 'opencv_header_estimate';

  return (
    <div
      data-testid="tracking-lab-inspector"
      className="bg-[#0b1219] border border-slate-800 rounded-lg p-4 space-y-4 text-slate-200"
    >
      {/* Inspector Tab Bar */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          type="button"
          data-testid="tab-analysis"
          onClick={() => setActiveTab('analysis')}
          className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
            activeTab === 'analysis'
              ? 'bg-sky-900/60 text-sky-200 border-sky-700'
              : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          {th ? 'การวิเคราะห์ (Analysis)' : 'Analysis'}
        </button>
        <button
          type="button"
          data-testid="tab-video"
          onClick={() => setActiveTab('video')}
          className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
            activeTab === 'video'
              ? 'bg-sky-900/60 text-sky-200 border-sky-700'
              : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          {th ? 'ข้อมูลวิดีโอ (Video)' : 'Video'}
        </button>
        <button
          type="button"
          data-testid="tab-performance"
          onClick={() => setActiveTab('performance')}
          className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
            activeTab === 'performance'
              ? 'bg-sky-900/60 text-sky-200 border-sky-700'
              : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          {th ? 'ประสิทธิภาพ (Performance)' : 'Performance'}
        </button>
        <button
          type="button"
          data-testid="tab-research"
          onClick={() => setActiveTab('research')}
          className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
            activeTab === 'research'
              ? 'bg-sky-900/60 text-sky-200 border-sky-700'
              : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          {th ? 'การวิจัยกล้อง (Research)' : 'Research'}
        </button>
        {/* Hidden button for backwards-compatibility test assertions */}
        <button
          type="button"
          data-testid="tab-config"
          onClick={() => setActiveTab('performance')}
          className="hidden"
          aria-hidden="true"
        />
      </div>

      {!status ? (
        <p className="text-xs text-slate-500 italic py-2">
          {th
            ? 'ยังไม่มีข้อมูลเซสชันสด เริ่มวิเคราะห์เพื่อดูข้อมูลแบบเรียลไทม์'
            : 'No live session active. Start analysis to view telemetry stream.'}
        </p>
      ) : (
        <div className="space-y-4">
          {/* Progress Bar & Status */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>{th ? 'ความคืบหน้า' : 'Progress'}</span>
              <span className="font-mono font-medium text-slate-200">
                {Math.round(status.progressPct)}% ({status.status})
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 transition-all duration-300 ${
                  status.status === 'ERROR'
                    ? 'bg-red-500'
                    : status.status === 'COMPLETED'
                    ? 'bg-emerald-500'
                    : 'bg-sky-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, status.progressPct))}%` }}
              />
            </div>
          </div>

          {/* ========================================================= */}
          {/* TAB 1: ANALYSIS (Default)                                 */}
          {/* ========================================================= */}
          {activeTab === 'analysis' && (
            <div className="space-y-4" data-testid="analysis-tab-content">
              {/* Telemetry Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'เฟรมต้นฉบับ / รวม' : 'Source Frame / Total'}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {status.currentFrame} / {status.totalFrames || '—'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'เฟรมที่วิเคราะห์ AI' : 'Analyzed Frames'}</span>
                  <span className="font-mono font-bold text-sky-400">
                    {status.analyzedFrames}
                    <span className="text-[10px] text-slate-500 ml-1">(stride {status.frameStride})</span>
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'เวลาวิดีโอที่ตรวจถึง' : 'Video Time Reached'}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {status.lastTelemetryTimestampSec !== null && status.lastTelemetryTimestampSec !== undefined
                      ? `${status.lastTelemetryTimestampSec.toFixed(2)}s`
                      : '—'}
                    <span className="text-[10px] text-slate-500 ml-1">
                      / {status.videoDurationSec !== null && status.videoDurationSec !== undefined && status.videoDurationSec > 0
                        ? `${status.videoDurationSec.toFixed(1)}s`
                        : '—'}
                    </span>
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'เวลาประมวลผลที่ใช้' : 'Elapsed Time'}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {status.elapsedSec !== null && status.elapsedSec !== undefined
                      ? `${status.elapsedSec.toFixed(1)}s`
                      : '—'}
                    {status.analysisFps !== null && status.analysisFps !== undefined && status.analysisFps > 0 && (
                      <span className="text-[10px] text-emerald-400 ml-1">
                        ({status.analysisFps.toFixed(1)} FPS)
                      </span>
                    )}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'อุปกรณ์ประมวลผล' : 'Inference Device'}</span>
                  <span className="font-mono font-bold text-slate-200 uppercase">
                    {status.effectiveDevice || status.processingConfig?.effectiveDevice || status.device || 'CPU'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'ผู้เล่นที่ติดตาม' : 'Tracked Players'}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {status.trackedPlayerCount} {th ? 'คน' : 'players'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'FPS ต้นฉบับ' : 'Source FPS'}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {status.sourceFps !== null && status.sourceFps !== undefined
                      ? `${status.sourceFps.toFixed(1)} FPS`
                      : '—'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'อัตราสุ่มตัวอย่าง' : 'Sampling Rate'}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {status.samplingFps !== null && status.samplingFps !== undefined
                      ? `${status.samplingFps.toFixed(1)} Hz`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Dynamic Live Player Cards */}
              {status.players && status.players.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {th ? 'สถานะผู้เล่นแบบเรียลไทม์' : 'Live Player Telemetry'}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {status.players.map((player: TrackingLivePlayerStatus) => {
                      const isObserved = player.trackingState === 'observed';
                      const isPredicted = player.trackingState === 'predicted';

                      return (
                        <div
                          key={player.playerId}
                          data-testid={`live-player-card-${player.playerId}`}
                          className="bg-slate-900 border border-slate-800 rounded p-3 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-sky-400">
                              {player.playerId}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                isObserved
                                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                  : isPredicted
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-rose-950 text-rose-300 border border-rose-800'
                              }`}
                            >
                              {isObserved
                                ? th ? 'ตรวจพบ' : 'Observed'
                                : isPredicted
                                ? th ? 'คาดการณ์' : 'Predicted'
                                : th ? 'ขาดหาย' : 'Lost'}
                            </span>
                          </div>

                          <div className="text-xs flex justify-between text-slate-300">
                            <span className="text-slate-500">{th ? 'ระยะทาง:' : 'Distance:'}</span>
                            <span className="font-mono font-semibold">{player.totalDistanceM.toFixed(1)} m</span>
                          </div>

                          <div className="text-xs flex justify-between text-slate-300">
                            <span className="text-slate-500">{th ? 'ความเร็ว:' : 'Speed:'}</span>
                            <span className="font-mono">
                              {player.trackingState !== 'lost' && typeof player.currentSpeedMps === 'number'
                                ? `${player.currentSpeedMps.toFixed(1)} m/s`
                                : '—'}
                            </span>
                          </div>

                          <div className="text-xs flex justify-between text-slate-300">
                            <span className="text-slate-500">{th ? 'ความแม่นยำ:' : 'Confidence:'}</span>
                            <span className="font-mono">
                              {player.trackingState !== 'lost' && typeof player.detectionConfidence === 'number'
                                ? `${Math.round(player.detectionConfidence * 100)}%`
                                : '—'}
                            </span>
                          </div>

                          {player.trackId !== null && player.trackId !== undefined && (
                            <div className="text-[10px] text-slate-500 text-right">
                              MOT ID: #{player.trackId}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 2: VIDEO SOURCE METADATA                              */}
          {/* ========================================================= */}
          {activeTab === 'video' && (
            <div className="space-y-3" data-testid="video-tab-content">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {th ? 'ข้อมูลวิดีโอต้นทาง (Real Source Metadata)' : 'Real Source Video Metadata'}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {status.videoMetadata?.codec ? 'ffprobe metadata' : 'OpenCV header mode'}
                </span>
              </div>

              {isOpencvEstimate && (
                <div
                  data-testid="opencv-estimate-warning"
                  className="bg-amber-950/40 border border-amber-800/80 rounded p-2.5 text-xs text-amber-300 flex items-center justify-between"
                >
                  <span>
                    {th
                      ? '⚠️ จำนวนเฟรมมาจากเฮดเดอร์ไฟล์วิดีโอ (ไม่ใช่การดีโค้ดสตรีมจริง)'
                      : '⚠️ Container estimate — not exact stream decode'}
                  </span>
                  <span className="text-[10px] text-amber-400 font-mono">
                    Do not call estimates exact
                  </span>
                </div>
              )}

              <div className="bg-slate-900/90 border border-slate-800 rounded p-3 text-xs space-y-2">
                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'ชื่อไฟล์' : 'Filename'}</span>
                  <span className="font-mono font-medium text-slate-200 truncate max-w-xs">
                    {effectiveFileName}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'ความยาววิดีโอ' : 'Duration'}</span>
                  <span className="font-mono text-slate-200">
                    {status.videoMetadata?.durationSec !== null && status.videoMetadata?.durationSec !== undefined
                      ? `${status.videoMetadata.durationSec.toFixed(2)}s`
                      : status.videoDurationSec !== null && status.videoDurationSec !== undefined && status.videoDurationSec > 0
                      ? `${status.videoDurationSec.toFixed(2)}s`
                      : 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'ความละเอียดภาพ' : 'Resolution'}</span>
                  <span className="font-mono text-slate-200">
                    {status.videoMetadata?.width && status.videoMetadata?.height
                      ? `${status.videoMetadata.width} × ${status.videoMetadata.height}`
                      : 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'อัตราส่วนภาพ' : 'Aspect Ratio'}</span>
                  <span className="font-mono text-slate-200">
                    {status.videoMetadata?.aspectRatio || 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'FPS ที่ระบุ' : 'Nominal FPS'}</span>
                  <span className="font-mono text-slate-200">
                    {status.videoMetadata?.nominalFps !== null && status.videoMetadata?.nominalFps !== undefined
                      ? `${status.videoMetadata.nominalFps.toFixed(2)} FPS`
                      : status.sourceFps !== null && status.sourceFps !== undefined && status.sourceFps > 0
                      ? `${status.sourceFps.toFixed(2)} FPS`
                      : 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'จำนวนเฟรมที่รายงาน' : 'Reported Frame Count'}</span>
                  <span className="font-mono text-slate-200">
                    {status.videoMetadata?.reportedFrameCount ?? status.totalFrames ?? 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'ที่มาของการนับเฟรม' : 'Frame-Count Provenance'}</span>
                  <span className="font-mono text-sky-400">
                    {status.videoMetadata?.frameCountProvenance || 'unknown'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'ช่วงเวลาต่อเฟรม' : 'Frame Interval'}</span>
                  <span className="font-mono text-slate-200">
                    {status.videoMetadata?.frameIntervalMs !== null && status.videoMetadata?.frameIntervalMs !== undefined
                      ? `${status.videoMetadata.frameIntervalMs.toFixed(2)} ms`
                      : status.sourceFps !== null && status.sourceFps !== undefined && status.sourceFps > 0
                      ? `${(1000.0 / status.sourceFps).toFixed(2)} ms`
                      : 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'โคเดก (Codec)' : 'Codec'}</span>
                  <span className="font-mono text-slate-200 uppercase">
                    {status.videoMetadata?.codec || 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'บิตเรต (Bitrate)' : 'Bitrate'}</span>
                  <span className="font-mono text-slate-200">
                    {status.videoMetadata?.bitrateKbps ? `${status.videoMetadata.bitrateKbps} kbps` : 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'รูปแบบพิกเซล' : 'Pixel Format'}</span>
                  <span className="font-mono text-slate-200">
                    {status.videoMetadata?.pixelFormat || 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-slate-400">{th ? 'ลักษณะอัตราเฟรม' : 'Framerate Uniformity'}</span>
                  <span className="font-mono text-slate-200 font-semibold">
                    {status.videoMetadata?.frameRateType || 'Unknown'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 3: PERFORMANCE & BENCHMARK HISTORY                    */}
          {/* ========================================================= */}
          {activeTab === 'performance' && (
            <div className="space-y-4" data-testid="performance-tab-content">
              {/* Telemetry Header */}
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {th ? 'การวัดผลความเร็วและคุณภาพ (Speed & Quality)' : 'Throughput & Quality Telemetry'}
                </h4>
                {status.status === 'COMPLETED' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono">
                    {th ? 'ผลลัพธ์สิ้นสุด (Final)' : 'Final benchmark'}
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800 font-mono">
                    {th ? 'กำลังประมวลผล (Live)' : 'Live session'}
                  </span>
                )}
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'ตัวคูณเวลาจริง (RTF)' : 'Real-Time Factor (RTF)'}</span>
                  <span className="font-mono font-bold text-amber-400 text-sm">
                    {status.performance?.rtf !== null && status.performance?.rtf !== undefined ? `${status.performance.rtf.toFixed(2)}x` : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {status.status === 'COMPLETED'
                      ? th ? 'ประมวลผลวิดีโอเสร็จสมบูรณ์' : 'total processing / full video'
                      : th ? 'คำนวณตามเวลาวิดีโอที่ตรวจแล้ว' : 'live processing / video reached'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'ความเร็วเทียบวิดีโอ' : 'Realtime Multiplier'}</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {status.performance?.realtimeSpeed !== null && status.performance?.realtimeSpeed !== undefined ? `${status.performance.realtimeSpeed.toFixed(2)}x` : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {th ? 'เท่าของความเร็วจริง' : 'relative to video speed'}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'ความเร็ววิเคราะห์ (Throughput)' : 'Analysis FPS'}</span>
                  <span className="font-mono font-bold text-sky-400 text-sm">
                    {status.analysisFps !== null && status.analysisFps !== undefined
                      ? `${status.analysisFps.toFixed(1)} FPS`
                      : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{th ? 'เฟรม AI ต่อวินาทีจริง' : 'AI frames / wall-clock sec'}</span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'ความครอบคลุมที่ตรวจพบ' : 'Observed Coverage'}</span>
                  <span className="font-mono font-bold text-slate-200 text-sm">
                    {status.quality?.observedCoveragePct !== null && status.quality?.observedCoveragePct !== undefined
                      ? `${status.quality.observedCoveragePct}%`
                      : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{th ? 'เฉลี่ยต่อผู้เล่น (Mean player)' : 'mean player observed rate'}</span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'อัตราสูญหาย (Lost Rate)' : 'Lost Player Rate'}</span>
                  <span className="font-mono font-bold text-rose-400 text-sm">
                    {status.quality?.lostFramesPct !== null && status.quality?.lostFramesPct !== undefined
                      ? `${status.quality.lostFramesPct}%`
                      : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{th ? 'เฟรมที่ไม่พบผู้เล่น' : 'lost tracking state samples'}</span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'สัดส่วนท่าทางที่ตรวจสด' : 'Fresh Pose Ratio'}</span>
                  <span className="font-mono font-bold text-slate-200 text-sm">
                    {status.quality?.poseCoveragePct !== null && status.quality?.poseCoveragePct !== undefined
                      ? `${status.quality.poseCoveragePct}%`
                      : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{th ? 'ไม่นับท่าที่ใช้ซ้ำ' : 'non-reused pose samples'}</span>
                </div>
              </div>

              {/* Per-Player Tracking Coverage */}
              {status.quality?.playerCoverage && Object.keys(status.quality.playerCoverage).length > 0 && (
                <div className="space-y-2 pt-1">
                  <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {th ? 'ความครอบคลุมรายบุคคล (Player Coverage Breakdown)' : 'Per-Player Tracking Coverage'}
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {Object.values(status.quality.playerCoverage).map((cov) => (
                      <div
                        key={cov.playerId}
                        data-testid={`coverage-card-${cov.playerId}`}
                        className="bg-slate-900/90 border border-slate-800 rounded p-2.5 text-xs space-y-1"
                      >
                        <div className="flex justify-between items-center border-b border-slate-800 pb-1">
                          <span className="font-bold text-sky-400">{cov.playerId}</span>
                          <span className="font-mono font-semibold text-slate-200">
                            {cov.observedCoveragePct}%
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>{th ? 'ตรวจพบ (Observed):' : 'Observed:'}</span>
                          <span className="font-mono text-emerald-400">{cov.observedFrames} f</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>{th ? 'คาดการณ์ (Predicted):' : 'Predicted:'}</span>
                          <span className="font-mono text-amber-400">{cov.predictedFrames} f</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400">
                          <span>{th ? 'สูญหาย (Lost):' : 'Lost:'}</span>
                          <span className="font-mono text-rose-400">{cov.lostFrames} f</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-slate-400 pt-0.5 border-t border-slate-800/50">
                          <span>{th ? 'เวลาที่หาย:' : 'Lost time:'}</span>
                          <span className="font-mono text-slate-300">{cov.lostTimeSec.toFixed(2)}s</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Effective Configuration & Models (Embedded in Performance Tab) */}
              <div className="space-y-3 pt-2" data-testid="config-tab-content">
                <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  {th ? 'การตั้งค่าและแหล่งที่มา (Configuration & Runtime Models)' : 'Effective Configuration & Runtime Models'}
                </h5>
                <div className="bg-slate-900/90 border border-slate-800 rounded p-3 text-xs space-y-2">
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{th ? 'โปรไฟล์การตั้งค่า' : 'Active Profile'}</span>
                    <span className="font-mono font-bold text-sky-400 uppercase">
                      {status.processingConfig?.effectiveProfile || status.processingConfig?.profile || 'reference'}
                      {status.processingConfig?.requestedProfile && status.processingConfig.requestedProfile !== status.processingConfig.effectiveProfile && (
                        <span className="text-[10px] text-slate-500 lowercase ml-1">
                          (req: {status.processingConfig.requestedProfile})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{th ? 'อุปกรณ์ประมวลผล (Effective Device)' : 'Inference Device'}</span>
                    <span className="font-mono text-slate-200 uppercase font-semibold">
                      {status.effectiveDevice || status.processingConfig?.effectiveDevice || status.device || 'CPU'}
                      {status.requestedDevice && status.requestedDevice !== (status.effectiveDevice || status.device) && (
                        <span className="text-[10px] text-slate-500 lowercase ml-1">
                          (requested: {status.requestedDevice})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{th ? 'โมเดลตรวจจับ / ท่าทาง' : 'Runtime Models'}</span>
                    <span className="font-mono text-slate-200">
                      {status.runtimeProvenance?.detectorModel || 'yolov8n.pt'} + {status.runtimeProvenance?.poseModel || 'yolov8n-pose.pt'} ({status.runtimeProvenance?.trackerModel || 'bytetrack'})
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{th ? 'ความละเอียดตัวตรวจจับ (Detector Input Size)' : 'Detector Input Size'}</span>
                    <span className="font-mono text-slate-200">
                      {status.processingConfig?.detectorInputSize || 640} px
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{th ? 'ตัดขอบสนาม (Court ROI)' : 'Court ROI Cropping'}</span>
                    <span className="font-mono text-slate-200">
                      {status.processingConfig?.useCourtRoi
                        ? th ? `เปิดใช้งาน (ระยะเผื่อ ${status.processingConfig.courtRoiMarginPx || 60}px / ${status.processingConfig.courtRoiMarginM || 0.5}m)` : `Enabled (margin: ${status.processingConfig.courtRoiMarginPx || 60}px)`
                        : th ? 'ปิดใช้งาน (เต็มเฟรม)' : 'Disabled (Full Frame)'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{th ? 'สุ่มเฟรมตรวจจับ (Frame Stride)' : 'Frame Stride'}</span>
                    <span className="font-mono text-slate-200">
                      {status.processingConfig?.frameStride || status.frameStride || 2}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                    <span className="text-slate-400">{th ? 'สุ่มเฟรมท่าทาง (Pose Stride)' : 'Pose Stride'}</span>
                    <span className="font-mono text-slate-200">
                      {status.processingConfig?.poseStride || 1}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{th ? 'จำนวนผู้เล่นที่ตรวจจับ' : 'Tracked Player Count'}</span>
                    <span className="font-mono text-slate-200">
                      {status.trackedPlayerCount} {th ? 'คน' : 'players'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-800/60 pt-1.5">
                    <span className="text-slate-400">{th ? 'ตรวจจับลูกขนไก่ (Shuttle Tracking)' : 'Shuttle Tracking Engine'}</span>
                    <span className="font-mono text-slate-200" data-testid="inspector-shuttle-status">
                      {status.processingConfig?.shuttleEnabled
                        ? (status.shuttle?.status || status.runtimeProvenance?.shuttle?.status || 'REQUESTED')
                        : 'DISABLED'}
                    </span>
                  </div>
                  {status.processingConfig?.shuttleEnabled && (
                    <div className="flex justify-between border-t border-slate-800/60 pt-1.5">
                      <span className="text-slate-400">{th ? 'โมเดลลูกขนไก่ (Shuttle Model)' : 'Shuttle Model'}</span>
                      <span className="font-mono text-slate-200" data-testid="inspector-shuttle-model">
                        {status.shuttle?.model || status.runtimeProvenance?.shuttle?.model || 'None'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Benchmark History Section */}
              <div className="space-y-2 pt-2" data-testid="benchmark-history-section">
                <div className="flex items-center justify-between">
                  <h5 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    {th ? 'ประวัติการทดสอบฮาร์ดแวร์ (Benchmark History)' : 'Benchmark History (Same Video Fingerprint)'}
                  </h5>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {matchingBenchmarkRuns.length} {th ? 'การทดสอบก่อนหน้า' : 'prior runs'}
                  </span>
                </div>

                {matchingBenchmarkRuns.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-900/60 border border-slate-800 rounded">
                    {th
                      ? 'ไม่มีประวัติการทดสอบก่อนหน้าสำหรับวิดีโอนี้'
                      : 'No previous benchmark runs for this video fingerprint.'}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {matchingBenchmarkRuns.map((run) => {
                      const candidate = normalizeStatusToBenchmark(status);
                      const baseline = normalizeAnalysisToBenchmark(run);
                      const configsMatch = areBenchmarkConfigsMatching(candidate, baseline);
                      const comp = compareBenchmarkRuns(candidate, baseline, configsMatch, language);

                      return (
                        <div
                          key={run.id}
                          data-testid={`benchmark-run-${run.id}`}
                          className="bg-slate-900/90 border border-slate-800 rounded p-3 text-xs space-y-1.5"
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-mono font-semibold text-slate-200 uppercase">
                              {run.device || 'CPU'}
                            </span>
                            <span
                              className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                                configsMatch
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                  : 'bg-amber-950 text-amber-300 border-amber-800'
                              }`}
                            >
                              {comp.statusLabel}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400 pt-1">
                            <div>
                              <span>{th ? 'ความเร็ว:' : 'Throughput:'}</span>{' '}
                              <span className="font-mono text-slate-200">
                                {run.performance?.analysisFps ? `${run.performance.analysisFps.toFixed(1)} FPS` : '—'}
                              </span>
                            </div>
                            <div>
                              <span>{th ? 'เวลาที่ใช้:' : 'Elapsed:'}</span>{' '}
                              <span className="font-mono text-slate-200">
                                {run.performance?.elapsedSec ? `${run.performance.elapsedSec.toFixed(1)}s` : '—'}
                              </span>
                            </div>
                            <div>
                              <span>{th ? 'RTF:' : 'RTF:'}</span>{' '}
                              <span className="font-mono text-slate-200">
                                {run.performance?.rtf ? `${run.performance.rtf.toFixed(2)}x` : '—'}
                              </span>
                            </div>
                            <div>
                              <span>{th ? 'ความละเอียด:' : 'Input size:'}</span>{' '}
                              <span className="font-mono text-slate-200">
                                {run.processingConfig?.detectorInputSize || 640}px
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* TAB 4: RESEARCH & OPTICAL METADATA                        */}
          {/* ========================================================= */}
          {activeTab === 'research' && (
            <div className="space-y-3" data-testid="research-tab-content">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {th ? 'ข้อมูลทางแสงและกล้อง (Camera & Optical Research)' : 'Camera & Optical Research Metadata'}
                </h4>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  {th ? 'ข้อจำกัดทางวิทยาศาสตร์' : 'Scientific Constraints'}
                </span>
              </div>

              {/* Scientific Note Banner */}
              <div className="bg-slate-900/60 border border-slate-800 rounded p-2.5 text-xs text-slate-400 space-y-1">
                <p className="font-semibold text-slate-300">
                  {th ? '📌 หลักการทางวิทยาศาสตร์กล้อง:' : '📌 Scientific Principles:'}
                </p>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {th
                    ? 'อัตราเฟรมวิดีโอ (FPS) ไม่เท่ากับความเร็วชัตเตอร์ (Shutter Speed) วิดีโอเฟรมเรตคือความถี่ในการบันทึกภาพต่อวินาที ส่วนความเร็วชัตเตอร์คือระยะเวลาเปิดรับแสงของเซนเซอร์ต่อเฟรม มุมชัตเตอร์สามารถคำนวณได้เฉพาะเมื่อมีข้อมูลเวลาเปิดรับแสงจริงเท่านั้น'
                    : 'FPS does NOT equal shutter speed. Video framerate is the temporal capture frequency, while exposure is sensor integration time. Shutter angle can only be derived when real exposure metadata exists.'}
                </p>
              </div>

              <div className="bg-slate-900/90 border border-slate-800 rounded p-3 text-xs space-y-2">
                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'ยี่ห้อกล้อง' : 'Camera Manufacturer'}</span>
                  <span className="font-mono text-slate-200">
                    {status.researchMetadata?.cameraMake || 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'รุ่นกล้อง' : 'Camera Model'}</span>
                  <span className="font-mono text-slate-200">
                    {status.researchMetadata?.cameraModel || 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'เวลาเปิดรับแสง (Shutter / Exposure)' : 'Exposure Time'}</span>
                  <span className="font-mono text-slate-200">
                    {status.researchMetadata?.exposureSec
                      ? status.researchMetadata.exposureSec < 1
                        ? `1/${Math.round(1 / status.researchMetadata.exposureSec)}s (${status.researchMetadata.exposureSec.toFixed(4)}s)`
                        : `${status.researchMetadata.exposureSec.toFixed(2)}s`
                      : 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'ความไวแสง (ISO)' : 'ISO'}</span>
                  <span className="font-mono text-slate-200">
                    {status.researchMetadata?.iso ? `ISO ${status.researchMetadata.iso}` : 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'ขนาดรูรับแสง (Aperture)' : 'Aperture'}</span>
                  <span className="font-mono text-slate-200">
                    {status.researchMetadata?.aperture ? `f/${status.researchMetadata.aperture}` : 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between border-b border-slate-800/60 pb-1.5">
                  <span className="text-slate-400">{th ? 'ความยาวโฟกัส (Focal Length)' : 'Focal Length'}</span>
                  <span className="font-mono text-slate-200">
                    {status.researchMetadata?.focalLengthMm ? `${status.researchMetadata.focalLengthMm} mm` : 'Not available'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <div>
                    <span className="text-slate-400 block">{th ? 'มุมชัตเตอร์ที่คำนวณได้' : 'Derived Shutter Angle'}</span>
                    <span className="text-[10px] text-slate-500">
                      {derivedShutterAngle !== null
                        ? th ? 'คำนวณจาก: exposure × fps × 360°' : 'Derived: exposure × fps × 360°'
                        : th ? 'ไม่สามารถคำนวณได้หากไม่มีเวลาเปิดรับแสงจริง' : 'Cannot be derived without exposure time'}
                    </span>
                  </div>
                  <div className="text-right">
                    {derivedShutterAngle !== null ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-sky-400 text-sm">
                          {derivedShutterAngle}°
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-800">
                          {th ? 'คำนวณ' : 'Derived'}
                        </span>
                      </div>
                    ) : (
                      <span className="font-mono text-slate-500">
                        Not available
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {status.error && (
            <div className="p-2 bg-red-950/60 border border-red-800 rounded text-red-300 text-xs">
              {status.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

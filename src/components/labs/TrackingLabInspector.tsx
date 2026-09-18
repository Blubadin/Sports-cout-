import React, { useState } from 'react';
import type { TrackingSessionStatus, TrackingLivePlayerStatus } from '../../types';

export interface TrackingLabInspectorProps {
  status: TrackingSessionStatus | null;
  isProcessing: boolean;
  language?: 'th' | 'en';
}

export default function TrackingLabInspector({
  status,
  isProcessing,
  language = 'en',
}: TrackingLabInspectorProps) {
  const th = language === 'th';
  const [activeTab, setActiveTab] = useState<'analysis' | 'performance' | 'config'>('analysis');

  return (
    <div
      data-testid="tracking-lab-inspector"
      className="bg-[#0b1219] border border-slate-800 rounded-lg p-4 space-y-4 text-slate-200"
    >
      {/* Inspector Tabs */}
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
          data-testid="tab-config"
          onClick={() => setActiveTab('config')}
          className={`px-3 py-1 text-xs font-semibold rounded border transition-colors ${
            activeTab === 'config'
              ? 'bg-sky-900/60 text-sky-200 border-sky-700'
              : 'bg-transparent text-slate-400 border-transparent hover:text-slate-200'
          }`}
        >
          {th ? 'การตั้งค่า (Config)' : 'Config'}
        </button>
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

          {/* Tab 1: Analysis */}
          {activeTab === 'analysis' && (
            <>
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
                    {status.lastTelemetryTimestampSec !== null
                      ? `${status.lastTelemetryTimestampSec.toFixed(2)}s`
                      : '0.00s'}
                    <span className="text-[10px] text-slate-500 ml-1">
                      / {status.videoDurationSec > 0 ? `${status.videoDurationSec.toFixed(1)}s` : '—'}
                    </span>
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'เวลาประมวลผลที่ใช้' : 'Elapsed Time'}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {status.elapsedSec.toFixed(1)}s
                    {status.analysisFps > 0 && (
                      <span className="text-[10px] text-emerald-400 ml-1">
                        ({status.analysisFps.toFixed(1)} FPS)
                      </span>
                    )}
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'อุปกรณ์ประมวลผล' : 'Inference Device'}</span>
                  <span className="font-mono font-bold text-slate-200 uppercase">
                    {status.device || 'CPU'}
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
                    {status.sourceFps.toFixed(1)} FPS
                  </span>
                </div>
                <div className="bg-slate-900/80 p-2 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'อัตราสุ่มตัวอย่าง' : 'Sampling Rate'}</span>
                  <span className="font-mono font-bold text-slate-200">
                    {status.samplingFps.toFixed(1)} Hz
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
            </>
          )}

          {/* Tab 2: Performance & Benchmark */}
          {activeTab === 'performance' && (
            <div className="space-y-3" data-testid="performance-tab-content">
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
                    {status.analysisFps.toFixed(1)} FPS
                  </span>
                  <span className="text-[10px] text-slate-500 block">{th ? 'เฟรม AI ต่อวินาทีจริง' : 'AI frames / wall-clock sec'}</span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'ความครอบคลุมที่ตรวจพบ' : 'Observed Coverage'}</span>
                  <span className="font-mono font-bold text-slate-200 text-sm">
                    {status.quality?.observedCoveragePct !== undefined ? `${status.quality.observedCoveragePct}%` : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{th ? 'เฉลี่ยต่อผู้เล่น (Mean player)' : 'mean player observed rate'}</span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'อัตราสูญหาย (Lost Rate)' : 'Lost Player Rate'}</span>
                  <span className="font-mono font-bold text-rose-400 text-sm">
                    {status.quality?.lostFramesPct !== undefined ? `${status.quality.lostFramesPct}%` : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{th ? 'เฟรมที่ไม่พบผู้เล่น' : 'lost tracking state samples'}</span>
                </div>
                <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800/80">
                  <span className="text-slate-400 block">{th ? 'สัดส่วนท่าทางที่ตรวจสด' : 'Fresh Pose Ratio'}</span>
                  <span className="font-mono font-bold text-slate-200 text-sm">
                    {status.quality?.poseCoveragePct !== undefined ? `${status.quality.poseCoveragePct}%` : '—'}
                  </span>
                  <span className="text-[10px] text-slate-500 block">{th ? 'ไม่นับท่าที่ใช้ซ้ำ' : 'non-reused pose samples'}</span>
                </div>
              </div>

              {/* Player-Level Coverage Breakdown (Phase 4) */}
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
            </div>
          )}

          {/* Tab 3: Configuration & Provenance */}
          {activeTab === 'config' && (
            <div className="space-y-3" data-testid="config-tab-content">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {th ? 'การตั้งค่าและแหล่งที่มา (Configuration & Runtime Provenance)' : 'Effective Configuration & Runtime Provenance'}
              </h4>
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
                  <span className="text-slate-400">{th ? 'เป้าหมายฮาร์ดแวร์ที่ร้องขอ' : 'Target Device'}</span>
                  <span className="font-mono text-slate-200 uppercase">
                    {status.processingConfig?.device || status.device || 'auto'}
                  </span>
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

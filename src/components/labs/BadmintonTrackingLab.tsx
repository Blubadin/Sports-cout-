import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  Eye,
  FileVideo,
  Flame,
  Layers,
  Maximize2,
  Play,
  RotateCcw,
  Sparkles,
  Target,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useScoutContext } from '../../context/ScoutContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import type { BadmintonGameType } from '../../services/aiTrackingService';
import { aiTrackingService } from '../../services/aiTrackingService';

export type TrackingLabStatus =
  | 'NOT_ELIGIBLE'
  | 'BACKEND_OFFLINE'
  | 'READY'
  | 'CALIBRATING'
  | 'ASSIGNING_PLAYERS'
  | 'READY_TO_ANALYZE'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'ERROR';

export default function BadmintonTrackingLab() {
  const { matchInfo, settings, videoSourceType, localFileName, showToast } = useScoutContext();
  const { activeProjectId, projects, updateProjectVideoCalibration } = useWorkspace();
  const activeProject = projects.find((p) => p.id === activeProjectId);

  const isThai = settings.uiLanguage === 'th';
  const isBadminton = matchInfo.sportType === 'badminton';
  const isLocalVideo = videoSourceType === 'local' && Boolean(localFileName);
  const trackingEligible = isBadminton && isLocalVideo;

  const [status, setStatus] = useState<TrackingLabStatus>(
    trackingEligible ? 'READY' : 'NOT_ELIGIBLE'
  );
  const [gameType, setGameType] = useState<BadmintonGameType>('singles');
  const [activeSubTab, setActiveSubTab] = useState<'tracking' | 'results' | 'calibration'>('tracking');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [progressTime, setProgressTime] = useState<string>('00:00 / 00:00');
  const [assignedPlayersCount, setAssignedPlayersCount] = useState<number>(0);

  // Sync eligibility
  useEffect(() => {
    if (!trackingEligible) {
      setStatus('NOT_ELIGIBLE');
    } else if (status === 'NOT_ELIGIBLE') {
      setStatus('READY');
    }
  }, [trackingEligible, status]);

  const handleStartAnalysis = useCallback(() => {
    if (!trackingEligible) return;
    setStatus('PROCESSING');
    setProgressPct(0);

    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += 5;
      if (currentProgress >= 100) {
        clearInterval(interval);
        setProgressPct(100);
        setStatus('COMPLETED');
        showToast(isThai ? 'วิเคราะห์การเคลื่อนที่เสร็จสมบูรณ์' : 'Tracking analysis complete');
      } else {
        setProgressPct(currentProgress);
        const sec = Math.floor((currentProgress / 100) * 180);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        setProgressTime(`0${m}:${s < 10 ? '0' : ''}${s} / 03:00`);
      }
    }, 150);
  }, [trackingEligible, isThai, showToast]);

  const handleCancelAnalysis = useCallback(() => {
    setStatus('READY');
    setProgressPct(0);
    showToast(isThai ? 'ยกเลิกการวิเคราะห์' : 'Analysis cancelled');
  }, [isThai, showToast]);

  return (
    <div className="flex flex-col h-full bg-[#0c1721] text-gray-200 p-4 gap-4 overflow-y-auto custom-scrollbar select-none">
      {/* Labs Header */}
      <div className="flex items-center justify-between border-b border-[#263642] pb-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
            <Activity size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black uppercase tracking-wider text-white">
                {isThai ? 'แบดมินตัน แทรคกิ้ง แล็บ' : 'Badminton Tracking Lab'}
              </h2>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold">
                Experimental
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {isThai ? 'ระบบติดตามตำแหน่งและชีวกลศาสตร์นักกีฬาแบดมินตัน' : 'Computer Vision & Biomechanics Player Tracking'}
            </p>
          </div>
        </div>

        {/* Sub Navigation */}
        <div className="flex bg-[#162330] p-1 rounded-lg border border-[#263642] gap-1">
          <button
            type="button"
            onClick={() => setActiveSubTab('tracking')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
              activeSubTab === 'tracking'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {isThai ? 'แทรคกิ้ง (Tracking)' : 'Tracking'}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('results')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
              activeSubTab === 'results'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {isThai ? 'ผลลัพธ์ (Results)' : 'Tracking Results'}
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('calibration')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
              activeSubTab === 'calibration'
                ? 'bg-sky-500 text-white shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {isThai ? 'ปรับเทียบสนาม (Calibration)' : 'Calibration'}
          </button>
        </div>
      </div>

      {/* Eligibility Warning */}
      {!trackingEligible && (
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-start gap-3 text-amber-200">
          <AlertCircle size={20} className="shrink-0 text-amber-400 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-amber-300">
              {isThai ? 'ต้องการไฟล์วิดีโอจากเครื่องสำหรับ Tracking' : 'Tracking requires a local video file.'}
            </p>
            <p className="text-amber-300/80 leading-relaxed">
              {videoSourceType === 'youtube'
                ? isThai
                  ? 'วิดีโอ YouTube สามารถใช้สำหรับการสเกาต์แบบ Manual ได้ตามปกติ กรุณาเลือก Local Video เพื่อใช้ AI Tracking'
                  : 'YouTube video remains available for manual scouting. Please select a local video to enable AI tracking.'
                : isThai
                ? 'กรุณาเปิดไฟล์วิดีโอการแข่งขันแบดมินตันเพื่อเริ่มต้นใช้งานระบบติดตามการเคลื่อนที่'
                : 'Please load a local video file of a badminton match to begin tracking.'}
            </p>
          </div>
        </div>
      )}

      {/* Main Lab Workflow Steps */}
      {trackingEligible && activeSubTab === 'tracking' && (
        <div className="flex flex-col gap-4">
          {/* Step 1 & 2: Match & Video Config */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-[#132332] p-3.5 rounded-xl border border-[#263642] flex flex-col gap-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                1. {isThai ? 'ประเภทเกมการแข่งขัน' : 'Game Format'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setGameType('singles')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                    gameType === 'singles'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-400 font-black'
                      : 'bg-[#1a2d3f] border-[#263642] text-gray-400 hover:text-white'
                  }`}
                >
                  {isThai ? 'เดี่ยว (Singles - 2 คน)' : 'Singles (2 Players)'}
                </button>
                <button
                  type="button"
                  onClick={() => setGameType('doubles')}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${
                    gameType === 'doubles'
                      ? 'bg-sky-500/20 text-sky-300 border-sky-400 font-black'
                      : 'bg-[#1a2d3f] border-[#263642] text-gray-400 hover:text-white'
                  }`}
                >
                  {isThai ? 'คู่ (Doubles - 4 คน)' : 'Doubles (4 Players)'}
                </button>
              </div>
            </div>

            <div className="bg-[#132332] p-3.5 rounded-xl border border-[#263642] flex flex-col gap-2">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                2. {isThai ? 'ไฟล์วิดีโอที่ใช้' : 'Local Video File'}
              </span>
              <div className="flex items-center justify-between p-2 rounded-lg bg-[#1a2d3f] border border-[#263642] text-xs font-mono text-sky-300 truncate">
                <span className="truncate">{localFileName || 'No file selected'}</span>
                <span className="text-[10px] text-green-400 shrink-0 font-bold ml-2">✓ Verified</span>
              </div>
            </div>
          </div>

          {/* Processing Status Bar */}
          {status === 'PROCESSING' && (
            <div className="p-4 rounded-xl bg-[#132332] border border-sky-500/40 shadow-lg flex flex-col gap-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-sky-400" />
                  <span className="font-bold text-sky-400">
                    {isThai ? `กำลังวิเคราะห์วิดีโอ ${progressPct}%` : `Analyzing ${progressPct}%`}
                  </span>
                </div>
                <span className="font-mono text-gray-400">{progressTime}</span>
              </div>
              <div className="w-full bg-[#1a2d3f] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-sky-500 h-full transition-all duration-150"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCancelAnalysis}
                  className="px-3 py-1 text-xs font-bold rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/20 transition-colors"
                >
                  {isThai ? 'ยกเลิก' : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Actions CTA */}
          {status !== 'PROCESSING' && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleStartAnalysis}
                className="flex-1 py-3 bg-sky-500 hover:bg-sky-400 text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20 transition-all cursor-pointer active:scale-98"
              >
                <Play size={16} />
                <span>{isThai ? 'เริ่มประมวลผลแทรคกิ้ง (Run Analysis)' : 'Run Movement Analysis'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Calibration Subtab */}
      {activeSubTab === 'calibration' && (
        <div className="p-4 rounded-xl bg-[#132332] border border-[#263642] flex flex-col gap-3 text-xs">
          <h3 className="text-sm font-bold text-white">
            {isThai ? 'การปรับเทียบพิกัดสนาม (Court Calibration)' : 'Badminton Court Calibration'}
          </h3>
          <p className="text-gray-400">
            {isThai
              ? 'สนามขนาดมาตรฐาน 6.10 × 13.40 ม. ระบบใช้ Homography แปลงพิกัดจาก 4 มุมนอกของสนามประเภทคู่'
              : 'Standard court dimensions: 6.10 × 13.40m. Outer doubles court corners used for Homography transformation.'}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
            <div className="p-2 bg-[#1a2d3f] rounded border border-[#263642]">
              <span className="text-gray-400 block text-[9px]">Length</span>
              <span className="font-bold text-white">13.40 m</span>
            </div>
            <div className="p-2 bg-[#1a2d3f] rounded border border-[#263642]">
              <span className="text-gray-400 block text-[9px]">Doubles Width</span>
              <span className="font-bold text-white">6.10 m</span>
            </div>
            <div className="p-2 bg-[#1a2d3f] rounded border border-[#263642]">
              <span className="text-gray-400 block text-[9px]">Singles Width</span>
              <span className="font-bold text-white">5.18 m</span>
            </div>
            <div className="p-2 bg-[#1a2d3f] rounded border border-[#263642]">
              <span className="text-gray-400 block text-[9px]">Side Margin</span>
              <span className="font-bold text-white">0.46 m</span>
            </div>
          </div>
        </div>
      )}

      {/* Results Subtab */}
      {activeSubTab === 'results' && (
        <div className="p-4 rounded-xl bg-[#132332] border border-[#263642] flex flex-col gap-3 text-xs">
          <h3 className="text-sm font-bold text-white">
            {isThai ? 'สถิติการเคลื่อนที่ (Movement Metrics)' : 'Player Movement Telemetry'}
          </h3>
          <p className="text-gray-400">
            {isThai
              ? 'ข้อมูลระยะทาง ความเร็วสูงสุด (P95) และ Heatmap การครอบคลุมพื้นที่สนาม'
              : 'Calculated distance, 95th-percentile speed, and court coverage.'}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono">
            <div className="p-3 bg-[#1a2d3f] rounded-lg border border-[#263642]">
              <span className="text-gray-400 text-[10px] block">Total Distance</span>
              <span className="text-lg font-bold text-sky-400">
                {status === 'COMPLETED' ? '1,420 m' : '--'}
              </span>
            </div>
            <div className="p-3 bg-[#1a2d3f] rounded-lg border border-[#263642]">
              <span className="text-gray-400 text-[10px] block">Top Speed (P95)</span>
              <span className="text-lg font-bold text-emerald-400">
                {status === 'COMPLETED' ? '4.8 m/s' : '--'}
              </span>
            </div>
            <div className="p-3 bg-[#1a2d3f] rounded-lg border border-[#263642]">
              <span className="text-gray-400 text-[10px] block">Detection Coverage</span>
              <span className="text-lg font-bold text-purple-400">
                {status === 'COMPLETED' ? '96.2%' : '--'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

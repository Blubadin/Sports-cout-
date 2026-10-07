import React, { useState, useEffect, useRef } from 'react';
import type {
  ExportPreset,
  ExportOverlayConfig,
  ExportJobProgress,
  ExportStage,
} from '../../types/export';
import { EXPORT_PRESETS } from '../../types/export';
import { trackingSessionApi } from '../../services/trackingSessionApi';

export interface ExportConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  language?: 'th' | 'en';
}

const STAGE_LABELS: Record<ExportStage, { en: string; th: string }> = {
  PREPARING: { en: 'Preparing Analysis Results', th: 'กำลังเตรียมข้อมูลผลการวิเคราะห์' },
  RENDERING_VIDEO: { en: 'Rendering Video Overlays (MP4)', th: 'กำลังเรนเดอร์ภาพซ้อนทับลงวิดีโอ (MP4)' },
  GENERATING_HEATMAPS: { en: 'Generating Tactical Court Heatmaps', th: 'กำลังสร้างแผนผังความร้อนสนาม' },
  GENERATING_REPORT: { en: 'Generating PDF Match Report', th: 'กำลังสร้างรายงานสรุปผล PDF' },
  CREATING_ARCHIVE: { en: 'Packaging ZIP Archive', th: 'กำลังรวมไฟล์แพ็กเกจ ZIP' },
  COMPLETED: { en: 'Export Complete', th: 'ส่งออกเสร็จสมบูรณ์' },
  FAILED: { en: 'Export Failed', th: 'การส่งออกล้มเหลว' },
  CANCELLED: { en: 'Export Cancelled', th: 'ยกเลิกการส่งออกแล้ว' },
};

export default function ExportConfigModal({
  isOpen,
  onClose,
  sessionId,
  language = 'en',
}: ExportConfigModalProps) {
  const th = language === 'th';

  const [preset, setPreset] = useState<ExportPreset>('ANALYSIS');
  const [config, setConfig] = useState<ExportOverlayConfig>(EXPORT_PRESETS.ANALYSIS);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportJobProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync preset changes to config
  const handleSelectPreset = (p: ExportPreset) => {
    setPreset(p);
    if (p !== 'CUSTOM') {
      setConfig({ ...EXPORT_PRESETS[p] });
    }
  };

  const handleToggleOverlay = (field: keyof ExportOverlayConfig) => {
    setConfig((prev) => {
      const next = { ...prev, [field]: !prev[field] };
      setPreset('CUSTOM');
      return next;
    });
  };

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const handleStartExport = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportProgress(null);
    setIsCancelling(false);

    try {
      const response = await trackingSessionApi.startSessionExport(sessionId, {
        preset,
        court: config.court,
        playerDetection: config.playerDetection,
        pose: config.pose,
        groundPoints: config.groundPoints,
        shuttle: config.shuttle,
        playerLabels: config.playerLabels,
        trackIds: config.trackIds,
        debugInfo: config.debugInfo,
        confidences: config.confidences,
        format: config.format,
      });

      const exportId = response.exportId;

      const checkStatus = async () => {
        try {
          const status = await trackingSessionApi.getExportStatus(exportId);
          setExportProgress(status);

          if (status.status === 'COMPLETED' || status.status === 'FAILED' || status.status === 'CANCELLED') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (status.status === 'FAILED') {
              setExportError(status.error || (th ? 'การส่งออกล้มเหลว' : 'Export job failed'));
            }
          }
        } catch {
          // Keep polling if temporary network glitch
        }
      };

      // Immediate check + interval
      void checkStatus();
      pollIntervalRef.current = setInterval(checkStatus, 300);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportError(msg || (th ? 'ไม่สามารถเริ่มการส่งออกได้' : 'Failed to start export'));
      setIsExporting(false);
    }
  };

  const handleCancelExport = async () => {
    if (!exportProgress?.exportId || isCancelling) return;
    setIsCancelling(true);
    try {
      await trackingSessionApi.cancelExport(exportProgress.exportId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExportError(msg || (th ? 'ไม่สามารถยกเลิกการส่งออกได้' : 'Failed to cancel export'));
    }
  };

  const handleDownload = async () => {
    if (!exportProgress?.exportId || isDownloading) return;
    setIsDownloading(true);
    try {
      await trackingSessionApi.downloadExportArchive(
        exportProgress.exportId,
        exportProgress.archiveFilename || undefined
      );
    } catch {
      const downloadUrl = trackingSessionApi.getExportDownloadUrl(exportProgress.exportId);
      window.open(downloadUrl, '_blank');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleReset = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsExporting(false);
    setExportProgress(null);
    setExportError(null);
    setIsCancelling(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#0b1219] border border-slate-700/80 rounded-xl shadow-2xl max-w-2xl w-full text-slate-100 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              {th ? 'ส่งออกข้อมูลการวิเคราะห์' : 'Export Analysis Package'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {th
                ? 'วิดีโอซ้อนทับ, แผนผังความร้อนสนาม 2D, รายงาน PDF และข้อมูลผลลัพธ์บริสุทธิ์'
                : 'Canonical video overlays, 2D court heatmaps, match PDF report, and structured data'}
            </p>
          </div>
          {!isExporting && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-lg font-mono p-1 rounded hover:bg-slate-800 transition"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {isExporting ? (
            /* Progress & Status View */
            <div className="space-y-6">
              <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-lg">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {th ? 'ขั้นตอนปัจจุบัน' : 'Current Stage'}
                  </span>
                  <span className="text-xs font-mono font-medium text-emerald-400">
                    {exportProgress?.progress ?? 0}%
                  </span>
                </div>
                <h3 className="text-base font-semibold text-white">
                  {exportProgress?.stage
                    ? (th ? STAGE_LABELS[exportProgress.stage]?.th : STAGE_LABELS[exportProgress.stage]?.en) || exportProgress.stage
                    : (th ? 'กำลังเตรียมการ...' : 'Initializing...')}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {exportProgress?.detail || exportProgress?.stageLabel || (th ? 'กำลังติดต่อ AI Service...' : 'Connecting to AI Service...')}
                </p>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-2.5 mt-4 overflow-hidden">
                  <div
                    className={`h-2.5 rounded-full transition-all duration-300 ${
                      exportProgress?.status === 'FAILED'
                        ? 'bg-red-500'
                        : exportProgress?.status === 'CANCELLED'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.max(4, exportProgress?.progress ?? 0)}%` }}
                  ></div>
                </div>
              </div>

              {/* Error notice */}
              {exportError && (
                <div className="p-4 bg-red-950/50 border border-red-800/80 rounded-lg text-sm text-red-200">
                  <div className="font-semibold mb-1 flex items-center gap-2">
                    <span>⚠️</span> {th ? 'เกิดข้อผิดพลาดในการส่งออก' : 'Export Failed'}
                  </div>
                  <div className="text-xs font-mono text-red-300 break-words">{exportError}</div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={handleReset}
                      className="px-3 py-1.5 bg-red-800/60 hover:bg-red-700/80 text-white rounded text-xs transition"
                    >
                      {th ? 'ลองใหม่อีกครั้ง' : 'Try Again'}
                    </button>
                    <button
                      onClick={onClose}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
                    >
                      {th ? 'ปิดหน้าต่าง' : 'Close'}
                    </button>
                  </div>
                </div>
              )}

              {/* Cancelled notice */}
              {exportProgress?.status === 'CANCELLED' && !exportError && (
                <div className="p-4 bg-amber-950/50 border border-amber-800/80 rounded-lg text-sm text-amber-200">
                  <div className="font-semibold mb-1">
                    {th ? 'การส่งออกถูกยกเลิกแล้ว' : 'Export Cancelled'}
                  </div>
                  <p className="text-xs text-amber-300">
                    {th
                      ? 'ไฟล์ชั่วคราวถูกล้างเรียบร้อยแล้ว'
                      : 'Temporary export files were cleaned up successfully.'}
                  </p>
                  <div className="mt-3">
                    <button
                      onClick={handleReset}
                      className="px-3 py-1.5 bg-amber-800/60 hover:bg-amber-700 text-white rounded text-xs transition"
                    >
                      {th ? 'เริ่มใหม่' : 'Restart'}
                    </button>
                  </div>
                </div>
              )}

              {/* Completed action */}
              {exportProgress?.status === 'COMPLETED' && (
                <div className="p-5 bg-emerald-950/40 border border-emerald-800/80 rounded-lg space-y-4">
                  <div>
                    <h4 className="text-sm font-semibold text-emerald-300 flex items-center gap-2">
                      <span>✓</span> {th ? 'แพ็กเกจส่งออกพร้อมดาวน์โหลดแล้ว' : 'Analysis Package Ready'}
                    </h4>
                    <p className="text-xs text-slate-300 mt-1">
                      {th
                        ? 'ไฟล์ ZIP พร้อมวิดีโอ แผนผังความร้อน รายงาน PDF และข้อมูลผลการวิเคราะห์'
                        : 'Compressed archive containing video, court heatmaps, PDF report, and raw manifests.'}
                    </p>
                    {exportProgress.archiveSizeBytes && (
                      <p className="text-xs font-mono text-slate-400 mt-1">
                        {th ? 'ขนาดไฟล์: ' : 'Archive Size: '}
                        {(exportProgress.archiveSizeBytes / (1024 * 1024)).toFixed(2)} MB
                      </p>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-medium text-sm rounded-lg transition shadow-lg flex items-center justify-center gap-2"
                    >
                      <span>📥</span> {isDownloading ? (th ? 'กำลังเตรียมไฟล์ดาวน์โหลด...' : 'Preparing download...') : (th ? 'ดาวน์โหลดแพ็กเกจ (.zip)' : 'Download Analysis Package (.zip)')}
                    </button>
                    <button
                      onClick={onClose}
                      className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition"
                    >
                      {th ? 'เสร็จสิ้น' : 'Done'}
                    </button>
                  </div>
                </div>
              )}

              {/* Cancel button during active processing */}
              {exportProgress && exportProgress.status !== 'COMPLETED' && exportProgress.status !== 'FAILED' && exportProgress.status !== 'CANCELLED' && (
                <div className="flex justify-end pt-2">
                  <button
                    onClick={handleCancelExport}
                    disabled={isCancelling}
                    className="px-4 py-2 bg-slate-800 hover:bg-red-950/60 hover:text-red-300 border border-slate-700 hover:border-red-800 text-slate-300 text-xs rounded transition disabled:opacity-50"
                  >
                    {isCancelling ? (th ? 'กำลังยกเลิก...' : 'Cancelling...') : (th ? 'ยกเลิกการส่งออก' : 'Cancel Export')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Configuration View */
            <div className="space-y-6">
              {/* Presets */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  {th ? 'รูปแบบที่แนะนำ (Presets)' : 'Overlay Presets'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['CLEAN', 'ANALYSIS', 'DEBUG'] as const).map((p) => {
                    const active = preset === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleSelectPreset(p)}
                        className={`py-2 px-3 rounded-lg border text-xs font-medium transition text-center ${
                          active
                            ? 'bg-sky-950/70 border-sky-500 text-sky-200 shadow-sm'
                            : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-bold">{p}</div>
                        <div className="text-[10px] opacity-75 mt-0.5">
                          {p === 'CLEAN'
                            ? th ? 'วิดีโอต้นฉบับไร้เส้น' : 'No overlays'
                            : p === 'ANALYSIS'
                            ? th ? 'มาตรฐาน (แนะนำ)' : 'Standard (Recommended)'
                            : th ? 'ข้อมูลดีบักทั้งหมด' : 'Full diagnostics'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Overlays Configuration */}
              <div className="space-y-4">
                {/* Group: Analysis */}
                <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                    <span>{th ? '1. การวิเคราะห์ภาพ (Analysis Overlays)' : '1. Analysis Overlays'}</span>
                    <span className="text-[10px] font-normal text-slate-400 lowercase">{th ? 'ข้อมูลกายภาพและสนาม' : 'spatial & pose'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={config.court}
                        onChange={() => handleToggleOverlay('court')}
                        className="rounded border-slate-700 text-sky-600 focus:ring-0 bg-slate-800"
                      />
                      <span>{th ? 'เส้นขอบเขตสนาม (Court)' : 'Court Polygon Overlay'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={config.playerDetection}
                        onChange={() => handleToggleOverlay('playerDetection')}
                        className="rounded border-slate-700 text-sky-600 focus:ring-0 bg-slate-800"
                      />
                      <span>{th ? 'กรอบตรวจจับผู้เล่น (Player Box)' : 'Player Bounding Box'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={config.pose}
                        onChange={() => handleToggleOverlay('pose')}
                        className="rounded border-slate-700 text-sky-600 focus:ring-0 bg-slate-800"
                      />
                      <span>{th ? 'โครงกระดูก 2D (Pose Skeleton)' : 'COCO-17 Pose Skeleton'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={config.groundPoints}
                        onChange={() => handleToggleOverlay('groundPoints')}
                        className="rounded border-slate-700 text-sky-600 focus:ring-0 bg-slate-800"
                      />
                      <span>{th ? 'ตำแหน่งเท้าแตะพื้น (Ground Points)' : 'Feet & Ground Points'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={config.shuttle}
                        onChange={() => handleToggleOverlay('shuttle')}
                        className="rounded border-slate-700 text-sky-600 focus:ring-0 bg-slate-800"
                      />
                      <span>{th ? 'ลูกแบดมินตันและหางวิถี (Shuttle & Trail)' : 'Shuttle & Motion Trail'}</span>
                    </label>
                  </div>
                </div>

                {/* Group: Identity */}
                <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                    <span>{th ? '2. ข้อมูลระบุตัวตน (Identity Overlays)' : '2. Identity Overlays'}</span>
                    <span className="text-[10px] font-normal text-slate-400 lowercase">{th ? 'ผู้เล่นและตัวระบุแทร็ก' : 'player mapping'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={config.playerLabels}
                        onChange={() => handleToggleOverlay('playerLabels')}
                        className="rounded border-slate-700 text-sky-600 focus:ring-0 bg-slate-800"
                      />
                      <span>{th ? 'ป้ายชื่อผู้เล่น (P1..P4 Labels)' : 'Player Labels (P1..P4)'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={config.trackIds}
                        onChange={() => handleToggleOverlay('trackIds')}
                        className="rounded border-slate-700 text-sky-600 focus:ring-0 bg-slate-800"
                      />
                      <span>{th ? 'MOT Track IDs (ดีบัก)' : 'Raw ByteTrack IDs (Debug)'}</span>
                    </label>
                  </div>
                </div>

                {/* Group: Debug Information */}
                <div className="p-3.5 bg-slate-900/60 border border-slate-800/80 rounded-lg">
                  <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                    <span>{th ? '3. ข้อมูลดีบักระบบ (Debug Overlays)' : '3. Diagnostics & HUD'}</span>
                    <span className="text-[10px] font-normal text-slate-400 lowercase">{th ? 'ค่าความเชื่อมั่นและข้อมูลเฟรม' : 'telemetry telemetry HUD'}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={config.debugInfo}
                        onChange={() => handleToggleOverlay('debugInfo')}
                        className="rounded border-slate-700 text-sky-600 focus:ring-0 bg-slate-800"
                      />
                      <span>{th ? 'HUD ข้อมูลการประมวลผล (Segment/FPS)' : 'Telemetry HUD (FPS / Segment)'}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                      <input
                        type="checkbox"
                        checked={config.confidences}
                        onChange={() => handleToggleOverlay('confidences')}
                        className="rounded border-slate-700 text-sky-600 focus:ring-0 bg-slate-800"
                      />
                      <span>{th ? 'ค่าความเชื่อมั่นการตรวจจับ (Confidences)' : 'Detection Confidences'}</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Audio Note & Notice */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-xs space-y-1 text-slate-400">
                <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                  <span>ℹ️</span> {th ? 'ข้อสังเกตเกี่ยวกับไฟล์ส่งออก:' : 'Export Pipeline Notice:'}
                </div>
                <p>
                  {th
                    ? '• วิดีโอภาพซ้อนทับจะเรนเดอร์เฉพาะภาพแบบเฟรมต่อเฟรมที่ตรงกับไทม์ไลน์ และไม่รวมสัญญาณเสียงจากวิดีโอต้นฉบับ'
                    : '• Exported video overlays maintain exact frame and timestamp alignment. Video overlays do not multiplex source audio.'}
                </p>
                <p>
                  {th
                    ? '• แผนผังความร้อนสร้างด้วยแบบจำลองความหนาแน่นแบบเกาส์เซียน 2D บนระนาบสนามขนาด 6.1m × 13.4m'
                    : '• Heatmaps are generated using continuous 2D Gaussian density on the canonical court plane (meters).'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition"
                >
                  {th ? 'ยกเลิก' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleStartExport}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-lg transition shadow-md flex items-center gap-2"
                >
                  <span>🚀</span> {th ? 'เริ่มการส่งออก' : 'Start Export'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

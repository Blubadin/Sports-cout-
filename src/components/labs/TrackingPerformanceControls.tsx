import React from 'react';
import type { BackendCapabilities } from '../../services/trackingSessionApi';
import type { ProjectTrackingState } from '../../services/trackingSessionStore';
import type { ProcessingProfile, ShuttleProvenance } from '../../types';
import { deriveShuttleEngineStatus, formatDiagnosticCount, TRACKING_LAB_BUTTON_CLASS } from './trackingLabStatus';

interface TrackingPerformanceControlsProps {
  th: boolean;
  processing: boolean;
  profile: ProcessingProfile;
  onSelectProfile: (profile: ProcessingProfile) => void;
  devicePreference: 'auto' | 'cpu' | 'cuda' | 'mps';
  onChangeDevice: (device: 'auto' | 'cpu' | 'cuda' | 'mps') => void;
  onMarkCustomProfile: () => void;
  actualInferenceDevice: string | null;
  capabilities: BackendCapabilities | null;
  showAdvancedSettings: boolean;
  onToggleAdvancedSettings: () => void;
  detectorInputSize: number;
  onChangeDetectorInputSize: (size: number) => void;
  effectiveFrameStride: number;
  requiredShuttleFrameStride: number | null | undefined;
  onChangeFrameStride: (stride: number) => void;
  poseStride: number;
  onChangePoseStride: (stride: number) => void;
  useCourtRoi: boolean;
  onChangeUseCourtRoi: (enabled: boolean) => void;
  courtRoiMarginPx: number;
  onChangeCourtRoiMarginPx: (marginPx: number) => void;
  shuttleTrackingEnabled: boolean;
  onToggleShuttleTracking: (enabled: boolean) => void;
  effectiveShuttleProv: ShuttleProvenance | null;
  processingConfig: ProjectTrackingState['processingConfig'];
}

export function TrackingPerformanceControls({
  th,
  processing,
  profile,
  onSelectProfile,
  devicePreference,
  onChangeDevice,
  onMarkCustomProfile,
  actualInferenceDevice,
  capabilities,
  showAdvancedSettings,
  onToggleAdvancedSettings,
  detectorInputSize,
  onChangeDetectorInputSize,
  effectiveFrameStride,
  requiredShuttleFrameStride,
  onChangeFrameStride,
  poseStride,
  onChangePoseStride,
  useCourtRoi,
  onChangeUseCourtRoi,
  courtRoiMarginPx,
  onChangeCourtRoiMarginPx,
  shuttleTrackingEnabled,
  onToggleShuttleTracking,
  effectiveShuttleProv,
  processingConfig,
}: TrackingPerformanceControlsProps) {
  const shuttleStatusInfo = deriveShuttleEngineStatus({
    enabled: shuttleTrackingEnabled || Boolean(effectiveShuttleProv?.enabled),
    sessionProvenance: effectiveShuttleProv,
    backendCapability: capabilities?.shuttle,
    isProcessing: processing,
  });

  const sanitizedModelName =
    effectiveShuttleProv?.model ||
    capabilities?.shuttle?.configuredModel ||
    capabilities?.shuttle?.model ||
    null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          <span className="font-medium">{th ? 'โปรไฟล์การประมวลผล' : 'Performance profile'}</span>
          <select
            aria-label={th ? 'โปรไฟล์การประมวลผล' : 'Performance profile'}
            disabled={processing}
            value={profile}
            onChange={(e) => onSelectProfile(e.target.value as ProcessingProfile)}
            className="bg-slate-800 p-2 rounded border border-slate-700 text-slate-200"
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
          className={TRACKING_LAB_BUTTON_CLASS}
          disabled={processing || !capabilities?.cudaAvailable}
          title={
            capabilities?.cudaAvailable
              ? 'Use NVIDIA CUDA for this analysis'
              : 'CUDA is unavailable in the current Python environment'
          }
          onClick={() => {
            onChangeDevice('cuda');
            onMarkCustomProfile();
          }}
        >
          {th ? 'ใช้ GPU' : 'Use GPU'}
        </button>

        <span className="text-xs px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded font-mono text-slate-300">
          {th ? 'อุปกรณ์ฮาร์ดแวร์:' : 'Inference:'}{' '}
          <span className="uppercase text-sky-400 font-semibold">
            {devicePreference === 'auto' ? `Auto (${actualInferenceDevice || 'CPU'})` : devicePreference}
          </span>
        </span>

        <button
          type="button"
          className="text-xs text-sky-400 hover:text-sky-300 underline font-medium"
          onClick={onToggleAdvancedSettings}
        >
          {showAdvancedSettings
            ? th
              ? 'ซ่อนการตั้งค่าขั้นสูง ▲'
              : 'Hide advanced settings ▲'
            : th
            ? 'ตั้งค่าขั้นสูง (Advanced) ▼'
            : 'Advanced settings ▼'}
        </button>
      </div>

      {showAdvancedSettings && (
        <div
          data-testid="advanced-settings-drawer"
          className="bg-slate-900/60 border border-slate-800 rounded p-3 text-xs space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <label className="space-y-1 block">
              <span className="text-slate-400 block">{th ? 'เป้าหมายฮาร์ดแวร์' : 'Target Hardware'}</span>
              <select
                aria-label="Processing mode"
                disabled={processing}
                value={devicePreference}
                onChange={(e) => {
                  onChangeDevice(e.target.value as 'auto' | 'cpu' | 'cuda' | 'mps');
                  onMarkCustomProfile();
                }}
                className="bg-slate-800 p-1.5 rounded w-full text-slate-200 border border-slate-700"
              >
                <option value="auto">{th ? 'อัตโนมัติ (Auto)' : 'Auto'}</option>
                <option value="cpu">CPU</option>
                <option value="cuda" disabled={!capabilities?.cudaAvailable}>
                  GPU (CUDA){capabilities?.cudaAvailable ? '' : ' — unavailable'}
                </option>
                <option value="mps" disabled={!capabilities?.mpsAvailable}>
                  GPU (MPS){capabilities?.mpsAvailable ? '' : ' — unavailable'}
                </option>
              </select>
            </label>

            <label className="space-y-1 block">
              <span className="text-slate-400 block">{th ? 'ความละเอียดตัวตรวจจับ' : 'Detector Input Size'}</span>
              <select
                aria-label="Detector Input Size"
                disabled={processing}
                value={detectorInputSize}
                onChange={(e) => {
                  onChangeDetectorInputSize(Number(e.target.value));
                  onMarkCustomProfile();
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
                disabled={processing || requiredShuttleFrameStride != null}
                value={effectiveFrameStride}
                onChange={(e) => {
                  onChangeFrameStride(Number(e.target.value));
                  onMarkCustomProfile();
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
                onChange={(e) => {
                  onChangePoseStride(Number(e.target.value));
                  onMarkCustomProfile();
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
                onChange={(e) => {
                  onChangeUseCourtRoi(e.target.checked);
                  onMarkCustomProfile();
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
                  onChange={(e) => {
                    onChangeCourtRoiMarginPx(Math.max(10, Number(e.target.value)));
                    onMarkCustomProfile();
                  }}
                  className="bg-slate-800 p-1 rounded w-16 text-center text-slate-200"
                  min={10}
                  max={200}
                />
                <span className="text-slate-400">px</span>
              </label>
            )}
          </div>

          <div
            className="pt-2 border-t border-slate-800/80 space-y-2"
            data-testid="shuttle-tracking-engine-section"
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-slate-300 flex items-center gap-2">
                <span>{th ? 'การตรวจจับลูกขนไก่ (Shuttle Tracking Engine)' : 'Shuttle Tracking Engine'}</span>
                <span className="text-[10px] text-slate-400 font-normal">
                  {th ? '(Inference runtime — แยกจาก Overlay)' : '(Inference runtime — separate from display overlay)'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{th ? 'สถานะ:' : 'Status:'}</span>
                <span
                  data-testid="shuttle-tracking-status"
                  data-status={shuttleStatusInfo.status}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium ${shuttleStatusInfo.badgeClass}`}
                >
                  {shuttleStatusInfo.displayText}
                </span>
              </div>
            </div>

            <p data-testid="shuttle-tracking-explanation" className="text-xs text-slate-400">
              {shuttleStatusInfo.detailText}
            </p>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/40 p-2 rounded border border-slate-800">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  aria-label="Enable Shuttle Tracking"
                  disabled={processing}
                  checked={shuttleTrackingEnabled}
                  onChange={(e) => onToggleShuttleTracking(e.target.checked)}
                  className="rounded bg-slate-800 border-slate-700 text-sky-500"
                />
                <span className="font-medium text-slate-200">
                  {th ? 'เปิดใช้งานการตรวจจับลูกขนไก่ (Enable Shuttle Tracking)' : 'Enable Shuttle Tracking'}
                </span>
              </label>

              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>{th ? 'โมเดล:' : 'Model:'}</span>
                <span className="text-slate-300 font-mono">
                  {sanitizedModelName || (th ? 'ยังไม่ได้ระบุโมเดล (SHUTTLE_MODEL_PATH)' : 'None (configured via backend/env)')}
                </span>
              </div>
            </div>

            {(shuttleTrackingEnabled || Boolean(effectiveShuttleProv?.enabled ?? processingConfig?.shuttleEnabled)) && (
              <div
                data-testid="shuttle-runtime-diagnostics"
                className="bg-slate-950/60 p-2.5 rounded border border-slate-800 space-y-2 text-[11px]"
              >
                <div className="font-medium text-slate-300">
                  {th ? 'การวินิจฉัยรันไทม์ลูกขนไก่ (Runtime Diagnostics)' : 'Shuttle Runtime Diagnostics'}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-400">
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Provider / Model</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-provider-model">
                      {effectiveShuttleProv?.provider ?? capabilities?.shuttle?.provider ?? '—'} / {sanitizedModelName ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Runtime / Precision</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-runtime-precision">
                      {effectiveShuttleProv?.runtime ?? capabilities?.shuttle?.runtime ?? '—'} ({effectiveShuttleProv?.precision ?? capabilities?.shuttle?.precision ?? '—'})
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Device / Window</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-device-window">
                      {effectiveShuttleProv?.device ?? capabilities?.shuttle?.device ?? '—'} / {effectiveShuttleProv?.windowSize ?? capabilities?.shuttle?.windowSize ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Frames (Rec / Valid)</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-frames">
                      {formatDiagnosticCount(effectiveShuttleProv?.framesReceived)} / {formatDiagnosticCount(effectiveShuttleProv?.validFrames)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Inference Calls / Mean</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-inference">
                      {formatDiagnosticCount(effectiveShuttleProv?.inferenceCalls)} (
                      {effectiveShuttleProv?.meanInferenceMs != null ? `${effectiveShuttleProv.meanInferenceMs.toFixed(1)}ms` : '—'})
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Obs / Pred</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-obs-pred">
                      {formatDiagnosticCount(effectiveShuttleProv?.observedCount)} / {formatDiagnosticCount(effectiveShuttleProv?.predictedCount)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Lost / Unknown</span>
                    <span className="text-slate-200 font-mono" data-testid="diag-lost-unknown">
                      {formatDiagnosticCount(effectiveShuttleProv?.lostCount)} / {formatDiagnosticCount(effectiveShuttleProv?.unknownCount)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Last Failure</span>
                    <span className="text-slate-200 font-mono truncate" data-testid="diag-last-failure">
                      {effectiveShuttleProv?.lastFailure || effectiveShuttleProv?.failureReason || '—'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {requiredShuttleFrameStride === 1 && (
              <p className="text-xs text-slate-400">
                {th
                  ? `โมเดลนี้ต้องใช้ ${capabilities?.shuttle?.windowSize} เฟรมต่อเนื่อง ระบบจึงวิเคราะห์ทุกเฟรม (Frame Stride 1)`
                  : `This model requires ${capabilities?.shuttle?.windowSize} consecutive frames; analysis uses every frame (Frame Stride 1).`}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}

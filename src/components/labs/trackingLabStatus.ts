import type { AIConnectionSnapshot } from '../../services/aiConnection';
import type { BackendCapabilities } from '../../services/trackingSessionApi';
import type {
  BackendSessionStatus,
  ShuttleProvenance,
  ShuttleTrackingStatus,
  TrackingTelemetryV1,
} from '../../types';
import type { ProjectTrackingState } from '../../services/trackingSessionStore';

export const TRACKING_LAB_BUTTON_CLASS =
  'rounded-lg border border-slate-600 px-3 py-2 text-sm transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 motion-reduce:transform-none motion-reduce:transition-none disabled:opacity-40 disabled:cursor-not-allowed';

export function formatDiagnosticCount(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return String(val);
}

export function telemetryCoversTime(items: TrackingTelemetryV1[], target: number): boolean {
  return items.length > 0 && target >= items[0].timestampSec && target <= items[items.length - 1].timestampSec;
}

/** Maps a backend job status into the frontend tracking session status union. */
export function normalizeBackendSessionStatus(status: BackendSessionStatus): ProjectTrackingState['status'] {
  if (status === 'READY') return 'CREATED';
  return status;
}

export function deriveShuttleEngineStatus(params: {
  enabled: boolean;
  sessionProvenance?: ShuttleProvenance | null;
  backendCapability?: BackendCapabilities['shuttle'] | null;
  isProcessing?: boolean;
}): {
  status: ShuttleTrackingStatus;
  displayText: string;
  detailText: string;
  badgeClass: string;
} {
  const { enabled, sessionProvenance, backendCapability, isProcessing } = params;

  if (!enabled) {
    return {
      status: 'DISABLED',
      displayText: 'Disabled',
      detailText: 'Tracking disabled',
      badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700',
    };
  }

  // 1. Live session provenance
  if (sessionProvenance) {
    if (sessionProvenance.status === 'MODEL_UNAVAILABLE') {
      const hasModel = Boolean(sessionProvenance.model || sessionProvenance.configuredModel);
      return {
        status: 'MODEL_UNAVAILABLE',
        displayText: 'Model unavailable',
        detailText: hasModel ? 'Model failed to load' : 'No model configured',
        badgeClass: 'bg-amber-950/60 text-amber-300 border border-amber-800',
      };
    }
    if (sessionProvenance.status === 'RUNTIME_UNAVAILABLE') {
      return {
        status: 'RUNTIME_UNAVAILABLE',
        displayText: 'Runtime unavailable',
        detailText: 'Runtime unavailable',
        badgeClass: 'bg-rose-950/60 text-rose-300 border border-rose-800',
      };
    }
    if (sessionProvenance.status === 'INITIALIZATION_ERROR') {
      return {
        status: 'INITIALIZATION_ERROR',
        displayText: 'Initialization error',
        detailText: 'Model failed to load',
        badgeClass: 'bg-rose-950/60 text-rose-300 border border-rose-800',
      };
    }
    if (sessionProvenance.status === 'DISABLED') {
      return {
        status: 'DISABLED',
        displayText: 'Disabled',
        detailText: 'Tracking disabled',
        badgeClass: 'bg-slate-800 text-slate-400 border border-slate-700',
      };
    }
    if (sessionProvenance.status === 'AVAILABLE') {
      const active = Boolean(sessionProvenance.active || isProcessing);
      const calls = sessionProvenance.inferenceCalls ?? 0;
      const observed = sessionProvenance.observedCount ?? 0;
      let detailText = 'Model ready';
      if (active) {
        if (calls > 0 && observed === 0) {
          detailText = 'Model active but no shuttle candidates';
        } else if (observed > 0) {
          detailText = 'Model active and shuttle observed';
        } else {
          detailText = 'Model active';
        }
      }
      return {
        status: 'AVAILABLE',
        displayText: active ? 'Active' : 'Ready',
        detailText,
        badgeClass: active
          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
          : 'bg-sky-950/60 text-sky-300 border border-sky-800',
      };
    }
    return {
      status: sessionProvenance.status,
      displayText: sessionProvenance.status,
      detailText: sessionProvenance.status,
      badgeClass: 'bg-slate-800 text-slate-300 border border-slate-700',
    };
  }

  // 2. Pre-session backend capability probe
  if (backendCapability) {
    const probe = backendCapability.probeStatus || backendCapability.status;
    const hasModel = Boolean(backendCapability.configuredModel || backendCapability.model);
    if (probe === 'MODEL_UNAVAILABLE' || backendCapability.modelAvailable === false) {
      return {
        status: 'MODEL_UNAVAILABLE',
        displayText: 'Model unavailable',
        detailText: hasModel ? 'Model failed to load' : 'No model configured',
        badgeClass: 'bg-amber-950/60 text-amber-300 border border-amber-800',
      };
    }
    if (probe === 'RUNTIME_UNAVAILABLE') {
      return {
        status: 'RUNTIME_UNAVAILABLE',
        displayText: 'Runtime unavailable',
        detailText: 'Runtime unavailable',
        badgeClass: 'bg-rose-950/60 text-rose-300 border border-rose-800',
      };
    }
    if (probe === 'INITIALIZATION_ERROR') {
      return {
        status: 'INITIALIZATION_ERROR',
        displayText: 'Initialization error',
        detailText: 'Model failed to load',
        badgeClass: 'bg-rose-950/60 text-rose-300 border border-rose-800',
      };
    }
    if (probe === 'AVAILABLE' || backendCapability.modelAvailable === true) {
      return {
        status: 'AVAILABLE',
        displayText: 'Ready',
        detailText: 'Model ready',
        badgeClass: 'bg-sky-950/60 text-sky-300 border border-sky-800',
      };
    }
  }

  return {
    status: 'REQUESTED',
    displayText: 'Requested',
    detailText: 'Tracking requested',
    badgeClass: 'bg-indigo-950/60 text-indigo-300 border border-indigo-800',
  };
}

export function connectionStatusText(connection: AIConnectionSnapshot | null, th: boolean): string {
  if (connection === null) return th ? 'กำลังตรวจสอบบริการ AI…' : 'Checking local AI service…';
  const english: Record<AIConnectionSnapshot['code'], string> = {
    CONNECTED: 'Local AI Connected',
    AI_OFFLINE: 'Local AI service offline',
    AUTH_REQUIRED: 'Local AI Authentication required',
    AUTH_FAILED: 'Local AI Authentication failed',
    ENDPOINT_NOT_CONFIGURED: 'Remote AI endpoint not configured',
    MIXED_CONTENT: 'Local AI Blocked by browser security',
    NETWORK_ERROR: 'Local AI network error',
    BROWSER_SECURITY_BLOCKED: 'Local AI Blocked by browser security',
    CSP_BLOCKED: 'Local AI Blocked by browser security',
    AI_BUSY: 'Another Local AI analysis is running',
    AI_SESSION_CONFLICT: 'Local AI tracking session conflict',
    AI_SERVER_ERROR: 'Local AI service error',
    AI_REQUEST_REJECTED: 'Local AI rejected the request',
  };
  if (!th) return english[connection.code];
  const thai: Record<AIConnectionSnapshot['code'], string> = {
    CONNECTED: 'เชื่อมต่อ Local AI แล้ว',
    AI_OFFLINE: 'บริการ Local AI ยังไม่ทำงาน',
    AUTH_REQUIRED: 'Local AI ต้องยืนยันตัวตน',
    AUTH_FAILED: 'Local AI ยืนยันตัวตนไม่สำเร็จ',
    ENDPOINT_NOT_CONFIGURED: 'ยังไม่ได้ตั้งค่า Remote AI endpoint',
    MIXED_CONTENT: 'Local AI ถูกบล็อกโดยความปลอดภัยของเบราว์เซอร์',
    NETWORK_ERROR: 'เกิดข้อผิดพลาดเครือข่าย Local AI',
    BROWSER_SECURITY_BLOCKED: 'Local AI ถูกบล็อกโดยความปลอดภัยของเบราว์เซอร์',
    CSP_BLOCKED: 'Local AI ถูกบล็อกโดยนโยบายความปลอดภัย',
    AI_BUSY: 'Local AI กำลังวิเคราะห์งานอื่นอยู่ กรุณารอหรือยกเลิกงานเดิมก่อนเริ่มงานใหม่',
    AI_SESSION_CONFLICT: 'เซสชันติดตามของ Local AI อยู่ในสถานะที่ทำรายการนี้ไม่ได้',
    AI_SERVER_ERROR: 'บริการ Local AI เกิดข้อผิดพลาดขณะประมวลผลคำขอ',
    AI_REQUEST_REJECTED: 'บริการ Local AI ปฏิเสธคำขอนี้',
  };
  return thai[connection.code];
}

import React from 'react';
import { RefreshCw, ShieldAlert, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useScoutContext } from '../context/ScoutContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { getPwaUpdateBlockers, hasPendingScoutInput } from '../utils/pwaUpdateSafety';

export default function PWAUpdatePrompt() {
  const { currentAction, currentActions, settings } = useScoutContext();
  const { saveStatus, flushPendingSaves } = useWorkspace();
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.warn('Service worker registration failed:', error);
    },
  });
  const [applying, setApplying] = React.useState(false);
  const language = settings.uiLanguage ?? 'th';
  const blockers = getPwaUpdateBlockers({
    hasPendingAction: hasPendingScoutInput(currentAction as Record<string, unknown>, currentActions),
    saveStatus,
  });

  React.useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const timeoutId = window.setTimeout(() => setOfflineReady(false), 4_000);
    return () => window.clearTimeout(timeoutId);
  }, [needRefresh, offlineReady, setOfflineReady]);

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  const applyUpdate = async () => {
    if (blockers.length > 0 || applying) return;
    setApplying(true);
    try {
      await flushPendingSaves();
      await updateServiceWorker(true);
    } finally {
      setApplying(false);
    }
  };

  const blockerText = language === 'th'
    ? blockers.includes('pending-action')
      ? 'บันทึกหรือล้าง action ที่กำลังเลือกก่อนอัปเดต'
      : blockers.includes('save-failed')
        ? 'โปรเจกต์บันทึกไม่สำเร็จ กรุณาลองบันทึกอีกครั้งก่อนอัปเดต'
        : 'รอให้โปรเจกต์บันทึกเสร็จก่อนอัปเดต'
    : blockers.includes('pending-action')
      ? 'Save or clear the pending action before updating.'
      : blockers.includes('save-failed')
        ? 'Project save failed. Retry saving before updating.'
        : 'Wait for the project save to finish before updating.';

  return (
    <aside className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-3 z-[10000] w-auto rounded-lg border border-sky-400/40 bg-slate-950 p-3 text-slate-100 shadow-2xl sm:left-auto sm:right-4 sm:w-[min(88vw,380px)]" role="status">
      <button type="button" onClick={dismiss} aria-label={language === 'th' ? 'ปิดข้อความอัปเดต' : 'Dismiss update message'} className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-white">
        <X size={16} />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <div className="mt-0.5 rounded-md bg-sky-500/15 p-2 text-sky-300">
          {needRefresh ? <RefreshCw size={19} /> : <WifiOff size={19} />}
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-black">
            {needRefresh
              ? language === 'th' ? 'SPORTSCOUT เวอร์ชันใหม่พร้อมแล้ว' : 'A new SPORTSCOUT version is ready'
              : language === 'th' ? 'พร้อมใช้งานแบบออฟไลน์' : 'Ready for offline use'}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {needRefresh
              ? language === 'th' ? 'ระบบจะตรวจข้อมูลที่ยังไม่บันทึกก่อนโหลดเวอร์ชันใหม่' : 'Unsaved work is checked before the new version reloads.'
              : language === 'th' ? 'ไฟล์หลักถูกเก็บไว้ในอุปกรณ์แล้ว' : 'Core app files are now stored on this device.'}
          </p>
        </div>
      </div>
      {needRefresh && blockers.length > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-semibold text-amber-200">
          <ShieldAlert size={15} className="shrink-0" /> {blockerText}
        </div>
      )}
      <div className={`flex justify-end gap-2 ${needRefresh ? 'mt-3' : 'mt-1'}`}>
        <button type="button" onClick={dismiss} className="h-9 rounded-md px-3 text-xs font-bold text-slate-300 hover:bg-slate-800">
          {language === 'th' ? 'ไว้ภายหลัง' : 'Later'}
        </button>
        {needRefresh && (
          <button type="button" onClick={applyUpdate} disabled={blockers.length > 0 || applying} className="inline-flex h-9 items-center gap-2 rounded-md bg-sky-500 px-3 text-xs font-black text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">
            <RefreshCw size={14} className={applying ? 'animate-spin' : ''} />
            {applying ? language === 'th' ? 'กำลังอัปเดต' : 'Updating' : language === 'th' ? 'อัปเดตตอนนี้' : 'Update now'}
          </button>
        )}
      </div>
    </aside>
  );
}

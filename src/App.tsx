import React, { useState, useEffect } from 'react';
import { ScoutProvider, useScoutContext } from './context/ScoutContext';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { t } from './i18n';
import GeneralInfo from './components/GeneralInfo';
import InputPanel from './components/InputPanel';
import ScoutingTable from './components/ScoutingTable';
import SettingsModal from './components/SettingsModal';
import WorkspaceMenu from './components/WorkspaceMenu';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import MatchInfoModal from './components/MatchInfoModal';
import { Settings, WifiOff, RefreshCw, Download, Keyboard, Sun, Moon, Folder, Plus, Upload, Edit2 } from 'lucide-react';
import DiagnosticLogs from './components/DiagnosticLogs';
import { usePWAInstall } from './hooks/usePWAInstall';

import Sidebar from './components/Sidebar';
import VideoPlayer from './components/VideoPlayer';
import Dashboard from './components/Dashboard';

function Toast() {
  const { toastMessage } = useScoutContext();
  if (!toastMessage) return null;
  return (
    <div className="fixed bottom-4 right-4 z-[9999] bg-gray-800 dark:bg-gray-100 text-white dark:text-gray-900 px-4 py-2 rounded-lg shadow-lg font-medium text-sm transition-all">
      {toastMessage}
    </div>
  );
}

function PwaIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <>
      {isOffline && (
        <div className="fixed top-[72px] left-0 right-0 z-[1000] bg-amber-500 text-white text-xs font-bold py-1 px-4 flex items-center justify-center gap-2 shadow-md">
          <WifiOff size={14} />
          <span>Offline Mode: You can still log events locally, but YouTube playback may not work.</span>
        </div>
      )}
    </>
  );
}

function EmptyProjectState() {
  const { createNewProject, importProject } = useWorkspace();
  const { matchInfo, showToast, setSettings, settings } = useScoutContext();
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content);
        if (!imported.id || !imported.title || !Array.isArray(imported.events) || !imported.sportType) {
          showToast('Invalid Project JSON format');
          return;
        }
        const newId = `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
        importProject({
          ...imported,
          id: newId,
          title: `${imported.title} (Imported)`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        showToast(`Imported: ${imported.title}`);
      } catch (err) {
        showToast('Failed to parse JSON');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl max-w-md w-full border border-gray-100 dark:border-gray-700 text-center">
        <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-sky-500 shadow-inner">
          <Folder size={32} />
        </div>
        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2">ยังไม่มีโครงการ</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
          สร้างโครงการใหม่เพื่อเริ่มต้นเก็บสถิติการแข่งขัน หรือนำเข้าโครงการที่มีอยู่แล้ว
        </p>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => createNewProject(`Match ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, matchInfo.sportType)}
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Plus size={18} /> สร้างโครงการใหม่
          </button>
          
          <label className="w-full py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
            <Upload size={18} /> นำเข้าโครงการ
            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
          </label>
          
          <button 
            onClick={() => {
              // start without saving (create a draft)
              createNewProject(`Draft ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, matchInfo.sportType);
            }}
            className="w-full py-3 mt-4 text-sky-600 dark:text-sky-400 font-semibold hover:underline"
          >
            เริ่มแบบไม่บันทึก (Draft)
          </button>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { matchInfo, settings, setSettings, teams } = useScoutContext();
  const { activeProjectId } = useWorkspace();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);
  const [isMatchInfoOpen, setIsMatchInfoOpen] = useState(false);
  const { isInstallable, promptInstall } = usePWAInstall();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans selection:bg-sky-500 selection:text-white overflow-x-hidden">
      <PwaIndicator />
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 flex justify-between items-center gap-2 sticky top-0 z-[100]">
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-black text-lg sm:text-xl shadow-md shadow-sky-500/20">
            S
          </div>
          <div className="hidden min-[400px]:block mr-2">
            <h1 className="text-base sm:text-xl font-black tracking-wider bg-gradient-to-r from-sky-500 to-blue-600 dark:from-sky-400 dark:to-blue-400 bg-clip-text text-transparent leading-none uppercase">
              {t('app.title', settings.uiLanguage)}
            </h1>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-semibold tracking-wide uppercase mt-0.5">{matchInfo.sportType || 'Volleyball'} mode</p>
          </div>
        </div>

        {/* Clickable Match Status Badge Button in Top Bar */}
        {activeProjectId && (
          <button
            onClick={() => setIsMatchInfoOpen(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-sky-50 hover:bg-sky-100 dark:bg-sky-950/45 dark:hover:bg-sky-900/45 border border-sky-100/70 dark:border-sky-850 rounded-xl transition-all duration-150 group cursor-pointer shadow-sm hover:shadow active:scale-95 text-left max-w-[280px] sm:max-w-none overflow-hidden"
            title={settings.uiLanguage === 'th' ? 'คลิกเพื่อแก้ไขข้อมูลการแข่งขัน' : 'Click to edit match info'}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs font-bold truncate">
              <span className="text-sky-700 dark:text-sky-300 tracking-wide uppercase font-black truncate max-w-[50px] sm:max-w-[80px]">
                {teams[0]?.code || 'T1'}
              </span>
              <span className="text-gray-400 font-normal">vs</span>
              <span className="text-sky-700 dark:text-sky-300 tracking-wide uppercase font-black truncate max-w-[50px] sm:max-w-[80px]">
                {teams[1]?.code || 'T2'}
              </span>
              <div className="h-3 w-px bg-sky-200 dark:bg-sky-800 shrink-0" />
              <span className="text-gray-600 dark:text-gray-400 font-semibold text-[10px] sm:text-[11px] whitespace-nowrap">
                {settings.uiLanguage === 'th' 
                  ? `เซต ${matchInfo.setOrGame} • แต้ม ${matchInfo.currentPoint}` 
                  : `Set ${matchInfo.setOrGame} • PT ${matchInfo.currentPoint}`}
              </span>
            </div>
            <Edit2 size={11} className="text-sky-400 dark:text-sky-500 opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 hidden sm:block shrink-0" />
          </button>
        )}

        <div className="text-xs font-mono text-gray-400 flex items-center gap-1.5 sm:gap-2 shrink-0 justify-end ml-auto">
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button
              onClick={() => {
                setSettings(prev => ({
                  ...prev,
                  uiLanguage: prev.uiLanguage === 'en' ? 'th' : 'en'
                }));
              }}
              className="px-2 py-1.5 sm:py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-colors font-bold text-xs"
              title="Toggle Language"
            >
              {settings.uiLanguage === 'en' ? 'EN' : 'TH'}
            </button>
            <button
              onClick={() => setSettings(prev => ({ ...prev, darkMode: !prev.darkMode }))}
              className="p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
              title="Toggle Dark Mode"
            >
              {settings.darkMode ? <Moon size={16} className="sm:w-[18px] sm:h-[18px]" /> : <Sun size={16} className="sm:w-[18px] sm:h-[18px]" />}
            </button>
            {isInstallable && (
              <button
                onClick={promptInstall}
                className="flex items-center gap-1.5 px-2 py-1.5 sm:px-3 sm:py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors font-bold text-xs shadow-sm"
                title="Install App"
              >
                <Download size={14} />
                <span className="hidden sm:inline">ติดตั้ง</span>
              </button>
            )}
            <WorkspaceMenu />
            <button 
              onClick={() => setIsKeyboardShortcutsOpen(true)}
              className="p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
              title="Keyboard Shortcuts"
            >
              <Keyboard size={16} className="sm:w-[20px] sm:h-[20px]" />
            </button>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
              title="Settings"
            >
              <Settings size={16} className="sm:w-[20px] sm:h-[20px]" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {!activeProjectId ? (
        <EmptyProjectState />
      ) : (
        <main className="mx-auto max-w-[1800px] p-2 sm:p-4 lg:p-6 flex flex-col lg:flex-row gap-4 lg:gap-6">
          {/* Sidebar controls */}
          <Sidebar />

          {/* Main scouting workspace */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
            
            {/* Top/Left Workspace: Video Player */}
            <section className="lg:col-span-5 lg:sticky lg:top-[76px] lg:self-start flex flex-col gap-4 bg-gray-50 dark:bg-gray-900 pb-2">
              <React.Suspense fallback={<div className="w-full aspect-video bg-gray-800 animate-pulse rounded-lg flex items-center justify-center text-gray-400">Loading Player...</div>}>
                <VideoPlayer />
              </React.Suspense>
            </section>

            {/* Top/Right Workspace: Input Panel & Dashboard */}
            <section className="lg:col-span-7 flex flex-col gap-6">
              <InputPanel />
              <React.Suspense fallback={<div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl"></div>}>
                <Dashboard />
              </React.Suspense>
            </section>

            {/* Bottom Section: Table */}
            <section className="lg:col-span-12 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
              <ScoutingTable />
            </section>

          </div>
        </main>
      )}

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <KeyboardShortcutsModal isOpen={isKeyboardShortcutsOpen} onClose={() => setIsKeyboardShortcutsOpen(false)} />
      <MatchInfoModal isOpen={isMatchInfoOpen} onClose={() => setIsMatchInfoOpen(false)} />
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <ScoutProvider>
      <WorkspaceProvider>
        <DiagnosticLogs />
        <AppContent />
      </WorkspaceProvider>
    </ScoutProvider>
  );
}

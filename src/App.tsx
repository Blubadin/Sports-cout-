import { motion } from 'motion/react';
import React, { useState, useEffect } from 'react';
import { ScoutProvider, useScoutContext } from './context/ScoutContext';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { t } from './i18n';
import GeneralInfo from './components/GeneralInfo';
import InputPanel from './components/InputPanel';
import ScoutingTable from './components/ScoutingTable';
import WorkspaceMenu from './components/WorkspaceMenu';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import MatchInfoModal from './components/MatchInfoModal';
import { Settings, WifiOff, RefreshCw, Download, Keyboard, Sun, Moon, Contrast, Folder, Plus, Upload, Edit2, Gamepad2, BarChart3, Table2, Star } from 'lucide-react';
import DiagnosticLogs from './components/DiagnosticLogs';
import { usePWAInstall } from './hooks/usePWAInstall';

import VideoPlayer from './components/VideoPlayer';
import { MAX_IMPORT_FILE_BYTES, validateImportFileSize } from './utils/importSafety';
import { createPilotSampleProjects } from './utils/sampleProjects';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';

const Dashboard = React.lazy(() => import('./components/Dashboard'));
const BookmarksPanel = React.lazy(() => import('./components/BookmarksPanel'));
const SettingsModal = React.lazy(() => import('./components/SettingsModal'));

type AnalysisTab = 'input' | 'dashboard' | 'table' | 'bookmarks';
const ANALYSIS_TABS: AnalysisTab[] = ['input', 'dashboard', 'table', 'bookmarks'];

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

import { SPORT_TEMPLATES } from './sports';
import type { SportType } from './types';
import CustomSelect from './components/ui/CustomSelect';

function EmptyProjectState() {
  const { createNewProject, importProject } = useWorkspace();
  const { matchInfo, showToast, setSettings, settings } = useScoutContext();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedSport, setSelectedSport] = useState<SportType>(matchInfo.sportType || 'volleyball');

  const loadPilotSamples = () => {
    const sampleProjects = createPilotSampleProjects(`pilot-${Date.now()}`);
    const importedCount = sampleProjects.reduce((count, project) => count + (importProject(project) ? 1 : 0), 0);
    showToast(settings.uiLanguage === 'th'
      ? `เพิ่มโปรเจกต์ตัวอย่าง ${importedCount} กีฬาแล้ว เปิดได้จากเมนูโฟลเดอร์ด้านบน`
      : `Added ${importedCount} sport samples. Open one from the folder menu.`);
  };

  const sportOptions = Object.values(SPORT_TEMPLATES).map(t => ({
    value: t.id,
    label: t.name,
    subLabel: t.thaiName
  }));

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!validateImportFileSize(file.size)) {
      showToast(settings.uiLanguage === 'th'
        ? `ไฟล์ใหญ่เกินไป ต้องไม่เกิน ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB`
        : `Import file must be ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB or smaller`);
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const imported = JSON.parse(content);
        
        // Generate a clean imported name
        const originalTitle = imported.title || 'Imported Project';
        imported.title = `${originalTitle} (Imported)`;

        const success = importProject(imported);
        if (success) {
          showToast(`Imported: ${originalTitle}`);
        } else {
          showToast('Invalid Project JSON format or schema');
        }
      } catch (err) {
        showToast('Failed to parse JSON');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-2xl w-full border border-gray-100 dark:border-gray-700 text-center">
        <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-sky-500 shadow-inner">
          <Folder size={32} />
        </div>
        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2">ยังไม่มีโครงการ</h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          สร้างโครงการใหม่เพื่อเริ่มต้นเก็บสถิติการแข่งขัน หรือนำเข้าโครงการที่มีอยู่แล้ว
        </p>

        <div className="mb-6 text-left">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">
            {settings.uiLanguage === 'th' ? 'เลือกประเภทกีฬา' : 'Select Sport Type'}
          </label>
          <CustomSelect 
            value={selectedSport} 
            onChange={(v) => setSelectedSport(v as SportType)}
            options={sportOptions}
          />
        </div>
        
        <div className="flex flex-col gap-3">
          <button 
            onClick={() => createNewProject(`Match ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, selectedSport)}
            className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Plus size={18} /> สร้างโครงการใหม่
          </button>
          
          <label className="w-full py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
            <Upload size={18} /> นำเข้าโครงการ
            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
          </label>

          <button
            type="button"
            onClick={loadPilotSamples}
            className="w-full py-3 border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300 rounded-lg font-bold transition-colors"
          >
            {settings.uiLanguage === 'th' ? 'โหลดตัวอย่าง Pilot ครบ 4 กีฬา' : 'Load four-sport pilot samples'}
          </button>
          
          <button 
            onClick={() => {
              // start without saving (create a draft)
              createNewProject(`Draft ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, selectedSport);
            }}
            className="w-full py-3 mt-4 text-sky-600 dark:text-sky-400 font-semibold hover:underline"
          >
            เริ่มแบบไม่บันทึก (Draft)
          </button>
        </div>

        <ol className="mt-7 grid grid-cols-2 gap-3 border-t border-gray-200 pt-5 text-left dark:border-gray-700 sm:grid-cols-4">
          {[
            settings.uiLanguage === 'th' ? 'เลือกกีฬาและสร้างโปรเจกต์' : 'Choose a sport and project',
            settings.uiLanguage === 'th' ? 'เปิดวิดีโอการแข่งขัน' : 'Open the match video',
            settings.uiLanguage === 'th' ? 'บันทึกเหตุการณ์ด้วยปุ่มหรือ HUD' : 'Tag events with controls or HUD',
            settings.uiLanguage === 'th' ? 'ตรวจสถิติและส่งออกข้อมูล' : 'Review and export the analysis',
          ].map((step, index) => (
            <li key={step} className="flex gap-2 text-xs font-semibold leading-relaxed text-gray-600 dark:text-gray-300">
              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[11px] font-black text-white">{index + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
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
  const [activeTab, setActiveTab] = useState<AnalysisTab>('input');

  useEffect(() => {
    document.documentElement.lang = settings.uiLanguage;
  }, [settings.uiLanguage]);

  useEffect(() => {
    if (!activeProjectId || isSettingsOpen || isKeyboardShortcutsOpen || isMatchInfoOpen) return;

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !event.ctrlKey || event.altKey || event.metaKey) return;

      const activeElement = document.activeElement as HTMLElement | null;
      if (!activeElement?.closest('[role="tablist"]')) return;

      event.preventDefault();
      setActiveTab((current) => {
        const currentIndex = ANALYSIS_TABS.indexOf(current);
        const direction = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + direction + ANALYSIS_TABS.length) % ANALYSIS_TABS.length;
        const nextTab = ANALYSIS_TABS[nextIndex];
        requestAnimationFrame(() => document.getElementById(`analysis-tab-${nextTab}`)?.focus());
        return nextTab;
      });
    };

    window.addEventListener('keydown', handleTabKey);
    return () => window.removeEventListener('keydown', handleTabKey);
  }, [activeProjectId, isSettingsOpen, isKeyboardShortcutsOpen, isMatchInfoOpen]);

  const handleTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    const currentIndex = ANALYSIS_TABS.indexOf(activeTab);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? ANALYSIS_TABS.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + ANALYSIS_TABS.length) % ANALYSIS_TABS.length;
    const nextTab = ANALYSIS_TABS[nextIndex];
    setActiveTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`analysis-tab-${nextTab}`)?.focus());
  };

  return (
    <div className="coach-shell min-h-screen text-gray-900 dark:text-gray-100 font-sans selection:bg-sky-500 selection:text-white overflow-x-hidden">
      <PwaIndicator />
      {/* Header */}
      <header className="coach-header px-4 sm:px-6 py-3 flex justify-between items-center gap-2 sticky top-0 z-[100]">
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center shrink-0">
            <img src="/icons/SP_logo_black_white_transparent_512.png" alt="App Logo" className="w-full h-full object-contain drop-shadow-sm" />
          </div>
          <div className="hidden min-[400px]:block mr-2">
            <h1 className="coach-page-title font-black bg-gradient-to-r from-sky-500 to-sky-600 dark:from-sky-400 dark:to-sky-500 bg-clip-text text-transparent uppercase">
              {t('app.title', settings.uiLanguage)}
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-semibold tracking-wide uppercase mt-0.5">{matchInfo.sportType || 'Volleyball'} mode</p>
          </div>
        </div>

        {/* Clickable Match Status Badge Button in Top Bar */}
        {activeProjectId && (
          <button
            onClick={() => setIsMatchInfoOpen(true)}
            className="coach-status-chip flex items-center gap-2 px-3.5 py-1.5 rounded-xl transition-all duration-150 group cursor-pointer hover:shadow-md active:scale-95 text-left max-w-[280px] sm:max-w-none overflow-hidden"
            title={settings.uiLanguage === 'th' ? 'คลิกเพื่อแก้ไขข้อมูลการแข่งขัน' : 'Click to edit match info'}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2.5 text-xs font-bold truncate">
              <span className="text-sky-700 dark:text-sky-300 tracking-wide uppercase font-black truncate max-w-[50px] sm:max-w-[80px]">
                {teams[0]?.icon && <span className="mr-0.5">{teams[0].icon}</span>}{teams[0]?.code || 'T1'}
              </span>
              <span className="text-gray-400 font-normal">vs</span>
              <span className="text-sky-700 dark:text-sky-300 tracking-wide uppercase font-black truncate max-w-[50px] sm:max-w-[80px]">
                {teams[1]?.icon && <span className="mr-0.5">{teams[1].icon}</span>}{teams[1]?.code || 'T2'}
              </span>
              <div className="h-3 w-px bg-sky-200 dark:bg-sky-800 shrink-0" />
              <span className="hidden min-[380px]:inline text-gray-600 dark:text-gray-400 font-semibold text-xs whitespace-nowrap">
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
              onClick={() => setSettings(prev => {
                const currentTheme = prev.theme || (prev.darkMode ? 'dark' : 'light');
                const nextTheme = currentTheme === 'light' ? 'dark' : currentTheme === 'dark' ? 'monochrome' : 'light';
                return { ...prev, theme: nextTheme, darkMode: nextTheme === 'dark' || nextTheme === 'monochrome' };
              })}
              className="p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-colors relative overflow-hidden flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10"
              title="Toggle Theme"
            >
              <motion.div
                key={settings.theme || (settings.darkMode ? 'dark' : 'light')}
                initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.3, type: 'spring', stiffness: 200, damping: 15 }}
                className="absolute"
              >
                {(settings.theme || (settings.darkMode ? 'dark' : 'light')) === 'light' && <Sun size={16} className="sm:w-[18px] sm:h-[18px]" />}
                {(settings.theme || (settings.darkMode ? 'dark' : 'light')) === 'dark' && <Moon size={16} className="sm:w-[18px] sm:h-[18px]" />}
                {settings.theme === 'monochrome' && <Contrast size={16} className="sm:w-[18px] sm:h-[18px]" />}
              </motion.div>
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
              className="hidden sm:flex p-1.5 sm:p-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 transition-colors"
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
        <main className="mx-auto w-full max-w-[1800px] p-2 sm:p-4 lg:p-6 flex flex-col lg:flex-row gap-4 lg:gap-6 lg:h-[calc(100vh-76px)] lg:overflow-hidden">
          {/* Main scouting workspace */}
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 lg:h-full lg:overflow-hidden">
            
            {/* Top/Left Workspace: Video Player */}
            <section className="coach-panel lg:col-span-5 flex flex-col gap-4 p-2 sm:p-3 pb-2 lg:h-full lg:overflow-y-auto custom-scrollbar">
              <React.Suspense fallback={<div className="w-full aspect-video bg-gray-800 animate-pulse rounded-lg flex items-center justify-center text-gray-400">Loading Player...</div>}>
                <VideoPlayer />
              </React.Suspense>
            </section>

            {/* Top/Right Workspace: Tabs Interface */}
            <section className="lg:col-span-7 flex flex-col gap-4 lg:h-full lg:overflow-hidden">
              {/* Modern tabs navigation */}
              <div className="coach-panel-flat flex p-1 gap-1 shrink-0" role="tablist" aria-label={settings.uiLanguage === 'th' ? 'มุมมองการวิเคราะห์' : 'Analysis views'} onKeyDown={handleTablistKeyDown}>
                <button
                  id="analysis-tab-input"
                  role="tab"
                  aria-selected={activeTab === 'input'}
                  aria-controls="analysis-panel-input"
                  onClick={() => setActiveTab('input')}
                  onPointerDown={() => setActiveTab('input')}
                  className={`coach-tab flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-black transition-all cursor-pointer ${
                    activeTab === 'input'
                      ? 'coach-tab-active'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Gamepad2 size={18} />
                  <span>{settings.uiLanguage === 'th' ? 'แผงบันทึก (Scout)' : 'Scout Input'}</span>
                </button>
                <button
                  id="analysis-tab-dashboard"
                  role="tab"
                  aria-selected={activeTab === 'dashboard'}
                  aria-controls="analysis-panel-dashboard"
                  onClick={() => setActiveTab('dashboard')}
                  onPointerDown={() => setActiveTab('dashboard')}
                  className={`coach-tab flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-black transition-all cursor-pointer ${
                    activeTab === 'dashboard'
                      ? 'coach-tab-active'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <BarChart3 size={18} />
                  <span>{settings.uiLanguage === 'th' ? 'สถิติ / ชาร์ต' : 'Dashboard'}</span>
                </button>
                <button
                  id="analysis-tab-table"
                  role="tab"
                  aria-selected={activeTab === 'table'}
                  aria-controls="analysis-panel-table"
                  onClick={() => setActiveTab('table')}
                  onPointerDown={() => setActiveTab('table')}
                  className={`coach-tab flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-black transition-all cursor-pointer ${
                    activeTab === 'table'
                      ? 'coach-tab-active'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Table2 size={18} />
                  <span>{settings.uiLanguage === 'th' ? 'ตารางเหตุการณ์' : 'Events Table'}</span>
                </button>
                <button
                  id="analysis-tab-bookmarks"
                  role="tab"
                  aria-selected={activeTab === 'bookmarks'}
                  aria-controls="analysis-panel-bookmarks"
                  onClick={() => setActiveTab('bookmarks')}
                  onPointerDown={() => setActiveTab('bookmarks')}
                  className={`coach-tab flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-black transition-all cursor-pointer ${
                    activeTab === 'bookmarks'
                      ? 'coach-tab-active'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <Star size={18} />
                  <span>{t('keyMoments.title', settings.uiLanguage)}</span>
                </button>
              </div>

              {/* Dynamic scrollable views wrapper */}
              <div
                id={`analysis-panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`analysis-tab-${activeTab}`}
                className="flex-1 overflow-y-auto pr-1 pb-4 custom-scrollbar"
              >
                {activeTab === 'input' && (
                  <InputPanel />
                )}
                {activeTab === 'dashboard' && (
                  <React.Suspense fallback={<div className="h-64 bg-gray-100 dark:bg-gray-800 animate-pulse rounded-xl"></div>}>
                    <Dashboard />
                  </React.Suspense>
                )}
                {activeTab === 'table' && (
                  <section className="coach-panel p-4">
                    <ScoutingTable />
                  </section>
                )}
                {activeTab === 'bookmarks' && (
                  <section className="coach-panel p-4">
                    <BookmarksPanel />
                  </section>
                )}
              </div>
            </section>

          </div>
        </main>
      )}

      {isSettingsOpen && (
        <React.Suspense fallback={<div className="fixed inset-0 z-[1000] bg-black/50" />}>
          <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        </React.Suspense>
      )}
      <KeyboardShortcutsModal isOpen={isKeyboardShortcutsOpen} onClose={() => setIsKeyboardShortcutsOpen(false)} />
      <MatchInfoModal isOpen={isMatchInfoOpen} onClose={() => setIsMatchInfoOpen(false)} />
      <Toast />
      <PWAUpdatePrompt />
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

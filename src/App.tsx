import React, { useState, useEffect } from 'react';
import { ScoutProvider, useScoutContext } from './context/ScoutContext';
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { t } from './i18n';
import SettingsModal from './components/SettingsModal';
import { WifiOff, RefreshCw, Folder, Plus, Upload, Table2, Star } from 'lucide-react';
import DiagnosticLogs from './components/DiagnosticLogs';
import { importProjectJsonFile } from './utils/projectImport';
import { createPilotSampleProjects } from './utils/sampleProjects';
import PWAUpdatePrompt from './components/PWAUpdatePrompt';
import {
  getAnalysisTabForPreset,
  getPresetForAnalysisTab,
  isReviewTab,
  REVIEW_TABS,
  type WorkbenchPresetId,
  type WorkstationAnalysisTab,
} from './workstation/workstationModel';
import {
  WorkstationCommandBar,
  WorkstationStatusBar,
  WorkstationTopBar,
  WorkstationLeftRail,
  type WorkstationLeftTool,
} from './components/workstation/WorkstationChrome';
import WorkstationInspector from './components/workstation/WorkstationInspector';
import { REVIEW_DRILLDOWN_EVENT } from './utils/reviewDrilldown';
import { SPORT_TEMPLATES } from './sports';
import type { SportType } from './types';
import CustomSelect from './components/ui/CustomSelect';

const Dashboard = React.lazy(() => import('./components/Dashboard'));
const BookmarksPanel = React.lazy(() => import('./components/BookmarksPanel'));
const VideoPlayer = React.lazy(() => import('./components/VideoPlayer'));
const InputPanel = React.lazy(() => import('./components/InputPanel'));
const ScoutingTable = React.lazy(() => import('./components/ScoutingTable'));
const FullCoachReport = React.lazy(() => import('./components/report/FullCoachReport'));
const BadmintonTrackingLab = React.lazy(() => import('./components/labs/BadmintonTrackingLab'));
const KeyboardShortcutsModal = React.lazy(() => import('./components/KeyboardShortcutsModal'));
const MatchInfoModal = React.lazy(() => import('./components/MatchInfoModal'));
const EditEventModal = React.lazy(() => import('./components/EditEventModal'));

type AnalysisTab = WorkstationAnalysisTab;

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

function RepositoryLoadingState({ language }: { language: 'th' | 'en' | undefined }) {
  const message = language === 'th'
    ? 'กำลังเตรียมพื้นที่ทำงาน'
    : 'Preparing workspace';

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className="flex items-center gap-3 text-sm font-semibold text-gray-600 dark:text-gray-300"
      >
        <RefreshCw aria-hidden="true" size={18} className="animate-spin text-sky-500" />
        <span>{message}</span>
      </div>
    </div>
  );
}

function EmptyProjectState() {
  const { createNewProject, importProject, repositoryReady } = useWorkspace();
  const { matchInfo, showToast, settings } = useScoutContext();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [selectedSport, setSelectedSport] = useState<SportType>(matchInfo.sportType || 'volleyball');
  const isThai = settings.uiLanguage === 'th';

  const loadPilotSamples = async () => {
    const sampleProjects = createPilotSampleProjects(`pilot-${Date.now()}`);
    const importResults = await Promise.all(sampleProjects.map(project => importProject(project)));
    const importedCount = importResults.filter(Boolean).length;
    showToast(isThai
      ? `เพิ่มโปรเจกต์ตัวอย่าง ${importedCount} กีฬาแล้ว เปิดได้จากเมนูโฟลเดอร์ด้านบน`
      : `Added ${importedCount} sport samples. Open one from the folder menu.`);
  };

  const sportOptions = Object.values(SPORT_TEMPLATES).map(template => ({
    value: template.id,
    label: template.name,
    subLabel: template.thaiName
  }));

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    importProjectJsonFile({
      file,
      uiLanguage: settings.uiLanguage,
      importProject,
      showToast,
    });
    event.target.value = '';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-6">
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl max-w-2xl w-full border border-gray-100 dark:border-gray-700 text-center">
        <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/30 rounded-2xl flex items-center justify-center mx-auto mb-6 text-sky-500 shadow-inner">
          <Folder size={32} />
        </div>
        <h2 className="text-2xl font-black text-gray-800 dark:text-gray-100 mb-2">
          {isThai ? 'ยังไม่มีโครงการ' : 'No Project Yet'}
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
          {isThai
            ? 'สร้างโครงการใหม่เพื่อเริ่มต้นเก็บสถิติการแข่งขัน หรือนำเข้าโครงการที่มีอยู่แล้ว'
            : 'Create a new match project to start scouting statistics, or import an existing project.'}
        </p>

        <div className="mb-6 text-left">
          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">
            {isThai ? 'เลือกประเภทกีฬา' : 'Select Sport Type'}
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
            <Plus size={18} /> {isThai ? 'สร้างโครงการใหม่' : 'Create New Project'}
          </button>
          
          <label className="w-full py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 cursor-pointer">
            <Upload size={18} /> {isThai ? 'นำเข้าโครงการ' : 'Import Project'}
            <input type="file" accept=".json" className="hidden" ref={fileInputRef} onChange={handleImport} />
          </label>

          <button
            type="button"
            onClick={loadPilotSamples}
            disabled={!repositoryReady}
            className="w-full py-3 border border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300 rounded-lg font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isThai ? 'โหลดตัวอย่าง Pilot ครบ 4 กีฬา' : 'Load four-sport pilot samples'}
          </button>
          
          <button 
            type="button"
            onClick={() => {
              // start without saving (create a draft)
              createNewProject(`Draft ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, selectedSport);
            }}
            disabled={!repositoryReady}
            className="w-full py-3 mt-4 text-sky-600 dark:text-sky-400 font-semibold hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isThai ? 'เริ่มแบบไม่บันทึก (Draft)' : 'Start without saving (Draft)'}
          </button>
        </div>

        <ol className="mt-7 grid grid-cols-2 gap-3 border-t border-gray-200 pt-5 text-left dark:border-gray-700 sm:grid-cols-4">
          {[
            isThai ? 'เลือกกีฬาและสร้างโปรเจกต์' : 'Choose a sport and project',
            isThai ? 'เปิดวิดีโอการแข่งขัน' : 'Open the match video',
            isThai ? 'บันทึกเหตุการณ์ด้วยปุ่มหรือ HUD' : 'Tag events with controls or HUD',
            isThai ? 'ตรวจสถิติและส่งออกข้อมูล' : 'Review and export the analysis',
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
  const {
    matchInfo,
    settings,
    setSettings,
    teams,
    events,
    videoTime,
    setSeekRequest,
    showToast,
    canUndoEventAction,
    canRedoEventAction,
    undoEventAction,
    redoEventAction,
    editingEvent,
    setEditingEvent,
    editLastEvent,
    quickBookmarkCurrentMoment,
  } = useScoutContext();
  const { activeProjectId, projects, repositoryReady, saveStatus } = useWorkspace();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);
  const [isMatchInfoOpen, setIsMatchInfoOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AnalysisTab>('input');
  const [activeLeftTool, setActiveLeftTool] = useState<WorkstationLeftTool>('scout');
  const activeProject = projects.find((project) => project.id === activeProjectId);
  const activePreset = getPresetForAnalysisTab(activeTab);

  const handleWorkstationPreset = (preset: WorkbenchPresetId) => {
    setSettings(current => ({ ...current, workbenchPreset: preset }));
    setActiveTab(getAnalysisTabForPreset(preset));
  };

  useEffect(() => {
    const openFilteredReview = () => {
      setSettings(current => ({ ...current, workbenchPreset: 'review' }));
      setActiveTab('table');
    };
    window.addEventListener(REVIEW_DRILLDOWN_EVENT, openFilteredReview);
    return () => window.removeEventListener(REVIEW_DRILLDOWN_EVENT, openFilteredReview);
  }, [setSettings]);

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
        const availableTabs: readonly AnalysisTab[] = REVIEW_TABS;
        const currentIndex = availableTabs.indexOf(current);
        const direction = event.shiftKey ? -1 : 1;
        const nextIndex = (currentIndex + direction + availableTabs.length) % availableTabs.length;
        const nextTab = availableTabs[nextIndex];
        requestAnimationFrame(() => document.getElementById(`analysis-tab-${nextTab}`)?.focus());
        return nextTab;
      });
    };

    window.addEventListener('keydown', handleTabKey);
    return () => window.removeEventListener('keydown', handleTabKey);
  }, [activeProjectId, isKeyboardShortcutsOpen, isMatchInfoOpen, isSettingsOpen]);

  useEffect(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) {
        return;
      }
      if (isSettingsOpen || isKeyboardShortcutsOpen || isMatchInfoOpen || editingEvent) {
        return;
      }

      // Quick Bookmark: KeyB or KeyK
      if ((event.code === 'KeyB' || event.code === 'KeyK') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        quickBookmarkCurrentMoment(videoTime);
        return;
      }

      // Edit Last Event: Ctrl+E / Meta+E
      if (event.code === 'KeyE' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        editLastEvent();
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [editLastEvent, editingEvent, isKeyboardShortcutsOpen, isMatchInfoOpen, isSettingsOpen, quickBookmarkCurrentMoment, videoTime]);

  const handleTablistKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();

    const availableTabs: readonly AnalysisTab[] = REVIEW_TABS;
    const currentIndex = availableTabs.indexOf(activeTab);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? availableTabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + availableTabs.length) % availableTabs.length;
    const nextTab = availableTabs[nextIndex];
    setActiveTab(nextTab);
    requestAnimationFrame(() => document.getElementById(`analysis-tab-${nextTab}`)?.focus());
  };

  if (!repositoryReady) {
    return <RepositoryLoadingState language={settings.uiLanguage} />;
  }

  return (
    <div className="workstation-shell min-h-screen text-gray-900 dark:text-gray-100 font-sans selection:bg-sky-500 selection:text-white overflow-x-hidden flex flex-col">
      <PwaIndicator />
      <WorkstationTopBar
        language={settings.uiLanguage}
        activePreset={activePreset}
        onPresetChange={handleWorkstationPreset}
        teams={teams}
        matchInfo={matchInfo}
        saveStatus={saveStatus}
        onEditMatch={() => setIsMatchInfoOpen(true)}
      />
      <WorkstationCommandBar
            language={settings.uiLanguage}
            theme={settings.theme || (settings.darkMode ? 'dark' : 'light')}
            canUndo={canUndoEventAction}
            canRedo={canRedoEventAction}
            onUndo={undoEventAction}
            onRedo={redoEventAction}
            onNewEvent={() => {
              handleWorkstationPreset('scout');
              setActiveTab('input');
            }}
            onDeleteEvent={() => {
              showToast(settings.uiLanguage === 'th' ? 'เลือกเหตุการณ์บนตารางเพื่อลบ' : 'Select event to delete');
            }}
            onJumpToTime={() => {
              showToast(settings.uiLanguage === 'th' ? 'คลิกบนแถบเวลาเพื่อกระโดดไปยังจังหวะนั้น' : 'Click on timeline to seek');
            }}
            onToggleHUD={() => window.dispatchEvent(new CustomEvent('toggle-hud-mode'))}
            onOpenKeyMoments={() => {
              handleWorkstationPreset('review');
              setActiveTab('bookmarks');
            }}
            onOpenShortcuts={() => setIsKeyboardShortcutsOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onToggleTheme={() => setSettings(prev => {
              const currentTheme = prev.theme || (prev.darkMode ? 'dark' : 'light');
              const nextTheme = currentTheme === 'light' ? 'dark' : currentTheme === 'dark' ? 'monochrome' : 'light';
              return { ...prev, theme: nextTheme, darkMode: nextTheme === 'dark' || nextTheme === 'monochrome' };
            })}
            onToggleLanguage={() => setSettings(prev => ({
              ...prev,
              uiLanguage: prev.uiLanguage === 'en' ? 'th' : 'en'
            }))}
          />

      {/* Main Content with Left Rail */}
      {!activeProjectId ? (
        <EmptyProjectState />
      ) : (
        <div className="flex flex-col md:flex-row w-full flex-1 overflow-x-hidden lg:overflow-hidden">
          <WorkstationLeftRail
              activeTool={activeLeftTool}
              onSelectTool={(tool) => {
                setActiveLeftTool(tool);
                if (tool === 'scout' || tool === 'select') {
                  handleWorkstationPreset('scout');
                  setActiveTab('input');
                } else if (tool === 'annotate') {
                  showToast(settings.uiLanguage === 'th' ? 'โหมดวาด Telestration เปิดใช้งาน' : 'Telestration mode active');
                } else if (tool === 'court') {
                  showToast(settings.uiLanguage === 'th' ? 'เปิดโซนสนามและ Calibrate' : 'Court overlay & calibration');
                } else if (tool === 'clips') {
                  handleWorkstationPreset('review');
                  setActiveTab('bookmarks');
                } else if (tool === 'reports') {
                  handleWorkstationPreset('report');
                  setActiveTab('report');
                } else if (tool === 'playlist') {
                  handleWorkstationPreset('review');
                  setActiveTab('bookmarks');
                } else if (tool === 'track' || tool === 'zone' || tool === 'measure') {
                  handleWorkstationPreset('analysis');
                  setActiveTab('dashboard');
                } else if (tool === 'draw') {
                  showToast(settings.uiLanguage === 'th' ? 'โหมดวาด Telestration เปิดใช้งาน' : 'Telestration mode active');
                } else if (tool === 'camera') {
                  showToast(settings.uiLanguage === 'th' ? 'มุมกล้อง & ดิจิทัลซูม' : 'Camera Angle & Digital Zoom Active');
                } else if (tool === 'text') {
                  showToast(settings.uiLanguage === 'th' ? 'ใส่บันทึกแท็กติก' : 'Add Tactical Note');
                }
              }}
              onToggleFullscreen={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(() => {});
                } else {
                  document.exitFullscreen().catch(() => {});
                }
              }}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenHelp={() => setIsKeyboardShortcutsOpen(true)}
              language={settings.uiLanguage}
            />

          <main className="workstation-content-grid flex-1 min-w-0 mx-auto w-full max-w-[1920px] lg:h-[calc(100vh-124px)] lg:overflow-hidden">
            {/* Main scouting workspace */}
            <div className={`flex-1 grid grid-cols-1 lg:grid-cols-12 lg:h-full lg:overflow-hidden ${
              activeTab === 'report' || activeTab === 'labs' ? 'p-2 sm:p-4 bg-[#09141d]' : 'gap-px bg-[#263642] p-px'
            }`}>
              
              {/* Top/Left Workspace: Video Player */}
              <section className={`coach-panel ${activeTab === 'report' || activeTab === 'labs' ? 'hidden' : 'lg:col-span-7 xl:col-span-6'} flex flex-col gap-4 p-2 sm:p-3 pb-2 lg:h-full lg:overflow-y-auto custom-scrollbar`}>
                <React.Suspense fallback={<div className="w-full aspect-video bg-gray-800 animate-pulse rounded-lg flex items-center justify-center text-gray-400">Loading Player...</div>}>
                  <VideoPlayer
                    activeTool={activeLeftTool}
                    onSelectTool={setActiveLeftTool}
                    showHudToggle={false}
                  />
                </React.Suspense>
              </section>

              {/* Top/Right Workspace: Tabs Interface */}
              <section className={`${activeTab === 'report' || activeTab === 'labs' ? 'lg:col-span-12 w-full p-0 bg-transparent' : 'lg:col-span-5 xl:col-span-4 bg-[#0c1721] p-2'} flex flex-col gap-4 lg:h-full lg:overflow-hidden`}>
                {isReviewTab(activeTab) && (
                  <div className="coach-panel-flat flex p-1 gap-1 shrink-0" role="tablist" aria-label={settings.uiLanguage === 'th' ? 'มุมมองทบทวน' : 'Review views'} onKeyDown={handleTablistKeyDown}>
                    <button
                      id="analysis-tab-table"
                      role="tab"
                      aria-selected={activeTab === 'table'}
                      aria-controls="analysis-panel-table"
                      onClick={() => setActiveTab('table')}
                      className={`coach-tab flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-black transition-all cursor-pointer ${activeTab === 'table' ? 'coach-tab-active' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
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
                      className={`coach-tab flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-black transition-all cursor-pointer ${activeTab === 'bookmarks' ? 'coach-tab-active' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                      <Star size={18} />
                      <span>{t('keyMoments.title', settings.uiLanguage)}</span>
                    </button>
                  </div>
                )}
                {activeTab === 'input' && (
                  <div className="flex flex-col gap-4 lg:h-full lg:overflow-y-auto custom-scrollbar p-1">
                    <React.Suspense fallback={<div className="h-64 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />}>
                      <InputPanel showHudToggle={false} />
                    </React.Suspense>
                  </div>
                )}
                {activeTab === 'dashboard' && (
                  <div className="flex flex-col gap-4 lg:h-full lg:overflow-y-auto custom-scrollbar p-1">
                    <React.Suspense fallback={<div className="h-64 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />}>
                      <Dashboard variant="workstation" />
                    </React.Suspense>
                  </div>
                )}
                {activeTab === 'table' && (
                  <section className="coach-panel p-4 lg:h-full lg:overflow-y-auto custom-scrollbar">
                    <React.Suspense fallback={<div className="h-64 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />}>
                      <ScoutingTable />
                    </React.Suspense>
                  </section>
                )}
                {activeTab === 'bookmarks' && (
                  <section className="coach-panel p-4 lg:h-full lg:overflow-y-auto custom-scrollbar">
                    <React.Suspense fallback={<div className="h-64 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />}>
                      <BookmarksPanel />
                    </React.Suspense>
                  </section>
                )}
                {activeTab === 'report' && (
                  <div className="w-full flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                    <React.Suspense fallback={<div className="h-96 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />}>
                      <FullCoachReport onGoToVideoTime={setSeekRequest} />
                    </React.Suspense>
                  </div>
                )}
                {activeTab === 'labs' && (
                  <div id="analysis-panel-labs" role="tabpanel" aria-label="Labs" className="w-full flex-1 min-h-0 h-full overflow-hidden">
                    <React.Suspense fallback={<div className="h-96 animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl" />}>
                      <BadmintonTrackingLab />
                    </React.Suspense>
                  </div>
                )}
              </section>

              {activeTab !== 'report' && activeTab !== 'labs' && (
                <div className="hidden min-w-0 xl:col-span-2 xl:block">
                  <WorkstationInspector />
                </div>
              )}

            </div>
          </main>
        </div>
      )}

      {activeProjectId && (
        <WorkstationStatusBar
          language={settings.uiLanguage}
          projectTitle={activeProject?.title || 'Untitled'}
          sport={matchInfo.sportType}
          eventCount={events.length}
          videoTime={videoTime}
        />
      )}

      {isSettingsOpen && (
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      )}
      {isKeyboardShortcutsOpen && (
        <React.Suspense fallback={null}>
          <KeyboardShortcutsModal isOpen={isKeyboardShortcutsOpen} onClose={() => setIsKeyboardShortcutsOpen(false)} />
        </React.Suspense>
      )}
      {isMatchInfoOpen && (
        <React.Suspense fallback={null}>
          <MatchInfoModal isOpen={isMatchInfoOpen} onClose={() => setIsMatchInfoOpen(false)} />
        </React.Suspense>
      )}
      {editingEvent && (
        <React.Suspense fallback={null}>
          <EditEventModal
            isOpen={Boolean(editingEvent)}
            onClose={() => setEditingEvent(null)}
            event={editingEvent}
          />
        </React.Suspense>
      )}
      <Toast />
      <PWAUpdatePrompt />
    </div>
  );
}

export default function App() {
  return (
    <ConfirmProvider>
      <ScoutProvider>
        <WorkspaceProvider>
          <DiagnosticLogs />
          <AppContent />
        </WorkspaceProvider>
      </ScoutProvider>
    </ConfirmProvider>
  );
}

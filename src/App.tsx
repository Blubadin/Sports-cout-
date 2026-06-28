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
import { Settings, WifiOff, RefreshCw, Download, Keyboard, Sun, Moon } from 'lucide-react';
import DiagnosticLogs from './components/DiagnosticLogs';
import { usePWAInstall } from './hooks/usePWAInstall';

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

function AppContent() {
  const { matchInfo, settings, setSettings } = useScoutContext();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKeyboardShortcutsOpen, setIsKeyboardShortcutsOpen] = useState(false);
  const { isInstallable, promptInstall } = usePWAInstall();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-sans selection:bg-sky-500 selection:text-white overflow-x-hidden">
      <PwaIndicator />
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 flex justify-between items-center gap-2 sticky top-0 z-[100]">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-sky-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-black text-lg sm:text-xl shadow-md shadow-sky-500/20">
            S
          </div>
          <div className="hidden min-[400px]:block">
            <h1 className="text-base sm:text-xl font-black tracking-wider bg-gradient-to-r from-sky-500 to-blue-600 dark:from-sky-400 dark:to-blue-400 bg-clip-text text-transparent leading-none uppercase">
              {t('app.title', settings.uiLanguage)}
            </h1>
            <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-semibold tracking-wide uppercase mt-0.5">{matchInfo.sportType || 'Volleyball'} mode</p>
          </div>
        </div>
        <div className="text-xs font-mono text-gray-400 flex items-center gap-1.5 sm:gap-2 overflow-x-auto hide-scrollbar shrink-0 max-w-full justify-end">
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
      <main className="mx-auto max-w-[1800px] p-2 sm:p-4 lg:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6">
          
          {/* Top/Left Workspace: Video & Info */}
          <section className="lg:col-span-5 lg:sticky lg:top-[76px] lg:self-start flex flex-col gap-4 z-10 bg-gray-50 dark:bg-gray-900 pb-2">
            <React.Suspense fallback={<div className="w-full aspect-video bg-gray-800 animate-pulse rounded-lg flex items-center justify-center text-gray-400">Loading Player...</div>}>
              <VideoPlayer />
            </React.Suspense>
            <GeneralInfo compact={true} />
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

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <KeyboardShortcutsModal isOpen={isKeyboardShortcutsOpen} onClose={() => setIsKeyboardShortcutsOpen(false)} />
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

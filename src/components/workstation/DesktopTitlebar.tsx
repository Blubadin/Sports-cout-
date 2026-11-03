import React, { useState, useEffect } from 'react';
import { Minus, Square, X, Cpu, Zap } from 'lucide-react';
import {
  isDesktopApp,
  minimizeDesktopWindow,
  toggleMaximizeDesktopWindow,
  closeDesktopWindow,
} from '../../utils/desktopApp';

interface DesktopTitlebarProps {
  appName?: string;
  hardwareMode?: 'cuda' | 'cpu' | 'detecting';
  deviceName?: string;
}

export const DesktopTitlebar: React.FC<DesktopTitlebarProps> = ({
  appName = 'SportsScout Workstation Pro',
  hardwareMode: propHardwareMode,
  deviceName: propDeviceName,
}) => {
  const [inDesktop, setInDesktop] = useState(false);
  const [detectedHw, setDetectedHw] = useState<'cuda' | 'cpu'>('cpu');
  const [detectedDev, setDetectedDev] = useState<string>('');

  useEffect(() => {
    const isApp = isDesktopApp();
    setInDesktop(isApp);

    if (isApp) {
      let isMounted = true;
      const checkStatus = async () => {
        try {
          const res = await fetch('http://127.0.0.1:8000/api/status');
          if (res.ok) {
            const data = await res.json();
            if (isMounted) {
              const dev = String(data.device || '').toLowerCase();
              if (dev.includes('cuda')) {
                setDetectedHw('cuda');
                setDetectedDev(data.device || 'CUDA');
              } else {
                setDetectedHw('cpu');
                setDetectedDev('CPU');
              }
            }
          }
        } catch {
          // AI service might be booting or offline
        }
      };

      checkStatus();
      const interval = setInterval(checkStatus, 5000);
      return () => {
        isMounted = false;
        clearInterval(interval);
      };
    }
  }, []);

  if (!inDesktop) {
    return null;
  }

  const activeMode = propHardwareMode && propHardwareMode !== 'detecting' ? propHardwareMode : detectedHw;
  const activeDevice = propDeviceName || detectedDev;

  return (
    <div
      data-tauri-drag-region
      className="h-8 w-full bg-[#070c12] border-b border-slate-800/80 flex items-center justify-between select-none z-[99999] px-2 text-xs text-slate-300"
    >
      {/* App branding & Drag region */}
      <div data-tauri-drag-region className="flex items-center gap-2 flex-1 h-full cursor-default">
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse inline-block" />
        <span className="font-bold tracking-wider text-slate-100 text-[11px] uppercase">
          {appName}
        </span>

        {/* Hardware acceleration badge */}
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-slate-800/70 border border-slate-700/50 text-slate-300 ml-2">
          {activeMode === 'cuda' ? (
            <>
              <Zap size={10} className="text-amber-400" />
              <span className="text-amber-300 font-semibold">
                CUDA GPU {activeDevice ? `(${activeDevice})` : 'Active'}
              </span>
            </>
          ) : (
            <>
              <Cpu size={10} className="text-sky-400" />
              <span className="text-slate-300">
                CPU Mode {activeDevice ? `(${activeDevice})` : 'Active'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Windows window control buttons */}
      <div className="flex items-center h-full no-drag">
        <button
          type="button"
          onClick={minimizeDesktopWindow}
          title="Minimize Window"
          aria-label="Minimize"
          className="h-full px-3 hover:bg-slate-800/80 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center cursor-pointer"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={toggleMaximizeDesktopWindow}
          title="Maximize or Restore Window"
          aria-label="Maximize"
          className="h-full px-3 hover:bg-slate-800/80 text-slate-400 hover:text-slate-100 transition-colors flex items-center justify-center cursor-pointer"
        >
          <Square size={11} />
        </button>
        <button
          type="button"
          onClick={closeDesktopWindow}
          title="Close Workstation"
          aria-label="Close"
          className="h-full px-3.5 hover:bg-rose-600 text-slate-400 hover:text-white transition-colors flex items-center justify-center cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

export default DesktopTitlebar;

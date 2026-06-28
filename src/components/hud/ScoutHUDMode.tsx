import React, { useState, useEffect, useRef } from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { Maximize, Minimize, X, History, RotateCcw } from 'lucide-react';
import { useHUDDeviceLayout } from '../../hooks/useHUDDeviceLayout';

import HUDTopStatsBar from './HUDTopStatsBar';
import HUDActionStatus from './HUDActionStatus';
import HUDTeamSelector from './HUDTeamSelector';
import HUDSkillRadial from './HUDSkillRadial';
import HUDAreaSelector from './HUDAreaSelector';
import HUDResultSelector from './HUDResultSelector';
import HUDVideoControls from './HUDVideoControls';
import HUDSequenceHistoryDrawer from './HUDSequenceHistoryDrawer';

interface ScoutHUDModeProps {
  onClose: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
  isPortrait: boolean;
  videoControls: {
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seekBy: (delta: number) => void;
    seekTo: (time: number) => void;
    setSpeed: (rate: number) => void;
    getCurrentTime: () => number;
    getDuration: () => number;
    isPlaying: boolean;
    playbackRate: number;
    videoError: string | null;
    retryVideo: () => void;
  };
}

export default function ScoutHUDMode({ onClose, containerRef, isPortrait, videoControls }: ScoutHUDModeProps) {
  const { 
    settings,
    currentAction, setCurrentAction,
    currentActions, setCurrentActions,
    addAction, saveEvent, undoLastAction,
    events, clearCurrentEvent,
    updateActionField, teams, commitResult
  } = useScoutContext();

  const layout = useHUDDeviceLayout();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'none' | 'team' | 'skill' | 'area' | 'result'>('none');
  const [showUI, setShowUI] = useState(true);
  const [layoutMode, setLayoutMode] = useState<'auto' | 'portrait' | 'landscape'>('auto');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [skillMenuPhase, setSkillMenuPhase] = useState<'skill' | 'descriptor'>('skill');
  
  // Hovered states for keyboard marking
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null);
  const [hoveredArea, setHoveredArea] = useState<{code: string, courtSide?: 'teamA'|'teamB'|'neutral'} | null>(null);
  const [hoveredResult, setHoveredResult] = useState<string | null>(null);
  
  const uiTimeoutRef = useRef<number | null>(null);

  // Reset skill menu phase when skill menu is closed
  useEffect(() => {
    if (activeMenu !== 'skill') {
      setSkillMenuPhase('skill');
    }
  }, [activeMenu]);

  // Calculate layout mode
  const isEffectiveLandscape = layoutMode === 'landscape' 
    ? true 
    : (layoutMode === 'portrait' ? false : !isPortrait);

  // Handle Fullscreen & Orientation
  useEffect(() => {
    const handleFullscreenChange = async () => {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      
      if (isFs) {
        try {
          if (screen.orientation && 'lock' in screen.orientation) {
            await (screen.orientation as any).lock('landscape');
          }
        } catch (err) {
          console.warn('Could not lock orientation:', err);
        }
      } else {
        try {
          if (screen.orientation && 'unlock' in screen.orientation) {
            screen.orientation.unlock();
          }
        } catch (err) {
          console.warn('Could not unlock orientation:', err);
        }
      }
    };

    if (document.fullscreenElement) {
      handleFullscreenChange();
    } else {
      try {
        if (screen.orientation && 'lock' in screen.orientation) {
          (screen.orientation as any).lock('landscape').catch(() => {});
        }
      } catch (e) {}
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      try {
        if (screen.orientation && 'unlock' in screen.orientation) {
          screen.orientation.unlock();
        }
      } catch (e) {}
    };
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {
        // Fallback to pseudo fullscreen is already handled by parent styling or state
        setIsFullscreen(true);
      });
    } else {
      document.exitFullscreen?.().catch(() => {
        setIsFullscreen(false);
      });
    }
  };

  const handleToggleLayoutMode = () => {
    setLayoutMode(prev => {
      if (prev === 'auto') return 'landscape';
      if (prev === 'landscape') return 'portrait';
      return 'auto';
    });
  };

  // Auto Hide UI
  useEffect(() => {
    if (!settings.hudAutoHideControls) return;
    
    const resetTimer = () => {
      setShowUI(true);
      if (uiTimeoutRef.current !== null) window.clearTimeout(uiTimeoutRef.current);
      uiTimeoutRef.current = window.setTimeout(() => {
        if (activeMenu === 'none' && videoControls.isPlaying && !isHistoryOpen) {
          setShowUI(false);
        }
      }, 3000);
    };

    resetTimer();
    const el = containerRef.current;
    if (el) {
      el.addEventListener('mousemove', resetTimer);
      el.addEventListener('touchstart', resetTimer);
      return () => {
        el.removeEventListener('mousemove', resetTimer);
        el.removeEventListener('touchstart', resetTimer);
        if (uiTimeoutRef.current !== null) window.clearTimeout(uiTimeoutRef.current);
      };
    }
  }, [settings.hudAutoHideControls, activeMenu, videoControls.isPlaying, isHistoryOpen, containerRef]);

  // Pointer/Touch Drag Selection Tracking for Marking Menus (Mouse slide and Finger drag)
  useEffect(() => {
    if (activeMenu === 'none') return;

    const handleTrackingMove = (clientX: number, clientY: number) => {
      const element = document.elementFromPoint(clientX, clientY);
      if (!element) return;

      const hoveredSkill = element.getAttribute('data-scout-hover-skill') || element.closest('[data-scout-hover-skill]')?.getAttribute('data-scout-hover-skill');
      const descGroup = element.getAttribute('data-scout-hover-descriptor-group') || element.closest('[data-scout-hover-descriptor-group]')?.getAttribute('data-scout-hover-descriptor-group');
      const descOption = element.getAttribute('data-scout-hover-descriptor-option') || element.closest('[data-scout-hover-descriptor-option]')?.getAttribute('data-scout-hover-descriptor-option');
      const hoveredArea = element.getAttribute('data-scout-hover-area') || element.closest('[data-scout-hover-area]')?.getAttribute('data-scout-hover-area');
      const hoveredResult = element.getAttribute('data-scout-hover-result') || element.closest('[data-scout-hover-result]')?.getAttribute('data-scout-hover-result');

      if (hoveredSkill) {
        (window as any).__hoveredSkill = hoveredSkill;
      }
      if (descGroup && descOption) {
        (window as any).__hoveredDescriptor = { groupId: descGroup, optionCode: descOption };
      }
      if (hoveredArea) {
        (window as any).__hoveredArea = hoveredArea;
      }
      if (hoveredResult) {
        (window as any).__hoveredResult = hoveredResult;
        setHoveredResult(hoveredResult);
      }
    };

    const handlePointerMove = (e: PointerEvent) => {
      handleTrackingMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const touch = e.touches[0];
      handleTrackingMove(touch.clientX, touch.clientY);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('touchmove', handleTouchMove);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('touchmove', handleTouchMove);
    };
  }, [activeMenu]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const activeEl = document.activeElement;
      if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.tagName === 'SELECT') return;

      if (e.code === 'Escape') {
        e.preventDefault();
        if (isHistoryOpen) {
          setIsHistoryOpen(false);
        } else if (activeMenu !== 'none') {
          setActiveMenu('none');
        } else {
          onClose();
        }
        return;
      }

      // Toggle History Drawer with 'KeyH'
      if (e.code === 'KeyH') {
        e.preventDefault();
        setIsHistoryOpen(prev => !prev);
        return;
      }

      // HUD Modals
      if (e.code === 'KeyQ') setActiveMenu('skill');
      if (e.code === 'KeyW') setActiveMenu('area');
      if (e.code === 'KeyE') setActiveMenu('result');
      
      // Team Selection
      if (e.code === 'Digit1') {
        e.preventDefault();
        setActiveMenu('team');
        if (teams[0]) updateActionField('teamCode', teams[0].code);
      }
      if (e.code === 'Digit2') {
        e.preventDefault();
        setActiveMenu('team');
        if (teams[1]) updateActionField('teamCode', teams[1].code);
      }
      
      // Video Controls
      if (e.code === 'Space') {
        e.preventDefault();
        videoControls.togglePlay();
      }
      if (e.code === 'KeyA') {
        e.preventDefault();
        videoControls.seekBy(-3);
      }
      if (e.code === 'KeyD') {
        e.preventDefault();
        videoControls.seekBy(3);
      }
      if (e.code === 'KeyS') {
        e.preventDefault();
        videoControls.seekBy(-1);
      }
      if (e.code === 'KeyF') {
        e.preventDefault();
        videoControls.seekBy(1);
      }
      
      // Save / Undo
      if (e.code === 'Enter') {
        e.preventDefault();
        saveEvent();
      }
      if (e.code === 'Backspace' || (e.code === 'KeyZ' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        undoLastAction();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ' && activeMenu === 'skill') {
        setActiveMenu('none');
        const hSkill = (window as any).__hoveredSkill;
        const hDesc = (window as any).__hoveredDescriptor;
        if (hSkill) {
          updateActionField('skillCode', hSkill);
        }
        if (hDesc) {
          updateActionField('descriptors' as any, hDesc.optionCode, hDesc.groupId);
        }
        (window as any).__hoveredSkill = null;
        (window as any).__hoveredDescriptor = null;
      }
      if (e.code === 'KeyW' && activeMenu === 'area') {
        setActiveMenu('none');
        const hArea = (window as any).__hoveredArea;
        if (hArea) {
          updateActionField('areaCode', hArea);
        }
        (window as any).__hoveredArea = null;
      }
      if (e.code === 'KeyE' && activeMenu === 'result') {
        setActiveMenu('none');
        const hovered = (window as any).__hoveredResult;
        if (hovered) {
          commitResult(hovered, settings.fastMode);
        }
        (window as any).__hoveredResult = null;
      }
      if ((e.code === 'Digit1' || e.code === 'Digit2') && activeMenu === 'team') {
        setActiveMenu('none');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [activeMenu, isHistoryOpen, saveEvent, undoLastAction, onClose, videoControls, teams, updateActionField, commitResult, settings.fastMode]);

  const handlePointerInteraction = (menu: 'none' | 'team' | 'skill' | 'area' | 'result') => {
    setActiveMenu(activeMenu === menu ? 'none' : menu);
  };

  const handleCopyEvent = (event: any) => {
    const text = `[${event.videoTime ? parseFloat(event.videoTime).toFixed(2) : '0.00'}] ${event.teamCode || ''} ${event.skillCode || ''} ${event.areaCode || ''} ${event.resultText || ''}`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try { document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(textArea);
    }
  };

  const handleReplayClip = (videoTime: number) => {
    videoControls.seekTo(Math.max(0, videoTime - 3));
    videoControls.play();
  };

  const handleGoToTime = (videoTime: number) => {
    videoControls.seekTo(videoTime);
  };

  const handleSkillDone = () => {
    setActiveMenu('none');
  };

  return (
    <div 
      className={`absolute inset-0 z-50 transition-opacity duration-300 pointer-events-none flex flex-col ${showUI ? 'opacity-100' : 'opacity-0'} pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)]`}
    >
      {/* Top Warning for Portrait screen layout */}
      {isPortrait && layoutMode === 'auto' && (
        <div className="absolute top-[60px] left-1/2 -translate-x-1/2 bg-amber-500/90 text-white font-bold text-[9px] md:text-xs px-3 py-1 rounded-full pointer-events-none z-50 shadow-md backdrop-blur-sm flex items-center gap-1.5 animate-pulse">
          <span>แนะนำให้หมุนเครื่องเป็นแนวนอน (Rotate device for landscape)</span>
        </div>
      )}

      {/* Top Bar */}
      {settings.hudShowTopStats && (
        <div className="w-full pointer-events-auto p-2 sm:p-4 bg-gradient-to-b from-black/95 to-transparent">
          <HUDTopStatsBar 
            videoControls={videoControls} 
            onClose={onClose} 
            isFullscreen={isFullscreen} 
            toggleFullscreen={toggleFullscreen}
            layoutMode={layoutMode}
            onToggleLayoutMode={handleToggleLayoutMode}
            onOpenHistoryDrawer={() => setIsHistoryOpen(true)}
          />
        </div>
      )}

      {/* Main Grid Area */}
      <div className="flex-1 w-full flex flex-col pointer-events-none px-2 sm:px-4 md:px-8 pb-4 relative overflow-hidden justify-between">
        {/* Backdrop for closing active menus by tapping outside */}
        {activeMenu !== 'none' && (
          <div 
            className="absolute inset-0 z-10 bg-black/35 backdrop-blur-[2px] pointer-events-auto cursor-pointer animate-fade-in"
            onClick={() => setActiveMenu('none')}
          />
        )}
        
        {/* Center Action Status (Top) */}
        {settings.hudShowActionStatus && (
          <div className="w-full flex justify-center pt-2 pointer-events-none z-10">
            <HUDActionStatus />
          </div>
        )}

        {/* Middle / Bottom dynamic layout */}
        <div className={`flex-1 flex ${isEffectiveLandscape ? 'flex-row items-end justify-between' : 'flex-col items-center justify-end gap-4'} w-full pointer-events-none z-20 pb-4`}>
          
          {/* Left / Top Selector Area */}
          <div className="flex flex-col justify-end items-center sm:items-start pointer-events-auto">
            <HUDAreaSelector 
              isActive={activeMenu === 'area'} 
              onClick={() => handlePointerInteraction('area')}
              onClose={() => setActiveMenu('none')}
            />
          </div>

          {/* Right / Bottom Selector Area */}
          <div className={`flex flex-col justify-end ${isEffectiveLandscape ? 'items-end' : 'items-center'} gap-2 md:gap-4 pointer-events-auto`}>
            <div className="flex gap-2 md:gap-4 items-end">
              <HUDSkillRadial 
                isActive={activeMenu === 'skill'} 
                onClick={() => handlePointerInteraction('skill')}
                onDone={handleSkillDone}
                phase={skillMenuPhase}
                onPhaseChange={setSkillMenuPhase}
              />
            </div>
            
            <HUDTeamSelector 
              isActive={activeMenu === 'team'}
              onClick={() => handlePointerInteraction('team')}
            />
          </div>
        </div>

        {/* Right-Center for Result Rail */}
        <div className="absolute right-2 sm:right-4 md:right-8 top-1/2 -translate-y-1/2 pointer-events-auto z-40">
          <HUDResultSelector 
            isActive={activeMenu === 'result'}
            onClick={() => handlePointerInteraction('result')}
            hoveredResult={hoveredResult}
            onHover={setHoveredResult}
          />
        </div>

        {/* Video Error Overlay */}
        {videoControls.videoError && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm pointer-events-auto">
            <div className="bg-neutral-900 border border-neutral-700 p-6 rounded-xl max-w-sm text-center shadow-2xl flex flex-col items-center gap-4">
              <div className="text-amber-500 bg-amber-500/10 p-3 rounded-full">
                <RotateCcw size={24} />
              </div>
              <div>
                <h3 className="text-white font-bold text-lg mb-1">Video Error</h3>
                <p className="text-neutral-400 text-sm mb-4">{videoControls.videoError}</p>
                <div className="flex flex-col gap-2 w-full">
                  <button 
                    onClick={videoControls.retryVideo}
                    className="bg-amber-500 hover:bg-amber-600 text-white py-2 px-4 rounded-lg font-medium transition-colors w-full"
                  >
                    Try Reload
                  </button>
                  <button 
                    onClick={() => {
                      // Hack to clear error from parent state to continue scouting
                      videoControls.retryVideo();
                    }}
                    className="bg-neutral-800 hover:bg-neutral-700 text-white py-2 px-4 rounded-lg font-medium transition-colors w-full border border-neutral-700"
                  >
                    Continue Scouting Without Video
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video Controls */}
        {settings.hudShowVideoControls && (
          <div className="w-full mt-auto pt-2 pointer-events-auto bg-gradient-to-t from-black/95 via-black/60 to-transparent rounded-b-xl z-30">
            <HUDVideoControls isPortrait={isPortrait} videoControls={videoControls} />
          </div>
        )}
      </div>

      {/* Sequence History Drawer Component */}
      <HUDSequenceHistoryDrawer 
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        events={events}
        currentActions={currentActions}
        currentAction={currentAction}
        onUndo={undoLastAction}
        onClearCurrent={clearCurrentEvent}
        onSaveCurrent={saveEvent}
        onGoToTime={handleGoToTime}
        onReplayClip={handleReplayClip}
        onCopyEvent={handleCopyEvent}
      />
    </div>
  );
}

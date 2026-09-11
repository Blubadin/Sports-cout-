import React, { useEffect, useCallback, useRef } from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { classNames, formatPreciseTime } from '../utils';
import { Undo2, Save, Plus, Trash2, Settings2, ChevronDown, ChevronUp, ArrowRight, RotateCcw, MonitorPlay, Edit3, Bookmark } from 'lucide-react';
import { t } from '../i18n';

import CourtAreaSelector from './CourtAreaSelector';
import { useScreenMarkingMode } from '../hooks/useScreenMarkingMode';
import { Action } from '../types';
import {
  dispatchCoachCommand,
  resolveCoachInputContext,
  resolveKeyboardCoachCommand,
  type CoachCommand,
} from '../utils/coachCommands';
import { getVolleyballGradeOptions } from '../volleyball/volleyballSkillGrades';
import { getVolleyballSkillCapabilities } from '../volleyball/volleyballActionContext';

const sports = [
  { id: 'volleyball', name: 'Volleyball', thaiName: 'วอลเลย์บอล' },
  { id: 'football', name: 'Football', thaiName: 'ฟุตบอล' },
  { id: 'badminton', name: 'Badminton', thaiName: 'แบดมินตัน' },
  { id: 'basketball', name: 'Basketball', thaiName: 'บาสเกตบอล' }
];

export default function InputPanel() {
  const {
    teams, skills, areas, results,
    currentAction, setCurrentAction,
    currentActions, events,
    addAction, saveEvent, undoLastAction, clearCurrentEvent,
    settings, setSettings, isActionComplete, resetCurrentAction, getThaiMeaning, getExtendedActionText, sportTemplate, changeSportType,
    getMissingActionMessage, currentInputHistory, setCurrentInputHistory, showToast, updateActionField, commitResult, selectArea, selectFoul, clearFoul, redoEventAction,
    matchInfo, videoTime, volleyballPathStage, setVolleyballPathStage, skipVolleyballTarget, setVolleyballSystemContext,
    editLastEvent, undoLastSavedEvent, quickBookmarkCurrentMoment
  } = useScoutContext();

  const executeCoachCommand = useCallback((command: CoachCommand) => {
    return dispatchCoachCommand(command, {
      selectTeam: (teamIndex) => {
        const team = teams[teamIndex];
        if (team) updateActionField('teamCode', team.code);
      },
      selectSkill: (skillCode) => updateActionField('skillCode', skillCode),
      selectArea,
      selectResult: (resultCode) => commitResult(resultCode, settings.fastMode),
      selectFoul: (foulCode) => {
        const foul = sportTemplate.fouls?.find((item) => item.code === foulCode);
        if (foul) selectFoul(foul);
      },
      saveEvent,
      undoAction: () => {
        if (currentActions.length > 0 || Object.keys(currentAction).length > 0) {
          undoLastAction();
        } else {
          undoLastSavedEvent();
        }
      },
      redoAction: redoEventAction,
      clearCurrent: clearCurrentEvent,
      cancelContext: resetCurrentAction,
      quickBookmark: () => quickBookmarkCurrentMoment(videoTime),
      editLastEvent,
    });
  }, [
    clearCurrentEvent,
    commitResult,
    currentAction,
    currentActions.length,
    editLastEvent,
    quickBookmarkCurrentMoment,
    redoEventAction,
    resetCurrentAction,
    saveEvent,
    selectArea,
    selectFoul,
    settings.fastMode,
    sportTemplate.fouls,
    teams,
    undoLastAction,
    undoLastSavedEvent,
    updateActionField,
    videoTime,
  ]);

  const handleSelect = useCallback((category: keyof typeof currentAction, value: string) => {
    if (category === 'teamCode') {
      const teamIndex = teams.findIndex((team) => team.code === value);
      if (teamIndex === 0 || teamIndex === 1) executeCoachCommand({ type: 'selectTeam', teamIndex });
    } else if (category === 'skillCode') {
      executeCoachCommand({ type: 'selectSkill', skillCode: value });
    } else {
      updateActionField(category as keyof Action, value);
    }
  }, [executeCoachCommand, teams, updateActionField]);

  const handleSelectArea = useCallback((code: string, courtSide?: 'teamA' | 'teamB' | 'neutral') => {
    executeCoachCommand({ type: 'selectArea', area: { areaCode: code, courtSide } });
  }, [executeCoachCommand]);

  const handleResultSelect = useCallback((value: string) => {
    executeCoachCommand({ type: 'selectResult', resultCode: value });
  }, [executeCoachCommand]);

  const handleDescriptorSelect = useCallback((groupId: string, value: string) => {
    updateActionField('descriptors', value, groupId);
  }, [updateActionField]);

  const handleSelectTeam = useCallback((val: string) => handleSelect('teamCode', val), [handleSelect]);
  const handleSelectSkill = useCallback((val: string) => handleSelect('skillCode', val), [handleSelect]);

  const { isActive: isScreenMarkingActive } = useScreenMarkingMode({
    enabled: !!settings.enableScreenMarkingMode,
    activationKey: settings.screenMarkingKey || 'Alt',
    onSelectTeam: handleSelectTeam,
    onSelectSkill: handleSelectSkill,
    onSelectArea: handleSelectArea,
    onSelectResult: handleResultSelect,
    onSelectDescriptor: handleDescriptorSelect,
  });

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat) return;
    const activeEl = document.activeElement;
    if (
      activeEl?.tagName === 'INPUT' ||
      activeEl?.tagName === 'TEXTAREA' ||
      activeEl?.tagName === 'SELECT' ||
      (activeEl as HTMLElement)?.isContentEditable ||
      Boolean(document.querySelector('[role="dialog"]')) ||
      Boolean(document.querySelector('.modal'))
    ) {
      return;
    }

    if (isScreenMarkingActive || document.getElementById('scout-hud-container')) {
      return;
    }

    const command = resolveKeyboardCoachCommand(
      e,
      resolveCoachInputContext({
        blockingModal: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
      }),
    );
    if (command && executeCoachCommand(command)) {
      e.preventDefault();
      return;
    }

    const key = e.key.toLowerCase();
    
    const skillKeys = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
    const sIndex = skillKeys.indexOf(key);
    if (sIndex !== -1 && skills[sIndex]) handleSelect('skillCode', skills[sIndex].code);

    const foundArea = areas.find(a => a.shortcutKey?.toLowerCase() === key);
    if (foundArea) {
      let inferredSide: 'teamA' | 'teamB' | undefined = undefined;
      if (currentAction.teamCode === teams[0]?.code) inferredSide = 'teamA';
      else if (currentAction.teamCode === teams[1]?.code) inferredSide = 'teamB';
      handleSelectArea(foundArea.code, inferredSide);
    } else {
      const areaKeys = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
      const aIndex = areaKeys.indexOf(key);
      if (aIndex !== -1 && areas[aIndex] && !areas[aIndex].shortcutKey) {
        let inferredSide: 'teamA' | 'teamB' | undefined = undefined;
        if (currentAction.teamCode === teams[0]?.code) inferredSide = 'teamA';
        else if (currentAction.teamCode === teams[1]?.code) inferredSide = 'teamB';
        handleSelectArea(areas[aIndex].code, inferredSide);
      }
    }

    if (key === 'z') handleResultSelect('Yes');
    if (key === 'x') handleResultSelect('Out');
    if (key === 'c') handleResultSelect('Pass');

  }, [skills, areas, currentAction, executeCoachCommand, handleSelect, handleSelectArea, handleResultSelect, isScreenMarkingActive, teams]);

  const handleKeyDownRef = useRef(handleKeyDown);
  useEffect(() => {
    handleKeyDownRef.current = handleKeyDown;
  }, [handleKeyDown]);

  useEffect(() => {
    const listener = (e: KeyboardEvent) => handleKeyDownRef.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const renderRallyChain = () => {
    if (currentActions.length === 0) return null;
    return (
      <div className="bg-gray-950/40 p-2 rounded-xl border border-gray-800">
        <div className="text-xs text-gray-400 font-extrabold mb-1.5 flex justify-between uppercase tracking-wider">
          <span>{settings.uiLanguage === 'th' ? 'ลำดับการเล่น (Rally Chain):' : 'Rally Chain:'}</span>
        </div>
        <div className="flex flex-wrap gap-1.5 max-h-[70px] overflow-y-auto custom-scrollbar pr-1">
          {currentActions.map((a, i) => {
            const labelStr = settings.advancedDetailMode ? getExtendedActionText(a) : [a.teamCode, a.skillCode, a.areaCode || (a.resultCode === 'Out' ? 'OUT' : ''), a.resultCode, a.foulCode].filter(Boolean).join(' ');
            return (
              <div key={i} className="text-xs font-mono text-gray-300 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded-lg flex items-center gap-1 font-bold">
                <span className="text-sky-400 font-black">{i + 1}.</span>
                <span>{labelStr}</span>
                <span className="text-gray-500 font-normal">({getThaiMeaning(a)})</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCurrentAction = () => {
    if (Object.keys(currentAction).length === 0) {
      return <div className="text-gray-500 italic text-xs">{settings.uiLanguage === 'th' ? 'รอป้อนข้อมูล...' : 'Waiting for input...'}</div>;
    }
    
    const parts = [];
    if (currentAction.teamCode) parts.push({ label: currentAction.teamCode, type: 'team' });
    if (currentAction.skillCode) parts.push({ label: currentAction.skillCode, type: 'skill' });
    if (currentAction.areaCode) parts.push({ label: currentAction.areaCode, type: 'area' });
    if (currentAction.resultCode) parts.push({ label: currentAction.resultCode, type: 'result' });
    if (currentAction.foulCode) parts.push({ label: currentAction.foulCode, type: 'foul' });
    
    return (
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {parts.map((p, idx) => {
          let color = "bg-gray-700 text-gray-200";
          if (p.type === 'team') color = "bg-sky-600/30 text-sky-300 border border-sky-500/20";
          if (p.type === 'skill') color = "bg-gray-700/50 text-gray-300 border border-gray-600/30";
          if (p.type === 'area') color = "bg-amber-600/30 text-amber-300 border border-amber-500/20";
          if (p.type === 'result') color = p.label === 'Yes' ? "bg-green-600/30 text-green-300 border border-green-500/20" : "bg-red-600/30 text-red-300 border border-red-500/20";
          if (p.type === 'foul') color = "bg-orange-600/30 text-orange-400 border border-orange-500/30";
          
          return (
            <span key={idx} className={`px-2 py-0.5 rounded-lg text-xs font-black ${color}`}>
              {p.label}
            </span>
          );
        })}
        <span className="text-green-500 text-xs font-medium ml-1">
          ({getThaiMeaning(currentAction)})
        </span>
      </div>
    );
  };

  const isCurrentComplete = isActionComplete(currentAction);
  const canSave = currentActions.length > 0 || isCurrentComplete;

  // Descriptors logic
  const currentSkillGroups = currentAction.skillCode && sportTemplate.descriptors ? (sportTemplate.descriptors[currentAction.skillCode] || sportTemplate.descriptors["ALL"] || []) : [];
  const volleyballCapabilities = sportTemplate.id === 'volleyball'
    ? getVolleyballSkillCapabilities(currentAction.skillCode)
    : undefined;
  const showVolleyballPath = settings.advancedDetailMode && Boolean(volleyballCapabilities);
  const volleyballPayload = currentAction.domainPayload?.type === 'volleyball' ? currentAction.domainPayload : undefined;
  
  return (
    <>
      {isScreenMarkingActive && (
        <div className="fixed bottom-4 right-4 bg-sky-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg animate-pulse z-50 flex items-center gap-1.5 border border-sky-400">
          <div className="w-2 h-2 rounded-full bg-white"></div>
          {settings.uiLanguage === 'th' ? 'โหมดระบุตำแหน่งหน้าจอ (Alt ค้าง)' : 'Screen Marking Active (Hold Alt)'}
        </div>
      )}
      <div className="flex flex-col gap-4">
        {/* Action Builder Header */}
        <div className="bg-gray-900 text-white rounded-xl shadow-sm p-3.5 border-2 border-sky-500 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase text-sky-400 tracking-wider">
                {settings.uiLanguage === 'th' ? 'สถานะการบันทึก (Scouting Console)' : 'Scouting Console'}
              </span>
              {currentActions.length > 0 && (
                <span className="bg-sky-500/20 text-sky-300 text-xs font-black px-2 py-0.5 rounded-full border border-sky-500/30">
                  {currentActions.length} Actions
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400 font-bold hidden md:inline">
                {settings.uiLanguage === 'th' 
                  ? '(Enter=บันทึก, Esc=ล้าง, Bksp=ย้อนกลับ)' 
                  : '(Enter=Save, Esc=Clear, Bksp=Undo)'}
              </span>
              {settings.enableScoutHUDMode !== false && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent('toggle-hud-mode'))}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-xs font-bold transition-all active:scale-95 cursor-pointer"
                  title={settings.uiLanguage === 'th' ? 'เปิดโหมด HUD สเกาต์เต็มจอ' : 'Open Scout HUD Mode'}
                >
                  <MonitorPlay size={14} />
                  <span>HUD</span>
                </button>
              )}
            </div>
          </div>

          {/* Segmented Controls for Logging Mode */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end justify-end bg-black/25 p-2 rounded-xl border border-white/5">
            {/* Mode Segmented Control */}
            <div className="flex flex-col gap-1 w-full md:w-[320px]">
              <span className="text-xs font-bold text-sky-400/90 uppercase tracking-wider pl-0.5">
                {settings.uiLanguage === 'th' ? 'โหมดบันทึก' : 'Logging Mode'}
              </span>
              <div className="grid grid-cols-3 bg-black/40 p-0.5 rounded-lg border border-white/5">
                <button
                  onClick={() => setSettings(prev => ({ ...prev, fastMode: false, advancedDetailMode: false }))}
                  className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all duration-200 text-center cursor-pointer select-none ${
                    !settings.fastMode && !settings.advancedDetailMode
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {settings.uiLanguage === 'th' ? 'ปกติ' : 'Standard'}
                </button>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, fastMode: true, advancedDetailMode: false }))}
                  className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all duration-200 text-center cursor-pointer select-none ${
                    settings.fastMode
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {settings.uiLanguage === 'th' ? 'ด่วน' : 'Fast'}
                </button>
                <button
                  onClick={() => setSettings(prev => ({ ...prev, advancedDetailMode: true, fastMode: false }))}
                  className={`py-1.5 px-1 rounded-lg text-xs font-bold transition-all duration-200 text-center cursor-pointer select-none ${
                    settings.advancedDetailMode
                      ? 'bg-gray-600 text-white shadow-sm'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {settings.uiLanguage === 'th' ? 'ละเอียด' : 'Detail'}
                </button>
              </div>
            </div>
          </div>

          {renderRallyChain()}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2.5 bg-gray-850 rounded-lg border border-gray-800">
          <div className="flex items-center gap-2 flex-wrap min-h-[28px]">
            <span className="text-xs font-black text-gray-400">
              {settings.uiLanguage === 'th' ? 'ป้อน:' : 'Input:'}
            </span>
            <div className="font-mono text-sm font-black text-white flex gap-1 items-center flex-wrap">
              {renderCurrentAction()}
            </div>
          </div>
          
          <div className="shrink-0">
            {Object.keys(currentAction).length > 0 && !isCurrentComplete && (
              <span className="text-xs text-amber-500 font-black px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                {settings.uiLanguage === 'th' ? 'ยังขาดข้อมูล' : 'Incomplete'}
              </span>
            )}
            {isCurrentComplete && (
              <span className="text-xs text-green-500 font-black px-2 py-0.5 rounded-lg bg-green-500/10 border border-green-500/20 animate-pulse">
                {settings.uiLanguage === 'th' ? '✓ พร้อมเพิ่ม' : '✓ Ready'}
              </span>
            )}
            {Object.keys(currentAction).length === 0 && (
<span className="text-xs text-gray-500 font-bold">
                  {settings.uiLanguage === 'th' ? 'รอป้อน...' : 'Waiting...'}
                </span>
              )}
            </div>
          </div>
          
          {/* Main actions row */}
          <div className="flex gap-2">
            <button 
              onClick={() => addAction()}
              disabled={!isCurrentComplete}
              className={classNames(
                "flex-[3] flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-black border transition-all cursor-pointer active:scale-95",
                isCurrentComplete 
                  ? "bg-gray-800 hover:bg-gray-700 text-sky-400 border-sky-500/40 shadow-sm" 
                  : "bg-gray-850/40 text-gray-600 border-gray-850 cursor-not-allowed"
              )}
            >
              <Plus size={14} /> {settings.uiLanguage === 'th' ? 'เพิ่ม' : 'Add'}
            </button>
            <button 
              onClick={() => saveEvent()}
              disabled={!canSave}
              className={classNames(
                "flex-[4] flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-black shadow-sm transition-all cursor-pointer active:scale-95",
                canSave 
                  ? "bg-sky-600 hover:bg-sky-500 text-white" 
                  : "bg-gray-850 text-gray-600 cursor-not-allowed"
              )}
            >
              <Save size={14} /> {settings.uiLanguage === 'th' ? 'บันทึกเหตุการณ์' : 'Save Event'}
            </button>
            <button 
              onClick={undoLastAction}
              className="px-3 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-750 transition-all cursor-pointer active:scale-95"
              title="Undo Last Action"
            >
              <Undo2 size={14} />
            </button>
            <button 
              onClick={clearCurrentEvent}
              className="px-3 flex items-center justify-center bg-red-950/45 hover:bg-red-900 text-red-200 rounded-lg border border-red-900/40 transition-all cursor-pointer active:scale-95"
              title="Clear All"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Quick Correction & Bookmark Bar (PDF §96, §97) */}
          {events.length > 0 && (
            <div className="flex flex-wrap items-center justify-between pt-2 border-t border-white/10 gap-2 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-gray-400">
                  {settings.uiLanguage === 'th' ? `เหตุการณ์ล่าสุด #${events[events.length - 1].no}:` : `Last #${events[events.length - 1].no}:`}
                </span>
                <button
                  type="button"
                  onClick={undoLastSavedEvent}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-amber-300 rounded border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                  title="Undo Last Event (Ctrl+Z)"
                >
                  <Undo2 size={12} />
                  <span>{settings.uiLanguage === 'th' ? 'ยกเลิกแต้มนี้' : 'Undo Event'}</span>
                </button>
                <button
                  type="button"
                  onClick={editLastEvent}
                  className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-sky-300 rounded border border-sky-500/30 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                  title="Edit Last Event (Ctrl+E)"
                >
                  <Edit3 size={12} />
                  <span>{settings.uiLanguage === 'th' ? 'แก้ไขแต้มนี้' : 'Edit Event'}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => quickBookmarkCurrentMoment(videoTime)}
                className={classNames(
                  "px-2 py-1 rounded border text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-all cursor-pointer",
                  events[events.length - 1]?.isBookmarked
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/50"
                    : "bg-gray-800 hover:bg-gray-700 text-gray-300 border-gray-700"
                )}
                title="Quick Bookmark Key Moment (B / K)"
              >
                <Bookmark size={12} className={events[events.length - 1]?.isBookmarked ? "fill-amber-400 text-amber-400" : ""} />
                <span>{settings.uiLanguage === 'th' ? 'Key Moment (B)' : 'Bookmark (B)'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="flex-1 space-y-4 pb-4">
          {/* TEAM */}
          {sportTemplate.teamsEnabled && (
            <section className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
                <span>1. WHO · {t('input.team', settings.uiLanguage)}</span>
                {sportTemplate.playersEnabled && (
                  <span className="text-xs bg-gray-100 dark:bg-gray-900/50 text-gray-500 px-2 py-0.5 rounded-lg font-bold">
                    {settings.uiLanguage === 'th' ? 'ตัวเลือก: ผู้เล่น' : 'Optional: Player'}
                  </span>
                )}
              </h3>
              <div className="grid grid-cols-2 gap-2.5 mb-2">
                {teams.map((t, i) => (
                  <button
                    key={`${t.id || t.code}-${i}`}
                    onClick={() => handleSelect('teamCode', t.code)}
                    data-scout-selectable="true"
                    data-scout-group="team"
                    data-scout-value={t.code}
                    className={classNames(
                      "py-2 px-3 rounded-lg font-black text-base shadow-sm transition-transform active:scale-95 border-2 flex flex-col items-center justify-center leading-tight cursor-pointer",
                      currentAction.teamCode === t.code 
                        ? "bg-sky-600 text-white border-sky-600" 
                        : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:border-sky-400"
                    )}
                  >
                    <span className="tracking-widest text-lg">{t.code}</span>
                    <div className="text-xs font-bold opacity-85 mt-0.5">{t.thaiName || t.name} [{i+1}]</div>
                  </button>
                ))}
              </div>
              {sportTemplate.playersEnabled && currentAction.teamCode && (
                <div className="flex gap-2 bg-gray-50 dark:bg-gray-900/40 p-1.5 rounded-lg border border-gray-100 dark:border-gray-750">
                  <input
                    type="text"
                    placeholder={settings.uiLanguage === 'th' ? 'เบอร์ (e.g. 7)' : 'No. (e.g. 7)'}
                    value={currentAction.playerNumber || ''}
                    onChange={(e) => setCurrentAction(prev => ({ ...prev, playerNumber: e.target.value }))}
                    className="w-24 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-white"
                  />
                  <input
                    type="text"
                    placeholder={settings.uiLanguage === 'th' ? 'ชื่อผู้เล่น (ตัวเลือก)' : 'Player Name (Optional)'}
                    value={currentAction.playerName || ''}
                    onChange={(e) => setCurrentAction(prev => ({ ...prev, playerName: e.target.value }))}
                    className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-white"
                  />
                </div>
              )}
            </section>
          )}

          {/* SKILL */}
          <section className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 select-none">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                2. WHAT · {t('input.skill', settings.uiLanguage)}
              </h3>
              <button 
                onClick={() => {
                  const nextLayout = (!settings.skillInputLayout || settings.skillInputLayout === 'grid') ? 'compact' : 'grid';
                  setSettings(p => ({ ...p, skillInputLayout: nextLayout }));
                }}
                className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 ml-1 transition-colors font-black"
              >
                {settings.skillInputLayout === 'compact'
                  ? (settings.uiLanguage === 'th' ? 'ตารางปกติ' : 'Normal Grid') 
                  : (settings.uiLanguage === 'th' ? 'ตารางย่อ' : 'Compact')}
              </button>
            </div>
            
            <div className={classNames("grid gap-1.5", settings.skillInputLayout === 'compact' ? 'grid-cols-4 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4')}>
              {skills.map((s, i) => {
                const keys = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
                const isSelected = currentAction.skillCode === s.code;
                return (
                  <button
                    key={`${s.id || s.code}-${i}`}
                    onClick={() => handleSelect('skillCode', s.code)}
                    data-scout-selectable="true"
                    data-scout-group="skill"
                    data-scout-value={s.code}
                    className={classNames(
                      settings.skillInputLayout === 'compact' ? "py-1.5 px-1" : "py-2 px-1.5",
                      "rounded-lg font-black shadow-sm transition-transform active:scale-95 border-2 flex flex-col items-center justify-center gap-0.5 cursor-pointer",
                      isSelected 
                        ? "bg-sky-600 text-white border-sky-600" 
                        : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:border-sky-400"
                    )}
                  >
                    <span className={settings.skillInputLayout === 'compact' ? "text-xs font-black" : "text-sm font-black"}>{s.code}</span>
                    <span className="text-xs font-extrabold opacity-80 whitespace-nowrap overflow-hidden text-ellipsis max-w-full px-0.5">
                      {s.thaiName} {keys[i] ? `[${keys[i]}]` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* DESCRIPTORS (Advanced Detail Mode) */}
          {settings.advancedDetailMode && currentSkillGroups.length > 0 && (
            <section className="bg-sky-50 dark:bg-sky-950/10 p-3 rounded-xl border border-sky-100 dark:border-sky-900/20">
              <h3 className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <ChevronDown size={14} /> Detail Descriptors
              </h3>
              <div className="flex flex-col gap-3">
                {currentSkillGroups.map(group => (
                  <div key={group.id}>
                    <div className="text-xs font-bold text-gray-500 mb-1">{group.label}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.options.map(opt => {
                        const isSelected = currentAction.descriptors?.[group.id] === opt.code;
                        return (
                          <button
                            key={opt.code}
                            onClick={() => handleDescriptorSelect(group.id, opt.code)}
                            data-scout-selectable="true"
                            data-scout-group="descriptor"
                            data-scout-value={opt.code}
                            data-descriptor-group={group.id}
                            className={classNames(
                              "px-3 py-1 rounded-lg text-xs font-black transition-colors border cursor-pointer",
                              isSelected 
                                ? "bg-sky-600 text-white border-sky-600" 
                                : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-sky-400"
                            )}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* AREA */}
          <section className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 select-none relative">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              3. WHERE · {t('input.area', settings.uiLanguage)}
            </h3>
            {showVolleyballPath && (
              <div className="mb-3 border-y border-gray-200 py-2 dark:border-gray-700">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVolleyballPathStage('start')}
                    className={classNames(
                      'min-h-11 border px-3 text-left transition-colors',
                      volleyballPathStage === 'start'
                        ? 'border-sky-500 bg-sky-50 text-sky-800 dark:bg-sky-950/30 dark:text-sky-200'
                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300',
                    )}
                  >
                    <span className="block text-[10px] font-black uppercase tracking-wider">1 · {settings.uiLanguage === 'th' ? 'จุดเริ่ม' : 'Start'}</span>
                    <strong className="block truncate text-sm">{volleyballPayload?.startArea?.outZone || volleyballPayload?.startArea?.areaCode || currentAction.outZone || currentAction.areaCode || '—'}</strong>
                  </button>
                  <ArrowRight size={18} className="text-gray-400" aria-hidden="true" />
                  <button
                    type="button"
                    disabled={!volleyballCapabilities?.supportsTarget}
                    onClick={() => setVolleyballPathStage('target')}
                    className={classNames(
                      'min-h-11 border px-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                      volleyballPathStage === 'target'
                        ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-200'
                        : 'border-gray-200 bg-white text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300',
                    )}
                  >
                    <span className="block text-[10px] font-black uppercase tracking-wider">2 · {settings.uiLanguage === 'th' ? 'จุดเป้าหมาย' : 'Target'}</span>
                    <strong className="block truncate text-sm">{volleyballCapabilities?.supportsTarget ? (volleyballPayload?.targetArea?.outZone || volleyballPayload?.targetArea?.areaCode || '—') : 'N/A'}</strong>
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-gray-500 dark:text-gray-400" role="status">
                    {volleyballPathStage === 'start'
                      ? (settings.uiLanguage === 'th' ? 'เลือกจุดเริ่มบนสนาม' : 'Select the start area on court')
                      : volleyballPathStage === 'target'
                        ? (settings.uiLanguage === 'th' ? 'เลือกจุดเป้าหมาย หรือข้าม' : 'Select the target area or skip')
                        : (settings.uiLanguage === 'th' ? 'เส้นทางพร้อมแล้ว' : 'Path ready')}
                  </span>
                  <div className="flex gap-2">
                    {volleyballPathStage === 'target' && (
                      <button type="button" onClick={skipVolleyballTarget} className="border border-gray-300 px-2 py-1 font-bold text-gray-600 hover:border-amber-400 dark:border-gray-600 dark:text-gray-300">
                        {settings.uiLanguage === 'th' ? 'ข้ามเป้าหมาย' : 'Skip target'}
                      </button>
                    )}
                    {volleyballPathStage === 'complete' && (
                      <button type="button" onClick={() => setVolleyballPathStage('start')} className="inline-flex items-center gap-1 border border-gray-300 px-2 py-1 font-bold text-gray-600 hover:border-sky-400 dark:border-gray-600 dark:text-gray-300">
                        <RotateCcw size={12} /> {settings.uiLanguage === 'th' ? 'เลือกใหม่' : 'Restart'}
                      </button>
                    )}
                  </div>
                </div>
                {volleyballCapabilities?.supportsSystem && (
                  <div className="mt-2 grid grid-cols-2 gap-2 border-t border-gray-200 pt-2 dark:border-gray-700">
                    {(['in_system', 'out_of_system'] as const).map(context => (
                      <button
                        key={context}
                        type="button"
                        onClick={() => setVolleyballSystemContext(context)}
                        className={classNames(
                          'min-h-9 border px-2 text-xs font-bold transition-colors',
                          volleyballPayload?.systemContext === context
                            ? 'border-violet-500 bg-violet-600 text-white'
                            : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300',
                        )}
                      >
                        {context === 'in_system' ? 'In-System' : 'Out-of-System'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <CourtAreaSelector />
          </section>

          {/* RESULT */}
          <section className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 select-none relative">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              4. HOW · {t('input.result', settings.uiLanguage)}
            </h3>
            <div className="grid grid-cols-3 gap-2.5">
              {results.map((r, i) => {
                const keys = ['Z', 'X', 'C'];
                const isSelected = currentAction.resultCode === r.code;
                
                let bgClass = "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:bg-gray-100";
                let selectedClass = "";
                let hoverClass = "";

                if (r.code === 'Yes' || r.score === 1) {
                  selectedClass = "bg-green-500 text-white border-green-600";
                  hoverClass = "hover:border-green-500";
                } else if (r.code === 'Out' || r.score === -1) {
                  selectedClass = "bg-red-500 text-white border-red-600";
                  hoverClass = "hover:border-red-500";
                } else {
                  selectedClass = "bg-gray-500 text-white border-gray-600";
                  hoverClass = "hover:border-gray-500";
                }

                return (
                  <button
                    key={`${r.id || r.code}-${i}`}
                    onClick={() => handleResultSelect(r.code)}
                    data-scout-selectable="true"
                    data-scout-group="result"
                    data-scout-value={r.code}
                    className={classNames(
                      "py-2 sm:py-2.5 rounded-lg font-black shadow-sm transition-all cursor-pointer active:scale-95 border-2 flex flex-col items-center justify-center leading-tight",
                      isSelected ? selectedClass : `${bgClass} ${hoverClass}`
                    )}
                  >
                    <span className="text-base font-black">{r.code}</span>
                    <span className="text-xs font-extrabold mt-0.5 opacity-90 text-center px-1">
                      {r.thaiName} {keys[i] ? `[${keys[i]}]` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
            {settings.advancedDetailMode && sportTemplate.id === 'volleyball' && (
              <div className="mt-3 border-t border-gray-200 pt-3 dark:border-gray-700">
                {currentAction.skillCode ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {getVolleyballGradeOptions(currentAction.skillCode).map(option => (
                      <button
                        key={option.code}
                        type="button"
                        onClick={() => commitResult(option.resultCode, false, option.code)}
                        className={classNames(
                          'rounded-lg border px-2 py-2 text-xs font-bold transition-colors',
                          currentAction.resultDetailCode === option.code
                            ? 'border-sky-500 bg-sky-600 text-white'
                            : 'border-gray-200 bg-gray-50 text-gray-700 hover:border-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200',
                        )}
                      >
                        <span className="block text-sm">{option.code}</span>
                        <span className="block opacity-75">{settings.uiLanguage === 'th' ? option.thaiLabel : option.label} · {option.grade}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-xs font-semibold text-amber-600 dark:text-amber-400">{settings.uiLanguage === 'th' ? 'เลือกทักษะก่อนเลือกเกรดละเอียด' : 'Select a skill before choosing a detailed grade'}</p>
                )}
              </div>
            )}
          </section>
          <section className="border-y border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-900/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase tracking-wider text-gray-500">5. WHEN · {settings.uiLanguage === 'th' ? 'บริบทอัตโนมัติ' : 'Automatic context'}</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
                <span>{settings.uiLanguage === 'th' ? 'เซต' : 'Set'} {matchInfo.setOrGame || '—'}</span>
                <span>{settings.uiLanguage === 'th' ? 'แต้ม' : 'Point'} {matchInfo.currentPoint}</span>
                <code className="font-mono text-sky-700 dark:text-sky-300">{formatPreciseTime(videoTime)}</code>
              </div>
            </div>
          </section>
          {/* FOUL */}
          {sportTemplate.fouls && sportTemplate.fouls.length > 0 && (
            <section className="bg-white dark:bg-gray-800 p-3 rounded-xl shadow-sm border border-amber-200 dark:border-amber-900/30 select-none relative mt-3">
              <h3 className="text-xs font-bold text-amber-600 dark:text-amber-500 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>6. {settings.uiLanguage === 'th' ? 'ฟาวล์ / ผิดกติกา' : 'Foul / Violation'} (Optional)</span>
                {currentAction.foulCode && (
                  <button 
                    onClick={() => {
                      clearFoul();
                    }}
                    className="text-xs text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 px-2 py-0.5 rounded-full font-semibold transition-colors"
                  >
                    {settings.uiLanguage === 'th' ? 'ล้าง' : 'Clear'}
                  </button>
                )}
              </h3>
              <div className="flex flex-wrap gap-2">
                {sportTemplate.fouls.map((f, i) => {
                  const isSelected = currentAction.foulCode === f.code;
                  const isCard = f.severity === 'card' || f.severity === 'technical';
                  
                  let bgClass = "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:bg-gray-100";
                  let selectedClass = isCard ? "bg-red-500 text-white border-red-600" : "bg-amber-500 text-white border-amber-600";
                  let hoverClass = isCard ? "hover:border-red-500" : "hover:border-amber-500";

                  return (
                    <button
                      key={`foul-${f.code}`}
                      onClick={() => {
                        if (isSelected) {
                          clearFoul();
                        } else {
                          executeCoachCommand({ type: 'selectFoul', foulCode: f.code });
                        }
                      }}
                      className={classNames(
                        "py-1.5 px-3 rounded-lg font-bold shadow-sm transition-all cursor-pointer active:scale-95 border-2 text-sm flex items-center gap-1",
                        isSelected ? selectedClass : `${bgClass} ${hoverClass}`
                      )}
                    >
                      <span>{f.code}</span>
                      <span className="text-xs opacity-80">({settings.uiLanguage === 'th' && f.labelTh ? f.labelTh : f.label})</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

        </div>
      </div>
    </>
  );
}

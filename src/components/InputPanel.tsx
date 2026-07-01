import React, { useEffect, useCallback, useRef } from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { classNames } from '../utils';
import { Undo2, Save, Plus, Trash2, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { t } from '../i18n';

import CourtAreaSelector from './CourtAreaSelector';
import { useScreenMarkingMode } from '../hooks/useScreenMarkingMode';

export default function InputPanel() {
  const {
    teams, skills, areas, results,
    currentAction, setCurrentAction,
    currentActions,
    addAction, saveEvent, undoLastAction, clearCurrentEvent,
    settings, setSettings, isActionComplete, resetCurrentAction, getThaiMeaning, getExtendedActionText, sportTemplate, changeSportType,
    getMissingActionMessage, currentInputHistory, setCurrentInputHistory, showToast, updateActionField, commitResult
  } = useScoutContext();

  const handleSelect = useCallback((category: keyof typeof currentAction, value: string) => {
    updateActionField(category as any, value);
    (document.activeElement as HTMLElement)?.blur?.();
  }, [updateActionField]);

  const handleSelectArea = useCallback((code: string, courtSide?: 'teamA' | 'teamB' | 'neutral') => {
    const isSame = currentAction.areaCode === code && currentAction.courtSide === courtSide;
    
    // Manual push for courtSide
    setCurrentInputHistory(prev => [...prev, { type: 'field', category: 'areaCode', value: isSame ? undefined : code, previousValue: currentAction.areaCode, previousCourtSide: currentAction.courtSide, courtSide: isSame ? undefined : courtSide }]);
    
    setCurrentAction(prev => {
      const next = { ...prev };
      if (isSame) {
        delete next.areaCode;
        delete next.courtSide;
      } else {
        next.areaCode = code;
        if (courtSide) {
          next.courtSide = courtSide;
        } else {
          delete next.courtSide;
        }
      }
      return next;
    });
  }, [currentAction, setCurrentInputHistory, setCurrentAction]);

  const handleResultSelect = useCallback((value: string) => {
    commitResult(value, settings.fastMode);
  }, [commitResult, settings.fastMode]);

  const handleDescriptorSelect = useCallback((groupId: string, value: string) => {
    updateActionField('descriptors' as any, value, groupId);
    (document.activeElement as HTMLElement)?.blur?.();
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



  // Keyboard Shortcuts (Only reliable for top items, for full sport support, clicking is safer)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const activeEl = document.activeElement;
    if (activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA' || activeEl?.tagName === 'SELECT') {
      return;
    }

    if (isScreenMarkingActive || document.getElementById('scout-hud-container')) {
      return;
    }

    const key = e.key.toLowerCase();
    
    if (key === '1' && teams[0]) handleSelect('teamCode', teams[0].code);
    if (key === '2' && teams[1]) handleSelect('teamCode', teams[1].code);
    
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
      // Fallback to array order for sports that don't have shortcutKey yet
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

    if (e.key === 'Enter') {
      e.preventDefault();
      saveEvent();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      resetCurrentAction();
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        clearCurrentEvent();
      } else {
        undoLastAction();
      }
    }
  }, [teams, skills, areas, currentAction, saveEvent, undoLastAction, clearCurrentEvent, resetCurrentAction, handleSelect, handleSelectArea, handleResultSelect, isScreenMarkingActive]);

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
      <div className="mb-2">
        <div className="text-xs text-gray-500 mb-1 flex justify-between">
          <span>Rally Chain ({currentActions.length}):</span>
        </div>
        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar pr-2">
          {currentActions.map((a, i) => (
            <div key={`${a.id || ''}-${i}-${a.teamCode}`} className="text-sm font-mono text-gray-300 bg-gray-800/50 px-2 py-1.5 rounded flex flex-col">
              <span>{i + 1}. {settings.advancedDetailMode ? getExtendedActionText(a) : [a.teamCode, a.skillCode, a.areaCode || (a.resultCode==='Out'?'OUT':''), a.resultCode].filter(Boolean).join(' / ')}</span>
              <span className="text-[10px] text-gray-500 mt-0.5">{getThaiMeaning(a)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderCurrentAction = () => {
    let text = settings.advancedDetailMode ? getExtendedActionText(currentAction) : [currentAction.teamCode, currentAction.skillCode, currentAction.areaCode, currentAction.resultCode].filter(Boolean).join(' / ');
    if (!text) return <div className="text-gray-500 italic">รอการป้อนข้อมูล...</div>;
    return (
      <div className="flex flex-col">
        <span className="text-green-400">{text}</span>
        <span className="text-xs text-green-600/70 mt-1 block">{getThaiMeaning(currentAction)}</span>
      </div>
    );
  };

  const isCurrentComplete = isActionComplete(currentAction);
  const canSave = currentActions.length > 0 || isCurrentComplete;

  // Descriptors logic
  const currentSkillGroups = currentAction.skillCode && sportTemplate.descriptors ? (sportTemplate.descriptors[currentAction.skillCode] || sportTemplate.descriptors["ALL"] || []) : [];
  
  return (
    <>
      {isScreenMarkingActive && (
        <div className="fixed bottom-4 right-4 bg-sky-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-lg animate-pulse z-50 flex items-center gap-1.5 border border-sky-400">
          <div className="w-2 h-2 rounded-full bg-white"></div>
          {settings.uiLanguage === 'th' ? 'โหมดระบุตำแหน่งหน้าจอ (Alt ค้าง)' : 'Screen Marking Active (Hold Alt)'}
        </div>
      )}
      <div className="flex flex-col gap-4">
      {/* Action Builder Sticky Header */}
      <div className="sticky top-[72px] z-30 bg-gray-900 text-white rounded-xl shadow-lg p-4 border-2 border-sky-500">
        <div className="text-xs text-gray-400 mb-1 flex justify-between">
          <span>{settings.uiLanguage === 'th' ? 'สถานะ Action:' : 'Action Status:'}</span>
          <span className="hidden sm:inline">
            {settings.uiLanguage === 'th' 
              ? '(Enter=บันทึก, Esc=ล้าง, Bksp=ย้อนกลับ)' 
              : '(Enter=Save, Esc=Clear, Bksp=Undo)'}
          </span>
        </div>
        
        {renderRallyChain()}

        <div className="mb-3 p-2 bg-gray-800 rounded-lg border border-gray-700">
          <div className="text-xs text-sky-400 mb-1">
            {settings.uiLanguage === 'th' ? 'Action ปัจจุบัน:' : 'Current Action:'}
          </div>
          <div className="font-mono text-lg min-h-[3rem] break-words">
            {renderCurrentAction()}
          </div>
          {Object.keys(currentAction).length > 0 && !isCurrentComplete && (
            <div className="text-[10px] text-orange-400 mt-1">
              {settings.uiLanguage === 'th' 
                ? '*ยังขาดข้อมูล (ถ้า Out ไม่ต้องใส่ Area ก็ได้)' 
                : '*Missing info (For Out, Area is optional)'}
            </div>
          )}
          {isCurrentComplete && (
            <div className="text-[10px] text-green-400 mt-1 font-bold">
              {settings.uiLanguage === 'th' 
                ? '✓ พร้อมเพิ่ม/บันทึก' 
                : '✓ Ready to Add/Save'}
            </div>
          )}
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => addAction()}
            disabled={!isCurrentComplete}
            className={classNames(
              "flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-sm border transition-colors",
              isCurrentComplete ? "bg-gray-700 hover:bg-gray-600 text-white border-gray-600" : "bg-gray-800 text-gray-500 border-gray-700 cursor-not-allowed"
            )}
          >
            <Plus size={16} /> {settings.uiLanguage === 'th' ? 'เพิ่ม Action' : 'Add Action'}
          </button>
          <button 
            onClick={() => saveEvent()}
            disabled={!canSave}
            className={classNames(
              "flex-[2] flex items-center justify-center gap-1 py-2 rounded-lg font-semibold shadow-md transition-colors",
              canSave ? "bg-sky-600 hover:bg-sky-500 text-white" : "bg-gray-800 text-gray-500 cursor-not-allowed"
            )}
          >
            <Save size={18} /> {settings.uiLanguage === 'th' ? 'บันทึกเหตุการณ์' : 'Save Event'}
          </button>
          <button 
            onClick={undoLastAction}
            className="px-3 flex items-center justify-center bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700 transition-colors"
            title="Undo Last"
          >
            <Undo2 size={18} />
          </button>
          <button 
            onClick={clearCurrentEvent}
            className="px-3 flex items-center justify-center bg-red-900/50 hover:bg-red-800 text-red-200 rounded-lg border border-red-800 transition-colors"
            title="Clear All"
          >
            <Trash2 size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-6 pb-20">
        {/* TEAM */}
        {sportTemplate.teamsEnabled && (
          <section>
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>1. {t('input.team', settings.uiLanguage)}</span>
              {sportTemplate.playersEnabled && (
                <span className="text-[10px] bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded">
                  {settings.uiLanguage === 'th' ? 'ไม่บังคับ: ข้อมูลผู้เล่น' : 'Optional: Player Info'}
                </span>
              )}
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {teams.map((t, i) => (
                <button
                  key={`${t.id || t.code}-${i}`}
                  onClick={() => handleSelect('teamCode', t.code)}
                  data-scout-selectable="true"
                  data-scout-group="team"
                  data-scout-value={t.code}
                  className={classNames(
                    "py-4 rounded-xl font-bold text-lg shadow-sm transition-transform active:scale-95 border-2",
                    currentAction.teamCode === t.code 
                      ? "bg-blue-600 text-white border-blue-600" 
                      : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:border-blue-400"
                  )}
                >
                  {t.code}
                  <div className="text-xs font-normal opacity-70 mt-1">{t.thaiName || t.name} [{i+1}]</div>
                </button>
              ))}
            </div>
            {sportTemplate.playersEnabled && currentAction.teamCode && (
              <div className="flex gap-2 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg border border-gray-100 dark:border-gray-700">
                <input
                  type="text"
                  placeholder={settings.uiLanguage === 'th' ? 'เบอร์ (e.g. 7)' : 'No. (e.g. 7)'}
                  value={currentAction.playerNumber || ''}
                  onChange={(e) => setCurrentAction(prev => ({ ...prev, playerNumber: e.target.value }))}
                  className="w-24 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-white"
                />
                <input
                  type="text"
                  placeholder={settings.uiLanguage === 'th' ? 'ชื่อผู้เล่น (ตัวเลือก)' : 'Player Name (Optional)'}
                  value={currentAction.playerName || ''}
                  onChange={(e) => setCurrentAction(prev => ({ ...prev, playerName: e.target.value }))}
                  className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-500 dark:text-white"
                />
              </div>
            )}
          </section>
        )}

        {/* SKILL */}
        <section className="select-none relative z-10">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              2. {t('input.skill', settings.uiLanguage)}
            </h3>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => {
                  const nextLayout = (!settings.skillInputLayout || settings.skillInputLayout === 'grid') ? 'compact' : 'grid';
                  setSettings(p => ({ ...p, skillInputLayout: nextLayout }));
                }}
                className="text-[10px] px-2 py-0.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 ml-1 transition-colors"
              >
                {settings.skillInputLayout === 'compact'
                  ? (settings.uiLanguage === 'th' ? 'เปลี่ยนเป็นตารางปกติ' : 'Switch to Normal Grid') 
                  : (settings.uiLanguage === 'th' ? 'เปลี่ยนเป็นตารางย่อ' : 'Switch to Compact')}
              </button>
            </div>
          </div>
          
          <div className={classNames("grid gap-2", settings.skillInputLayout === 'compact' ? 'grid-cols-4 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4')}>
            {skills.map((s, i) => {
              const keys = ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'];
              return (
                <button
                  key={`${s.id || s.code}-${i}`}
                  onClick={() => handleSelect('skillCode', s.code)}
                  data-scout-selectable="true"
                  data-scout-group="skill"
                  data-scout-value={s.code}
                  className={classNames(
                    settings.skillInputLayout === 'compact' ? "py-1.5" : "py-3",
                    "rounded-lg font-bold shadow-sm transition-transform active:scale-95 border-2 flex flex-col items-center justify-center gap-1",
                    currentAction.skillCode === s.code 
                      ? "bg-purple-600 text-white border-purple-600" 
                      : "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700 hover:border-purple-400"
                  )}
                >
                  <span className={settings.skillInputLayout === 'compact' ? "text-sm" : "text-base"}>{s.code}</span>
                  <span className="text-[9px] font-normal opacity-70 whitespace-nowrap overflow-hidden text-ellipsis max-w-full px-1">
                    {s.thaiName} {keys[i]?`[${keys[i]}]`:''}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* DESCRIPTORS (Advanced Detail Mode) */}
        {settings.advancedDetailMode && currentSkillGroups.length > 0 && (
          <section className="bg-purple-50 dark:bg-purple-900/10 p-3 rounded-xl border border-purple-100 dark:border-purple-800/30">
            <h3 className="text-xs font-semibold text-purple-700 dark:text-purple-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <ChevronDown size={14} /> Detail Descriptors
            </h3>
            <div className="flex flex-col gap-3">
              {currentSkillGroups.map(group => (
                <div key={group.id}>
                  <div className="text-[10px] text-gray-500 mb-1">{group.label}</div>
                  <div className="flex flex-wrap gap-2">
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
                            "px-3 py-1.5 rounded-md text-xs font-medium transition-colors border",
                            isSelected 
                              ? "bg-purple-600 text-white border-purple-600" 
                              : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-purple-400"
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
        <section className="select-none relative">
          <CourtAreaSelector />
        </section>

        {/* RESULT */}
        <section className="select-none relative">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
            4. {t('input.result', settings.uiLanguage)}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {results.map((r, i) => {
              const keys = ['Z', 'X', 'C'];
              const isSelected = currentAction.resultCode === r.code;
              
              let bgClass = "bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border-gray-200 dark:border-gray-700";
              let selectedClass = "";
              let hoverClass = "";

              if (r.code === 'Yes' || r.score === 1) {
                selectedClass = "bg-green-500 text-white border-green-600";
                hoverClass = "hover:border-green-500";
              } else if (r.code === 'Out' || r.score === -1) {
                selectedClass = "bg-red-500 text-white border-red-600";
                hoverClass = "hover:border-red-500";
              } else {
                selectedClass = "bg-slate-500 text-white border-slate-600";
                hoverClass = "hover:border-slate-500";
              }

              return (
                <button
                  key={`${r.id || r.code}-${i}`}
                  onClick={() => handleResultSelect(r.code)}
                  data-scout-selectable="true"
                  data-scout-group="result"
                  data-scout-value={r.code}
                  className={classNames(
                    "py-4 rounded-xl font-bold shadow-sm transition-transform active:scale-95 border-2 flex flex-col items-center",
                    isSelected ? selectedClass : `${bgClass} ${hoverClass}`
                  )}
                >
                  <span className="text-lg">{r.code}</span>
                  <span className="text-[10px] font-normal mt-1 opacity-80 text-center px-1">{r.thaiName} {keys[i]?`[${keys[i]}]`:''}</span>
                </button>
              );
            })}
          </div>
        </section>

      </div>
    </div>
    </>
  );
}

import React, { useState, useEffect } from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { EventRow, Action } from '../types';
import { X, Plus, Trash2, Check, AlertCircle } from 'lucide-react';

interface EditEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: EventRow;
}

export default function EditEventModal({ isOpen, onClose, event }: EditEventModalProps) {
  const {
    teams,
    skills,
    results,
    areas,
    updateEventRow,
    getActionText,
    getExtendedActionText,
    getThaiMeaning,
    sportTemplate,
    settings,
    showToast,
    getMissingActionMessage,
  } = useScoutContext();

  const isThai = settings.uiLanguage === 'th';

  // State for editable fields
  const [point, setPoint] = useState<number>(event.point);
  const [note, setNote] = useState<string>(event.note || '');
  const [resultText, setResultText] = useState<'+1' | '-1' | '0'>(event.resultText);
  const [actions, setActions] = useState<Action[]>([]);
  
  // Tab/Selection for which action in the sequence to edit
  const [selectedActionIndex, setSelectedActionIndex] = useState<number>(0);

  // Manual override fields
  const [isManualOverride, setIsManualOverride] = useState<boolean>(false);
  const [manualEventText, setManualEventText] = useState<string>('');
  const [manualThaiMeaningText, setManualThaiMeaningText] = useState<string>('');

  // Synchronize state when the event changes
  useEffect(() => {
    if (event) {
      setPoint(event.point);
      setNote(event.note || '');
      setResultText(event.resultText);
      setActions(event.actions ? JSON.parse(JSON.stringify(event.actions)) : []);
      setSelectedActionIndex(0);
      setManualEventText(event.extendedEventText || event.eventText);
      setManualThaiMeaningText(event.thaiMeaningText || '');
      setIsManualOverride(false);
    }
  }, [event, isOpen]);

  if (!isOpen) return null;

  // Handle saving the modified event row
  const handleSave = () => {
    let finalEventText = '';
    let finalExtendedText = '';
    let finalThaiMeaning = '';

    if (isManualOverride) {
      finalEventText = manualEventText;
      finalExtendedText = manualEventText;
      finalThaiMeaning = manualThaiMeaningText;
    } else {
      if (actions.length === 0) {
        showToast(isThai ? 'ซีเควนซ์ต้องมีอย่างน้อย 1 Action' : 'Sequence must have at least 1 Action');
        return;
      }

      // Check if all actions are complete
      for (let i = 0; i < actions.length; i++) {
        const act = actions[i];
        const missingMessage = getMissingActionMessage(act);
        if (missingMessage) {
          showToast(isThai ? `Action ที่ ${i + 1}: ${missingMessage}` : `Action #${i + 1}: ${missingMessage}`);
          return;
        }
      }

      finalEventText = actions.map(a => getActionText(a)).join(' / ');
      finalExtendedText = actions.map(a => getExtendedActionText(a)).join(' / ');
      finalThaiMeaning = actions.map(a => getThaiMeaning(a)).join(' / ');
    }

    let finalActions = isManualOverride ? (event.actions && event.actions.length > 0 ? event.actions : []) : [...actions];
    
    // Sync last action resultCode with resultText if actions exist
    if (finalActions.length > 0) {
      const lastIdx = finalActions.length - 1;
      const lastAct = { ...finalActions[lastIdx] };
      if (resultText === '+1') {
        lastAct.resultCode = 'Yes';
        lastAct.outcomeStatus = 'success';
      } else if (resultText === '-1') {
        lastAct.resultCode = 'Out';
        lastAct.outcomeStatus = 'error';
      } else {
        lastAct.resultCode = 'Pass';
        lastAct.outcomeStatus = 'neutral';
      }
      finalActions[lastIdx] = lastAct;
    } else if (isManualOverride) {
      // Create synthetic action for manual override so sanitizeEvents preserves resultText
      finalActions = [{
        id: `act-override-${event.id}`,
        resultCode: resultText === '+1' ? 'Yes' : resultText === '-1' ? 'Out' : 'Pass',
        outcomeStatus: resultText === '+1' ? 'success' : resultText === '-1' ? 'error' : 'neutral',
      }];
    }

    const updatedRow: EventRow = {
      ...event,
      point,
      note,
      resultText,
      actions: finalActions,
      eventText: finalEventText,
      extendedEventText: finalExtendedText,
      thaiMeaningText: finalThaiMeaning,
    };

    updateEventRow(event.id, updatedRow);
    showToast(isThai ? `แก้ไขซีเควนซ์ที่ ${event.no} เรียบร้อยแล้ว` : `Sequence #${event.no} updated successfully`);
    onClose();
  };

  // Helper to update field in a specific action
  const updateActionFieldInList = (index: number, field: keyof Action, value: any, descriptorGroupId?: string) => {
    setActions(prev => {
      const next = [...prev];
      const target = { ...next[index] };

      if (descriptorGroupId) {
        const descriptors = target.descriptors ? { ...target.descriptors } : {};
        if (value === '' || value === undefined) {
          delete descriptors[descriptorGroupId];
        } else {
          descriptors[descriptorGroupId] = value;
        }
        target.descriptors = descriptors;
      } else {
        (target as Record<string, unknown>)[field] = value === '' ? undefined : value;
        
        // Reset descriptors if skill code changes
        if (field === 'skillCode') {
          target.descriptors = {};
          target.resultDetailCode = undefined;
        }
      }

      next[index] = target;
      return next;
    });
  };

  // Helper to add an action to the list
  const addActionToList = () => {
    const lastAction = actions[actions.length - 1];
    const newAction: Action = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      teamCode: lastAction ? lastAction.teamCode : (teams[0]?.code || ''),
      skillCode: '',
      resultCode: 'Pass',
      descriptors: {},
    };
    setActions(prev => [...prev, newAction]);
    setSelectedActionIndex(actions.length);
  };

  // Helper to remove an action from the list
  const removeActionFromList = (index: number) => {
    if (actions.length <= 1) {
      showToast(isThai ? 'ไม่สามารถลบ Action สุดท้ายได้' : 'Cannot delete the only action in the sequence');
      return;
    }
    setActions(prev => prev.filter((_, i) => i !== index));
    setSelectedActionIndex(prev => Math.max(0, prev - 1));
  };

  const currentEditingAction = actions[selectedActionIndex];
  const activeSkillDescriptors = currentEditingAction?.skillCode 
    ? sportTemplate.descriptors?.[currentEditingAction.skillCode] || [] 
    : [];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden transform scale-100 transition-all animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
          <div className="flex items-center gap-2">
            <span className="p-1.5 bg-sky-100 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 rounded-lg">
              <Check size={18} />
            </span>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              {isThai ? `แก้ไขข้อมูลเหตุการณ์ #${event.no}` : `Edit Event Sequence #${event.no}`}
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          
          {/* Top Section: Point, Result, Note */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50/50 dark:bg-gray-900/10 p-4 rounded-xl border border-gray-100 dark:border-gray-700/50">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                {isThai ? 'คะแนน (Point)' : 'Point (PT)'}
              </label>
              <input
                type="number"
                value={point}
                onChange={e => setPoint(parseInt(e.target.value) || 0)}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 font-semibold"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                {isThai ? 'ผลลัพธ์ (Result)' : 'Result Outcome'}
              </label>
              <div className="grid grid-cols-3 gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-0.5">
                {['+1', '0', '-1'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setResultText(val as '+1' | '-1' | '0')}
                    className={`py-1.5 text-xs font-bold rounded-md cursor-pointer transition-colors ${
                      resultText === val 
                        ? val === '+1' ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                          : val === '-1' ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400'
                          : 'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400'
                        : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    {val}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                {isThai ? 'บันทึกช่วยจำ (Note)' : 'Sequence Note'}
              </label>
              <input
                type="text"
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={isThai ? 'พิมพ์โน้ตส่วนตัว...' : 'Add custom note...'}
                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500 dark:focus:border-sky-500"
              />
            </div>
          </div>

          {/* Editor Mode Selection */}
          <div className="flex border-b border-gray-100 dark:border-gray-700/50">
            <button
              onClick={() => setIsManualOverride(false)}
              className={`pb-2 px-4 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                !isManualOverride 
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {isThai ? 'แก้ไขด้วยแบบฟอร์มเชิงโครงสร้าง' : 'Structured Editor'}
            </button>
            <button
              onClick={() => setIsManualOverride(true)}
              className={`pb-2 px-4 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                isManualOverride 
                  ? 'border-sky-500 text-sky-600 dark:text-sky-400' 
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white'
              }`}
            >
              {isThai ? 'แก้ไขข้อความแมนนวล' : 'Manual Override'}
            </button>
          </div>

          {!isManualOverride ? (
            <div className="space-y-4">
              {/* Actions Chain Timeline / Selection */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {isThai ? 'ลำดับการเล่นในซีเควนซ์ (Actions Sequence)' : 'Action Sequence Chain'}
                  </span>
                  <button
                    type="button"
                    onClick={addActionToList}
                    className="flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/20 border border-sky-100 dark:border-sky-900/50 px-2 py-1 rounded-lg font-semibold transition-all cursor-pointer"
                  >
                    <Plus size={12} />
                    <span>{isThai ? 'เพิ่ม Action' : 'Add Action'}</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 p-2 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                  {actions.map((act, idx) => {
                    const text = getActionText(act) || `Act #${idx + 1}`;
                    const isSelected = selectedActionIndex === idx;
                    return (
                      <div
                        key={act.id || idx}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold font-mono border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-500 text-white border-sky-500 shadow-sm'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`}
                        onClick={() => setSelectedActionIndex(idx)}
                      >
                        <span>{idx + 1}. {text}</span>
                        {actions.length > 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeActionFromList(idx);
                            }}
                            className={`p-0.5 rounded-full hover:bg-black/10 text-gray-400 hover:text-red-500 transition-colors ${
                              isSelected ? 'hover:text-white hover:bg-white/20 text-white/80' : ''
                            }`}
                            title={isThai ? 'ลบ Action นี้' : 'Remove Action'}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Form to Edit the Selected Action */}
              {currentEditingAction && (
                <div className="bg-sky-50/20 dark:bg-sky-950/10 p-4 rounded-xl border border-sky-100/50 dark:border-sky-950/30 space-y-4">
                  <div className="text-xs font-bold text-sky-600 dark:text-sky-400 border-b border-sky-100/30 dark:border-sky-950/20 pb-1.5 flex justify-between">
                    <span>{isThai ? `ปรับแต่ง Action ลำดับที่ ${selectedActionIndex + 1}` : `Configure Action #${selectedActionIndex + 1}`}</span>
                    <span className="font-mono">{getExtendedActionText(currentEditingAction) || 'Empty'}</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Team */}
                    {sportTemplate.teamsEnabled && (
                      <div>
                        <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1">
                          {isThai ? 'ทีม' : 'Team'}
                        </label>
                        <select
                          value={currentEditingAction.teamCode || ''}
                          onChange={e => updateActionFieldInList(selectedActionIndex, 'teamCode', e.target.value)}
                          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 font-medium"
                        >
                          <option value="">-- {isThai ? 'ไม่เลือก' : 'None'} --</option>
                          {teams.map(t => (
                            <option key={t.code} value={t.code}>{t.code} ({isThai ? t.thaiName : t.name})</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Player Number */}
                    {sportTemplate.playersEnabled && (
                      <div>
                        <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1">
                          {isThai ? 'เบอร์ผู้เล่น' : 'Player Num'}
                        </label>
                        <input
                          type="text"
                          value={currentEditingAction.playerNumber || ''}
                          onChange={e => updateActionFieldInList(selectedActionIndex, 'playerNumber', e.target.value)}
                          placeholder="e.g. 7"
                          className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 font-mono"
                        />
                      </div>
                    )}

                    {/* Skill */}
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1">
                        {isThai ? 'ทักษะ' : 'Skill'}{!currentEditingAction.foulCode && ' *'}
                      </label>
                      <select
                        value={currentEditingAction.skillCode || ''}
                        onChange={e => updateActionFieldInList(selectedActionIndex, 'skillCode', e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 font-medium"
                      >
                        <option value="">-- {isThai ? 'เลือกทักษะ' : 'Select Skill'} --</option>
                        {skills.map(s => (
                          <option key={s.code} value={s.code}>{s.code} - {isThai ? s.thaiName : s.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Result */}
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1">
                        {isThai ? 'ผลลัพธ์' : 'Result'}{!currentEditingAction.foulCode && ' *'}
                      </label>
                      <select
                        value={currentEditingAction.resultCode || ''}
                        onChange={e => updateActionFieldInList(selectedActionIndex, 'resultCode', e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 font-medium"
                      >
                        <option value="">-- {isThai ? 'เลือกผลลัพธ์' : 'Select Result'} --</option>
                        {results.map(r => (
                          <option key={r.code} value={r.code}>{r.code} ({isThai ? r.thaiName : r.code})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Court Area */}
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1">
                        {isThai ? 'พื้นที่สนาม (Court Area)' : 'Court Area Zone'}
                      </label>
                      <select
                        value={currentEditingAction.areaCode || ''}
                        onChange={e => updateActionFieldInList(selectedActionIndex, 'areaCode', e.target.value)}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 font-medium"
                      >
                        <option value="">-- {isThai ? 'ไม่ระบุ' : 'Not Specified'} --</option>
                        {areas.map(a => (
                          <option key={a.code} value={a.code}>{a.code} ({isThai ? a.thaiName : a.code})</option>
                        ))}
                      </select>
                    </div>

                    {/* Side */}
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1">
                        {isThai ? 'ฝั่งของสนาม' : 'Court Side'}
                      </label>
                      <select
                        value={currentEditingAction.courtSide || ''}
                        onChange={e => updateActionFieldInList(selectedActionIndex, 'courtSide', e.target.value as 'teamA'|'teamB'|'neutral')}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 font-medium"
                      >
                        <option value="">-- {isThai ? 'ไม่ระบุ' : 'Not Specified'} --</option>
                        <option value="teamA">{isThai ? 'ฝั่งเรา / ทีม A' : 'Our Side / Team A'}</option>
                        <option value="teamB">{isThai ? 'ฝั่งตรงข้าม / ทีม B' : 'Opponent Side / Team B'}</option>
                        <option value="neutral">{isThai ? 'เป็นกลาง' : 'Neutral'}</option>
                      </select>
                    </div>

                    {/* Foul / Violation */}
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 dark:text-gray-500 mb-1">
                        {isThai ? 'ฟาล์ว / ละเมิดกติกา' : 'Foul / Violation'}
                      </label>
                      <select
                        value={currentEditingAction.foulCode || ''}
                        onChange={e => {
                          const fCode = e.target.value;
                          const fDef = sportTemplate.fouls?.find((x: any) => x.code === fCode);
                          setActions(prev => {
                            const next = [...prev];
                            const target = { ...next[selectedActionIndex] };
                            target.foulCode = fCode || undefined;
                            target.foulRole = fDef ? fDef.role : undefined;
                            target.foulSeverity = fDef ? fDef.severity : undefined;
                            next[selectedActionIndex] = target;
                            return next;
                          });
                        }}
                        className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 font-medium"
                      >
                        <option value="">-- {isThai ? 'ไม่มีฟาล์ว' : 'No Foul'} --</option>
                        {sportTemplate.fouls?.map((f: any) => (
                          <option key={f.code} value={f.code}>
                            {f.code} - {isThai ? (f.labelTh || f.label) : f.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Descriptors */}
                  {activeSkillDescriptors.length > 0 && (
                    <div className="p-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg space-y-3">
                      <div className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                        {isThai ? 'รายละเอียดเพิ่มเติม (Skill Descriptors)' : 'Skill Descriptors'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activeSkillDescriptors.map(group => {
                          const value = currentEditingAction.descriptors?.[group.id] || '';
                          return (
                            <div key={group.id}>
                              <label className="block text-[10px] font-semibold text-gray-500 mb-1">
                                {isThai ? group.thaiLabel : group.label} {group.required && <span className="text-red-500">*</span>}
                              </label>
                              <select
                                value={value}
                                onChange={e => updateActionFieldInList(selectedActionIndex, 'descriptors', e.target.value, group.id)}
                                className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md px-2 py-1 text-xs focus:outline-none focus:border-sky-500 font-medium"
                              >
                                <option value="">-- {isThai ? 'เลือกรายละเอียด' : 'Select'} --</option>
                                {group.options.map(opt => (
                                  <option key={opt.code} value={opt.code}>{opt.code} - {isThai ? opt.thaiLabel : opt.label}</option>
                                ))}
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Dynamic Live Preview */}
              <div className="p-3.5 bg-sky-50/50 dark:bg-sky-950/20 border border-sky-100 dark:border-sky-900/50 rounded-xl space-y-2">
                <div className="text-[11px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider flex items-center gap-1">
                  <AlertCircle size={12} />
                  <span>{isThai ? 'พรีวิวผลลัพธ์โค้ดที่สร้างขึ้นอัตโนมัติ' : 'Auto-Generated Code Live Preview'}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <div className="font-mono text-xs sm:text-sm font-extrabold text-sky-700 dark:text-sky-300 select-all break-all">
                    {actions.map(a => getExtendedActionText(a)).join(' / ') || '--'}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 break-words">
                    {isThai ? 'ความหมายภาษาไทย: ' : 'Thai translation: '}
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {actions.map(a => getThaiMeaning(a)).join(' / ') || '--'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded-xl flex gap-2">
                <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 dark:text-amber-400">
                  {isThai 
                    ? 'โหมดแก้ไขแมนนวลจะข้ามแบบฟอร์มเชิงโครงสร้างทั้งหมด ช่วยให้คุณป้อนรหัสใดๆ ด้วยตนเองได้โดยตรง เหมาะสำหรับแก้ไขกรณีพิเศษ' 
                    : 'Manual override mode bypasses the structured form. It allows you to directly enter any raw text code for this event sequence.'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  {isThai ? 'รหัสชุดเหตุการณ์ (Event Text)' : 'Event Code Text'}
                </label>
                <input
                  type="text"
                  value={manualEventText}
                  onChange={e => setManualEventText(e.target.value)}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 font-mono font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                  {isThai ? 'คำแปลความหมายภาษาไทย (Thai Translation)' : 'Thai Meaning Translation Text'}
                </label>
                <textarea
                  value={manualThaiMeaningText}
                  onChange={e => setManualThaiMeaningText(e.target.value)}
                  rows={2}
                  className="w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-sky-500 dark:focus:border-sky-500 resize-none"
                />
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer transition-colors"
          >
            {isThai ? 'ยกเลิก' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-lg cursor-pointer transition-colors shadow-sm flex items-center gap-1.5"
          >
            <Check size={16} />
            <span>{isThai ? 'บันทึกการเปลี่ยนแปลง' : 'Save Changes'}</span>
          </button>
        </div>

      </div>
    </div>
  );
}

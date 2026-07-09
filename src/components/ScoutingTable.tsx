import React, { useState, useRef, useEffect } from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { EventRow } from '../types';
import { formatPreciseTime as formatTime } from '../utils';
import { Trash2, Copy, Download, FileJson, CopyCheck, Type, Play, Pencil, Undo2, Redo2 } from 'lucide-react';
import { t } from '../i18n';
import EditEventModal from './EditEventModal';
import { SPORT_TEMPLATES } from '../sports';

function ResultSelect({ value, onChange }: { value: string, onChange: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getStyle = (val: string) => {
    if (val === '+1') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
    if (val === '-1') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  };

  const options = ['+1', '0', '-1'];

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-1 rounded-lg text-xs font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500 ${getStyle(value)}`}
      >
        {value}
      </button>
      {isOpen && (
        <div className="absolute z-[100] mt-1 w-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm right-1/2 translate-x-1/2">
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => {
                onChange(opt);
                setIsOpen(false);
              }}
              className={`w-full text-center px-2 py-1.5 text-xs font-bold hover:bg-gray-100 dark:hover:bg-gray-700 ${getStyle(opt)} ${value === opt ? 'opacity-100' : 'bg-transparent text-gray-700 dark:text-gray-300'}`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ScoutingTable() {
  const { events, setEvents, saveEventsWithHistory, deleteEventRow, updateEventRow, setSeekRequest, setPreviewState, settings, showToast, canUndoEventAction, canRedoEventAction, undoEventAction, redoEventAction } = useScoutContext();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const replaySegment = (row: EventRow) => {
    setPreviewState({ isActive: true, eventRow: row, loop: true });
  };
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  const handleNoteChange = (id: string, field: keyof EventRow, value: string | number) => {
    const row = events.find(e => e.id === id);
    if (row) {
      updateEventRow(id, { ...row, [field]: value });
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand('copy');
        } catch (err) {
          console.error('Fallback: Oops, unable to copy', err);
        }
        document.body.removeChild(textArea);
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  const duplicateRow = (row: EventRow) => {
    saveEventsWithHistory(prev => {
      const newRow = {
        ...row,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        no: prev.length + 1,
        createdAt: new Date().toISOString(),
      };
      
      return [...prev, newRow].map((e, index) => ({
        ...e,
        no: index + 1,
      }));
    });
  };

  const replayClip = (time: number | undefined) => {
    if (time !== undefined) {
      // Replay from 3 seconds before the logged time
      setSeekRequest(Math.max(0, time - 3));
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex justify-between items-center">
        <h2 className="font-semibold text-gray-700 dark:text-gray-300">
          {settings.uiLanguage === 'th' ? 'ตารางบันทึกข้อมูล (Scouting Table)' : 'Scouting Table'}
        </h2>
        <div className="flex gap-2 items-center">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
            <button 
              onClick={undoEventAction} 
              disabled={!canUndoEventAction}
              className={`p-1.5 rounded-md transition-colors ${canUndoEventAction ? 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 cursor-pointer shadow-sm' : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}`}
              title="Undo Event Action"
            >
              <Undo2 size={14} />
            </button>
            <button 
              onClick={redoEventAction} 
              disabled={!canRedoEventAction}
              className={`p-1.5 rounded-md transition-colors ${canRedoEventAction ? 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 cursor-pointer shadow-sm' : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}`}
              title="Redo Event Action"
            >
              <Redo2 size={14} />
            </button>
          </div>
          <ExportButtons events={events} />
          {events.length > 0 && (
            <button 
              onClick={() => setShowDeleteAllModal(true)}
              className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/30 px-2.5 py-1 rounded-lg hover:bg-red-500 hover:text-white dark:hover:bg-red-900 transition-all cursor-pointer font-bold shadow-sm"
              title={settings.uiLanguage === 'th' ? 'ลบซีเควนซ์ทั้งหมดในตาราง' : 'Delete All Sequences'}
            >
              <Trash2 size={11} />
              <span>{settings.uiLanguage === 'th' ? 'ลบทั้งหมด' : 'Delete All'}</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Desktop Table */}
        <div className="hidden lg:block">
          <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400 sticky top-0 z-10 shadow-sm">
              <tr>
                <th className="px-4 py-3 w-12 text-center">{t('table.no', settings.uiLanguage)}</th>
                <th className="px-4 py-3 w-16 text-center">PT</th>
                <th className="px-4 py-3">{t('table.event', settings.uiLanguage)}</th>
                <th className="px-4 py-3 w-20 text-center">{t('input.result', settings.uiLanguage)}</th>
                <th className="px-4 py-3 w-32 text-center">{t('table.video', settings.uiLanguage)}</th>
                <th className="px-4 py-3">{t('table.note', settings.uiLanguage)}</th>
                <th className="px-4 py-3 w-32 text-center">{t('table.actions', settings.uiLanguage)}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((row, index) => (
                <tr key={`${row.id}-${index}`} className="bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
                  <td className="px-4 py-2 text-center font-medium text-gray-900 dark:text-white">
                    {row.no}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <input
                      type="number"
                      value={row.point}
                      onChange={(e) => handleNoteChange(row.id, 'point', parseInt(e.target.value) || 0)}
                      className="w-12 bg-transparent text-center border-b border-transparent focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none"
                    />
                  </td>
                  <td 
                    className="px-4 py-2 hover:bg-sky-50/40 dark:hover:bg-sky-950/20 cursor-pointer rounded-lg transition-colors group/cell"
                    onClick={() => setEditingEvent(row)}
                    title={settings.uiLanguage === 'th' ? 'คลิกเพื่อแก้ไขชุดเหตุการณ์นี้' : 'Click to edit this event sequence'}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex-1 font-mono text-xs text-sky-600 dark:text-sky-400 font-semibold tracking-tight py-1">
                        {row.extendedEventText || row.eventText}
                      </div>
                      <Pencil size={11} className="opacity-0 group-hover/cell:opacity-60 text-sky-500 transition-opacity shrink-0" />
                    </div>
                    {row.thaiMeaningText && (
                      <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs xl:max-w-md">{row.thaiMeaningText}</div>
                    )}
                    {(() => {
                      const rowFouls = row.actions?.filter(a => !!a.foulCode) || [];
                      if (rowFouls.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {rowFouls.map((foulAction, fIdx) => {
                            const template = SPORT_TEMPLATES[row.sportType];
                            const fDef = template?.fouls?.find(x => x.code === foulAction.foulCode);
                            const fLabel = fDef ? (settings.uiLanguage === 'th' ? (fDef.labelTh || fDef.label) : fDef.label) : foulAction.foulCode;
                            const severityColor = foulAction.foulSeverity === 'card' 
                              ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/30' 
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30';
                            
                            return (
                              <span 
                                key={fIdx} 
                                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${severityColor}`}
                                title={`Foul: ${foulAction.foulCode} (${fLabel}) - Role: ${foulAction.foulRole || 'violation'}`}
                              >
                                ⚠️ {foulAction.foulCode}: {fLabel}
                              </span>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2 text-center relative overflow-visible">
                    <ResultSelect 
                      value={row.resultText} 
                      onChange={(val) => handleNoteChange(row.id, 'resultText', val)} 
                    />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex flex-col items-center justify-center gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono">
                          {row.sequenceStartTime !== undefined && row.sequenceEndTime !== undefined && row.duration !== undefined
                            ? `${formatTime(row.sequenceStartTime)} - ${formatTime(row.sequenceEndTime)}`
                            : row.videoTime !== undefined ? formatTime(row.videoTime) : '-'}
                        </span>
                        {row.videoTime !== undefined && (
                          <button onClick={() => replaySegment(row)} className="text-sky-500 hover:text-sky-700" title="Replay Sequence">
                            <Play size={14} className="fill-current" />
                          </button>
                        )}
                      </div>
                      {row.duration !== undefined && row.duration > 0 && (
                        <span className="text-xs text-gray-400 font-mono">
                          ({row.duration.toFixed(1)}s)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <input
                      type="text"
                      value={row.note || ''}
                      onChange={(e) => handleNoteChange(row.id, 'note', e.target.value)}
                      placeholder={settings.uiLanguage === 'th' ? 'เพิ่ม note...' : 'Add note...'}
                      className="w-full bg-transparent border-b border-transparent focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none text-xs"
                    />
                  </td>
                   <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button 
                        onClick={() => setEditingEvent(row)} 
                        className="p-1.5 text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:hover:bg-gray-700/50 rounded-lg transition-all cursor-pointer" 
                        title={settings.uiLanguage === 'th' ? 'แก้ไขซีเควนซ์' : 'Edit Sequence'}
                      >
                        <Pencil size={15} />
                      </button>
                      <button 
                        onClick={() => copyToClipboard(row.extendedEventText || row.eventText, `event-${row.id}`)} 
                        className="p-1.5 text-gray-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-gray-700/50 rounded-lg transition-all" 
                        title="Copy Extended Text"
                      >
                        {copiedId === `event-${row.id}` ? <CopyCheck size={15} className="text-green-500" /> : <Copy size={15} />}
                      </button>
                      <button 
                        onClick={() => duplicateRow(row)} 
                        className="p-1.5 text-gray-500 hover:text-sky-600 hover:bg-sky-50 dark:hover:bg-gray-700/50 rounded-lg transition-all" 
                        title="Duplicate Row"
                      >
                        <Copy size={15} className="opacity-60" />
                      </button>
                      <button 
                        onClick={() => {
                          const confirmDelete = window.confirm(settings.uiLanguage === 'th' ? 'ต้องการลบรายการนี้ใช่หรือไม่? การกระทำนี้สามารถ Undo ได้' : 'Delete this event? You can undo this action.');
                          if (confirmDelete) {
                            deleteEventRow(row.id);
                            showToast(settings.uiLanguage === 'th' ? `ลบซีเควนซ์ที่ ${row.no} เรียบร้อยแล้ว` : `Sequence #${row.no} has been deleted`);
                          }
                        }} 
                        className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all cursor-pointer" 
                        title={settings.uiLanguage === 'th' ? 'ลบซีเควนซ์' : 'Delete Sequence'}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-gray-400 text-sm">
                    {settings.uiLanguage === 'th' ? 'ยังไม่มีข้อมูลการบันทึก' : 'No recorded events yet'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile / Tablet Card View */}
        <div className="lg:hidden flex flex-col p-2 gap-2">
          {events.map((row, index) => (
            <div key={`${row.id}-${index}`} className="bg-white dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col gap-2 relative">
              <div className="flex justify-between items-start">
                <div className="flex gap-2 items-center">
                  <span className="font-bold text-gray-800 dark:text-gray-200 text-sm">#{row.no}</span>
                  <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-lg">PT: {row.point}</span>
                  <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                    row.resultText === '+1' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    row.resultText === '-1' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {row.resultText}
                  </span>
                  {(row.sequenceStartTime !== undefined && row.sequenceEndTime !== undefined && row.duration !== undefined) ? (
                    <button onClick={() => replaySegment(row)} className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded-lg border border-sky-100 dark:border-sky-800">
                      <Play size={10} className="fill-current" /> {formatTime(row.sequenceStartTime)} - {formatTime(row.sequenceEndTime)} ({row.duration.toFixed(1)}s)
                    </button>
                  ) : row.videoTime !== undefined ? (
                    <button onClick={() => replaySegment(row)} className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded-lg">
                      <Play size={12} className="fill-current" /> {formatTime(row.videoTime)}
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2 items-center">
                  <button 
                    onClick={() => setEditingEvent(row)} 
                    className="p-1.5 text-sky-600 hover:bg-sky-50 dark:hover:bg-gray-700/50 rounded-lg transition-all cursor-pointer" 
                    title={settings.uiLanguage === 'th' ? 'แก้ไขซีเควนซ์' : 'Edit Sequence'}
                  >
                    <Pencil size={16} />
                  </button>
                  <button 
                    onClick={() => copyToClipboard(row.extendedEventText || row.eventText, `mob-evt-${row.id}`)} 
                    className="p-1.5 text-sky-500 hover:bg-sky-50 dark:hover:bg-gray-700/50 rounded-lg transition-all" 
                    title="Copy Event Text"
                  >
                    {copiedId === `mob-evt-${row.id}` ? <CopyCheck size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                  <button 
                    onClick={() => copyToClipboard(row.thaiMeaningText || '', `mob-th-${row.id}`)} 
                    className="p-1.5 text-sky-500 hover:bg-sky-50 dark:hover:bg-gray-700/50 rounded-lg transition-all" 
                    title="Copy Thai Meaning"
                  >
                    {copiedId === `mob-th-${row.id}` ? <CopyCheck size={16} className="text-green-500" /> : <Type size={16} />}
                  </button>
                  <button 
                    onClick={() => {
                      const confirmDelete = window.confirm(settings.uiLanguage === 'th' ? 'ต้องการลบรายการนี้ใช่หรือไม่? การกระทำนี้สามารถ Undo ได้' : 'Delete this event? You can undo this action.');
                      if (confirmDelete) {
                        deleteEventRow(row.id);
                        showToast(settings.uiLanguage === 'th' ? `ลบซีเควนซ์ที่ ${row.no} เรียบร้อยแล้ว` : `Sequence #${row.no} has been deleted`);
                      }
                    }} 
                    className="p-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all cursor-pointer" 
                    title={settings.uiLanguage === 'th' ? 'ลบซีเควนซ์' : 'Delete'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <div 
                className="flex flex-col gap-1 mt-1 p-2 rounded-lg bg-sky-50/30 dark:bg-sky-950/10 border border-sky-100/50 dark:border-sky-950/5 hover:bg-sky-50/60 dark:hover:bg-sky-950/20 cursor-pointer transition-colors"
                onClick={() => setEditingEvent(row)}
                title={settings.uiLanguage === 'th' ? 'คลิกเพื่อแก้ไขชุดเหตุการณ์นี้' : 'Click to edit this event sequence'}
              >
                <div className="flex justify-between items-center">
                  <div className="font-mono text-sm text-sky-600 dark:text-sky-400 font-semibold break-words">
                    {row.extendedEventText || row.eventText}
                  </div>
                  <Pencil size={12} className="text-sky-500 opacity-60 shrink-0" />
                </div>
                {row.thaiMeaningText && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {row.thaiMeaningText}
                  </div>
                )}
                {(() => {
                  const rowFouls = row.actions?.filter(a => !!a.foulCode) || [];
                  if (rowFouls.length === 0) return null;
                  return (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {rowFouls.map((foulAction, fIdx) => {
                        const template = SPORT_TEMPLATES[row.sportType];
                        const fDef = template?.fouls?.find(x => x.code === foulAction.foulCode);
                        const fLabel = fDef ? (settings.uiLanguage === 'th' ? (fDef.labelTh || fDef.label) : fDef.label) : foulAction.foulCode;
                        const severityColor = foulAction.foulSeverity === 'card' 
                          ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/30' 
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30';
                        
                        return (
                          <div 
                            key={fIdx} 
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${severityColor}`}
                            title={`Foul: ${foulAction.foulCode} (${fLabel}) - Role: ${foulAction.foulRole || 'violation'}`}
                          >
                            ⚠️ {foulAction.foulCode}: {fLabel}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          ))}
          {events.length === 0 && (
            <div className="text-center text-gray-400 py-4 text-sm">
              {settings.uiLanguage === 'th' ? 'ยังไม่มีข้อมูลการบันทึก' : 'No recorded events yet'}
            </div>
          )}
        </div>
      </div>

      {showDeleteAllModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-sm border border-gray-100 dark:border-gray-700 transform scale-100 transition-all animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-950/40 rounded-full">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {settings.uiLanguage === 'th' ? 'ยืนยันการลบข้อมูลทั้งหมด' : 'Confirm Delete All'}
              </h3>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              {settings.uiLanguage === 'th' 
                ? 'คุณแน่ใจหรือไม่ว่าต้องการลบซีเควนซ์ทั้งหมดในตาราง? ข้อมูลที่เคยบันทึกไว้จะหายไปทั้งหมดและไม่สามารถกู้คืนได้!' 
                : 'Are you sure you want to delete all sequences in the table? All recorded data will be permanently lost and cannot be recovered!'}
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteAllModal(false)}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg cursor-pointer transition-colors"
              >
                {settings.uiLanguage === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button
                onClick={() => {
                  setEvents([]);
                  showToast(settings.uiLanguage === 'th' ? 'ลบข้อมูลทั้งหมดเรียบร้อยแล้ว' : 'All sequences have been deleted successfully');
                  setShowDeleteAllModal(false);
                }}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg cursor-pointer transition-colors shadow-sm"
              >
                {settings.uiLanguage === 'th' ? 'ยืนยันการลบ' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingEvent && (
        <EditEventModal
          isOpen={!!editingEvent}
          onClose={() => setEditingEvent(null)}
          event={editingEvent}
        />
      )}
    </div>
  );
}

function ExportButtons({ events }: { events: EventRow[] }) {
  const { settings } = useScoutContext();
  const exportCSV = () => {
    if (events.length === 0) return;
    const headers = [
      'NO', 'Sport', 'PT', 'Basic Code', 'Extended Code', 'Thai Meaning', 'Result', 
      'Video Source', 'Video ID', 'Video URL', 'Video Time', 
      'Sequence Start', 'Sequence End', 'Sequence Duration',
      'Preview Start', 'Preview End',
      'Note', 'Created At',
      'foulCode', 'foulRole', 'foulSeverity', 'foulLabel', 'areaLabel', 'outZone', 'areaMode', 'areaResolution'
    ];
    const rows = events.map(e => [
      e.no,
      e.sportType || '',
      e.point, 
      e.eventText,
      e.extendedEventText || e.eventText,
      e.thaiMeaningText || '',
      e.resultText, 
      e.videoSourceType || '',
      e.videoId || e.youtubeVideoId || '',
      e.videoUrl || '',
      e.videoTime !== undefined && e.videoTime !== null ? formatTime(e.videoTime) : '',
      e.sequenceStartTime !== undefined && e.sequenceStartTime !== null ? formatTime(e.sequenceStartTime) : '',
      e.sequenceEndTime !== undefined && e.sequenceEndTime !== null ? formatTime(e.sequenceEndTime) : '',
      e.sequenceDuration !== undefined && e.sequenceDuration !== null ? e.sequenceDuration.toFixed(2) : '',
      e.previewStartTime !== undefined && e.previewStartTime !== null ? formatTime(e.previewStartTime) : '',
      e.previewEndTime !== undefined && e.previewEndTime !== null ? formatTime(e.previewEndTime) : '',
      e.note || '',
      e.createdAt,
      e.actions?.map(a => a.foulCode || '').filter(Boolean).join('; ') || '',
      e.actions?.map(a => a.foulRole || '').filter(Boolean).join('; ') || '',
      e.actions?.map(a => a.foulSeverity || '').filter(Boolean).join('; ') || '',
      e.actions?.map(a => {
        if (!a.foulCode) return '';
        const template = SPORT_TEMPLATES[e.sportType];
        const f = template?.fouls?.find(x => x.code === a.foulCode);
        return f ? f.label : a.foulCode;
      }).filter(Boolean).join('; ') || '',
      e.actions?.map(a => a.areaLabel || '').filter(Boolean).join('; ') || '',
      e.actions?.map(a => a.outZone || '').filter(Boolean).join('; ') || '',
      e.actions?.map(a => a.areaMode || '').filter(Boolean).join('; ') || '',
      e.actions?.map(a => a.areaResolution || '').filter(Boolean).join('; ') || '',
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `scout_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportJSON = () => {
    if (events.length === 0) return;
    const exportData = {
      schemaVersion: "1.0",
      app: "Sports Scout Logger",
      exportedAt: new Date().toISOString(),
      type: "events",
      events: events
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `scout_export_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <button onClick={exportCSV} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        <Download size={14} /> {settings.uiLanguage === 'th' ? 'นำออกรายงาน (CSV)' : 'Export Report (CSV)'}
      </button>
      <button onClick={exportJSON} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        <FileJson size={14} /> {settings.uiLanguage === 'th' ? 'นำออกข้อมูลดิบ (JSON)' : 'Export Raw Data (JSON)'}
      </button>
    </>
  );
}

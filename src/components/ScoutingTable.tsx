import React, { useState, useRef, useEffect } from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { EventRow } from '../types';
import { formatPreciseTime as formatTime } from '../utils';
import { Trash2, Copy, Download, FileJson, CopyCheck, Type, Play } from 'lucide-react';
import { t } from '../i18n';

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
        className={`px-2 py-1 rounded text-xs font-bold cursor-pointer focus:outline-none focus:ring-1 focus:ring-sky-500 ${getStyle(value)}`}
      >
        {value}
      </button>
      {isOpen && (
        <div className="absolute z-[100] mt-1 w-16 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg right-1/2 translate-x-1/2">
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
  const { events, setEvents, deleteEventRow, updateEventRow, setSeekRequest, settings } = useScoutContext();
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
    setEvents(prev => {
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
        <div className="flex gap-2">
          <ExportButtons events={events} />
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
                  <td className="px-4 py-2">
                    {row.actions && row.actions.length > 0 ? (
                      <div className="w-full bg-transparent font-mono text-xs text-sky-600 dark:text-sky-400 font-semibold tracking-tight py-1">
                        {row.extendedEventText || row.eventText}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={row.extendedEventText || row.eventText}
                        onChange={(e) => handleNoteChange(row.id, row.extendedEventText ? 'extendedEventText' : 'eventText', e.target.value)}
                        className="w-full bg-transparent border-b border-transparent focus:border-gray-300 dark:focus:border-gray-600 focus:outline-none font-mono text-xs text-sky-600 dark:text-sky-400 font-semibold tracking-tight"
                      />
                    )}
                    {row.thaiMeaningText && (
                      <div className="text-[10px] text-gray-400 mt-1 truncate max-w-xs xl:max-w-md">{row.thaiMeaningText}</div>
                    )}
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
                          <button onClick={() => replayClip(row.videoTime)} className="text-sky-500 hover:text-sky-700" title="Replay Clip (-3s)">
                            <Play size={14} className="fill-current" />
                          </button>
                        )}
                      </div>
                      {row.duration !== undefined && row.duration > 0 && (
                        <span className="text-[10px] text-gray-400 font-mono">
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
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => copyToClipboard(row.extendedEventText || row.eventText, `event-${row.id}`)} className="text-gray-500 hover:text-sky-600 transition-colors" title="Copy Extended Text">
                        {copiedId === `event-${row.id}` ? <CopyCheck size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                      <button onClick={() => duplicateRow(row)} className="text-gray-500 hover:text-sky-600 transition-colors" title="Duplicate Row">
                        <Copy size={16} className="opacity-50" />
                      </button>
                      <button onClick={() => deleteEventRow(row.id)} className="text-red-500 hover:text-red-700 transition-colors" title="Delete">
                        <Trash2 size={16} />
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
                  <span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">PT: {row.point}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    row.resultText === '+1' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    row.resultText === '-1' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {row.resultText}
                  </span>
                  {(row.sequenceStartTime !== undefined && row.sequenceEndTime !== undefined && row.duration !== undefined) ? (
                    <button onClick={() => replayClip(row.sequenceStartTime)} className="flex items-center gap-1 text-[10px] text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded border border-sky-100 dark:border-sky-800">
                      <Play size={10} className="fill-current" /> {formatTime(row.sequenceStartTime)} - {formatTime(row.sequenceEndTime)} ({row.duration.toFixed(1)}s)
                    </button>
                  ) : row.videoTime !== undefined ? (
                    <button onClick={() => replayClip(row.videoTime)} className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded">
                      <Play size={12} className="fill-current" /> {formatTime(row.videoTime)}
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-3">
                  <button onClick={() => copyToClipboard(row.extendedEventText || row.eventText, `mob-evt-${row.id}`)} className="text-sky-500" title="Copy Event Text">
                    {copiedId === `mob-evt-${row.id}` ? <CopyCheck size={16} className="text-green-500" /> : <Copy size={16} />}
                  </button>
                  <button onClick={() => copyToClipboard(row.thaiMeaningText || '', `mob-th-${row.id}`)} className="text-orange-500" title="Copy Thai Meaning">
                    {copiedId === `mob-th-${row.id}` ? <CopyCheck size={16} className="text-green-500" /> : <Type size={16} />}
                  </button>
                  <button onClick={() => deleteEventRow(row.id)} className="text-red-500" title="Delete">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              
              <div className="flex flex-col gap-1 mt-1">
                <div className="font-mono text-sm text-sky-600 dark:text-sky-400 font-semibold break-words">
                  {row.extendedEventText || row.eventText}
                </div>
                {row.thaiMeaningText && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {row.thaiMeaningText}
                  </div>
                )}
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
    </div>
  );
}

function ExportButtons({ events }: { events: EventRow[] }) {
  const exportCSV = () => {
    if (events.length === 0) return;
    const headers = ['NO', 'Sport', 'PT', 'Basic Code', 'Extended Code', 'Thai Meaning', 'Result', 'Video Source', 'Video ID', 'Video Time', 'Note', 'Created At'];
    const rows = events.map(e => [
      e.no,
      e.sportType || '',
      e.point, 
      e.eventText,
      e.extendedEventText || e.eventText,
      e.thaiMeaningText || '',
      e.resultText, 
      e.videoSourceType || '',
      e.youtubeVideoId || '',
      e.videoTime !== undefined && e.videoTime !== null ? formatTime(e.videoTime) : '',
      e.note || '',
      e.createdAt
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
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(events, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `scout_export_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <button onClick={exportCSV} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        <Download size={14} /> CSV
      </button>
      <button onClick={exportJSON} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
        <FileJson size={14} /> JSON
      </button>
    </>
  );
}

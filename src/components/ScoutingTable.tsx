import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useScoutContext } from '../context/ScoutContext';
import { EventRow } from '../types';
import { formatPreciseTime as formatTime } from '../utils';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CopyCheck,
  Download,
  FileJson,
  FilterX,
  Pencil,
  Play,
  Redo2,
  Search,
  Star,
  Trash2,
  Type,
  Undo2,
} from 'lucide-react';
import { t } from '../i18n';
import EditEventModal from './EditEventModal';
import FoulBadges from './ui/FoulBadges';
import { SPORT_TEMPLATES } from '../sports';
import {
  buildAnalyticsSummary,
  buildDataQualityReport,
  createEventsExport,
} from '../utils/scoutData';
import {
  applyEventQuery,
  getEventQueryOptions,
  getEventTimestamp,
  type EventQuery,
} from '../utils/eventQuery';
import { createEventsCsv } from '../utils/eventExport';
import { consumeReviewDrilldown } from '../utils/reviewDrilldown';

const TABLE_PAGE_SIZE = 100;

const INITIAL_EVENT_QUERY: EventQuery = {
  search: '',
  team: '',
  skill: '',
  result: '',
  resultDetail: '',
  foul: '',
  area: '',
  startArea: '',
  targetArea: '',
  systemContext: '',
  bookmark: 'all',
  player: '',
  sortBy: 'videoTime',
  sortDirection: 'asc',
};

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

interface ScoutingTableRowProps {
  row: EventRow;
  index: number;
  settings: any;
  copiedId: string | null;
  handleNoteChange: (id: string, field: 'point' | 'resultText' | 'note', value: any) => void;
  handleResultTextChange: (id: string, newResultText: '+1' | '-1' | '0') => void;
  setEditingEvent: (row: EventRow) => void;
  replaySegment: (row: EventRow) => void;
  jumpToTimestamp: (row: EventRow) => void;
  toggleBookmark: (row: EventRow) => void;
  copyToClipboard: (text: string, id: string) => void;
  duplicateRow: (row: EventRow) => void;
  deleteEventRow: (id: string) => void;
  showToast: (msg: string) => void;
}

const ScoutingTableRow = React.memo(({
  row,
  index,
  settings,
  copiedId,
  handleNoteChange,
  handleResultTextChange,
  setEditingEvent,
  replaySegment,
  jumpToTimestamp,
  toggleBookmark,
  copyToClipboard,
  duplicateRow,
  deleteEventRow,
  showToast
}: ScoutingTableRowProps) => {
  return (
    <tr 
      className="scouting-table-row bg-white border-b dark:bg-gray-800 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
      data-team-id={row.actions[0]?.teamCode}
    >
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
        <FoulBadges actions={row.actions} sportType={row.sportType} uiLanguage={settings.uiLanguage} />
      </td>
      <td className="px-4 py-2 text-center relative overflow-visible">
        <ResultSelect 
          value={row.resultText} 
          onChange={(val) => handleResultTextChange(row.id, val as '+1' | '-1' | '0')} 
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
            {getEventTimestamp(row) !== undefined && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => jumpToTimestamp(row)}
                  className="p-1 text-gray-400 hover:text-sky-600"
                  title={t('table.jumpToTime', settings.uiLanguage)}
                  aria-label={t('table.jumpToTime', settings.uiLanguage)}
                >
                  <Clock size={13} />
                </button>
                <button
                  onClick={() => replaySegment(row)}
                  className="p-1 text-sky-500 hover:text-sky-700"
                  title={t('keyMoments.openReplay', settings.uiLanguage)}
                  aria-label={t('keyMoments.openReplay', settings.uiLanguage)}
                >
                  <Play size={14} className="fill-current" />
                </button>
              </div>
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
            onClick={() => toggleBookmark(row)}
            aria-pressed={Boolean(row.isBookmarked)}
            className={`p-1.5 rounded-lg transition-all ${row.isBookmarked ? 'bg-amber-50 text-amber-500 dark:bg-amber-950/30' : 'text-gray-500 hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-gray-700/50'}`}
            title={row.isBookmarked ? t('keyMoments.remove', settings.uiLanguage) : t('keyMoments.add', settings.uiLanguage)}
            aria-label={row.isBookmarked ? t('keyMoments.remove', settings.uiLanguage) : t('keyMoments.add', settings.uiLanguage)}
          >
            <Star size={15} fill={row.isBookmarked ? 'currentColor' : 'none'} />
          </button>
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
  );
});

function TableFilterSelect({
  label,
  value,
  options,
  allLabel,
  specialLabel,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  allLabel: string;
  specialLabel?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
      {label}
      <select
        value={value}
        onChange={event => onChange(event.target.value)}
        className={`h-9 min-w-0 rounded-md border bg-white px-2 text-xs normal-case text-gray-800 outline-none focus:border-sky-500 dark:bg-gray-900 dark:text-gray-100 ${value ? 'border-sky-400' : 'border-gray-300 dark:border-gray-600'}`}
      >
        <option value="">{allLabel}</option>
        {options.map(option => <option key={option} value={option}>{option === '__ungraded__' ? specialLabel ?? option : option}</option>)}
      </select>
    </label>
  );
}

function TimeFilterInput({
  label,
  value,
  invalid,
  onChange,
}: {
  label: string;
  value?: number;
  invalid: boolean;
  onChange: (value?: number) => void;
}) {
  return (
    <label className="flex w-[118px] flex-col gap-1 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
      {label}
      <input
        type="number"
        min="0"
        step="0.1"
        value={value ?? ''}
        onChange={event => onChange(event.target.value === '' ? undefined : Math.max(0, Number(event.target.value)))}
        placeholder="0.0s"
        className={`h-9 rounded-md border bg-white px-2 text-xs normal-case text-gray-800 outline-none focus:ring-2 dark:bg-gray-900 dark:text-gray-100 ${invalid ? 'border-red-500 focus:ring-red-500/20' : value !== undefined ? 'border-sky-400 focus:ring-sky-500/20' : 'border-gray-300 focus:border-sky-500 focus:ring-sky-500/20 dark:border-gray-600'}`}
      />
    </label>
  );
}

export default function ScoutingTable() {
  const {
    events,
    saveEventsWithHistory,
    deleteEventRow,
    updateEventRow,
    setSeekRequest,
    setPreviewState,
    settings,
    showToast,
    canUndoEventAction,
    canRedoEventAction,
    undoEventAction,
    redoEventAction,
    toggleEventBookmark,
  } = useScoutContext();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [query, setQuery] = useState<EventQuery>(INITIAL_EVENT_QUERY);
  const [page, setPage] = useState(1);
  const deferredSearch = React.useDeferredValue(query.search);
  const effectiveQuery = useMemo(() => ({ ...query, search: deferredSearch }), [deferredSearch, query]);
  const queryOptions = useMemo(() => getEventQueryOptions(events), [events]);
  const filteredEvents = useMemo(() => applyEventQuery(events, effectiveQuery), [effectiveQuery, events]);
  const dataQuality = useMemo(() => buildDataQualityReport(filteredEvents), [filteredEvents]);
  const filteredAnalytics = useMemo(() => buildAnalyticsSummary(filteredEvents), [filteredEvents]);
  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / TABLE_PAGE_SIZE));
  const visibleEvents = useMemo(
    () => filteredEvents.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE),
    [filteredEvents, page],
  );
  const hasActiveFilters = query.search !== ''
    || query.team !== ''
    || query.skill !== ''
    || query.result !== ''
    || query.resultDetail !== ''
    || query.foul !== ''
    || query.area !== ''
    || query.startArea !== ''
    || query.targetArea !== ''
    || query.systemContext !== ''
    || query.player !== ''
    || query.bookmark !== 'all'
    || query.timeFrom !== undefined
    || query.timeTo !== undefined;
  const invalidTimeRange = query.timeFrom !== undefined
    && query.timeTo !== undefined
    && query.timeFrom > query.timeTo;

  useEffect(() => {
    const pendingFilters = consumeReviewDrilldown();
    if (pendingFilters) setQuery(current => ({ ...current, ...pendingFilters }));
  }, []);

  useEffect(() => {
    setPage(1);
  }, [effectiveQuery]);

  useEffect(() => {
    setPage(current => Math.min(current, pageCount));
  }, [pageCount]);

  const replaySegment = (row: EventRow) => {
    setPreviewState({ isActive: true, eventRow: row, loop: true });
  };

  const jumpToTimestamp = (row: EventRow) => {
    const timestamp = getEventTimestamp(row);
    if (timestamp !== undefined) setSeekRequest(timestamp);
  };

  const toggleBookmark = (row: EventRow) => {
    toggleEventBookmark(row.id);
    showToast(row.isBookmarked
      ? t('keyMoments.removedToast', settings.uiLanguage)
      : t('keyMoments.savedToast', settings.uiLanguage));
  };
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<EventRow | null>(null);

  const handleResultTextChange = (id: string, newResultText: '+1' | '-1' | '0') => {
    const row = events.find(e => e.id === id);
    if (!row) return;

    let newResultCode = 'Pass';
    let outcomeStatus: 'success' | 'error' | 'neutral' = 'neutral';
    if (newResultText === '+1') {
      newResultCode = 'Yes';
      outcomeStatus = 'success';
    } else if (newResultText === '-1') {
      newResultCode = 'Out';
      outcomeStatus = 'error';
    }

    const updatedActions = (row.actions || []).map((act, idx) => {
      if (idx === (row.actions || []).length - 1) {
        return {
          ...act,
          resultCode: newResultCode,
          outcomeStatus,
        };
      }
      return act;
    });

    updateEventRow(id, {
      ...row,
      resultText: newResultText,
      actions: updatedActions,
    });
  };

  const handleNoteChange = (id: string, value: string) => {
    const row = events.find(e => e.id === id);
    if (row) {
      updateEventRow(id, { ...row, note: value });
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
      const timestamp = Date.now();
      const newActions = (row.actions || []).map((act, actIdx) => ({
        ...act,
        id: `act-dup-${timestamp}-${actIdx}-${Math.random().toString(36).slice(2, 7)}`,
      }));

      const newRow: EventRow = {
        ...row,
        id: `event-dup-${timestamp}-${Math.random().toString(36).slice(2, 11)}`,
        no: prev.length + 1,
        createdAt: new Date().toISOString(),
        actions: newActions,
      };
      
      return [...prev, newRow].map((e, index) => ({
        ...e,
        no: index + 1,
      }));
    });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 flex flex-col h-full overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold text-gray-700 dark:text-gray-300">{t('table.title', settings.uiLanguage)}</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            {t('table.showing', settings.uiLanguage)} <strong>{filteredEvents.length}</strong> / {events.length}
            <span className="mx-1.5">·</span>
            {t('dashboard.totalActions', settings.uiLanguage)} <strong>{filteredAnalytics.totalActions}</strong>
            <span className="mx-1.5">·</span>
            {t('dashboard.derivedPoints', settings.uiLanguage)} <strong>{filteredAnalytics.derivedOutcomePoints.total}</strong>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
            <button 
              onClick={undoEventAction} 
              disabled={!canUndoEventAction}
              className={`p-1.5 rounded-md transition-colors ${canUndoEventAction ? 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 cursor-pointer shadow-sm' : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}`}
              title={t('table.undo', settings.uiLanguage)}
            >
              <Undo2 size={14} />
            </button>
            <button 
              onClick={redoEventAction} 
              disabled={!canRedoEventAction}
              className={`p-1.5 rounded-md transition-colors ${canRedoEventAction ? 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 cursor-pointer shadow-sm' : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'}`}
              title={t('table.redo', settings.uiLanguage)}
            >
              <Redo2 size={14} />
            </button>
          </div>
          <ExportButtons events={filteredEvents} isFiltered={hasActiveFilters} />
          {events.length > 0 && (
            <button 
              onClick={() => setShowDeleteAllModal(true)}
              className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/30 px-2.5 py-1 rounded-lg hover:bg-red-500 hover:text-white dark:hover:bg-red-900 transition-all cursor-pointer font-bold shadow-sm"
              title={t('table.deleteAll', settings.uiLanguage)}
            >
              <Trash2 size={11} />
              <span>{t('table.deleteAll', settings.uiLanguage)}</span>
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          <label className="relative col-span-2 md:col-span-3 xl:col-span-2">
            <span className="sr-only">{t('table.search', settings.uiLanguage)}</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="search"
              value={query.search}
              onChange={event => setQuery(current => ({ ...current, search: event.target.value }))}
              placeholder={t('table.searchPlaceholder', settings.uiLanguage)}
              className={`h-9 w-full rounded-md border bg-white pl-9 pr-3 text-xs text-gray-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:bg-gray-900 dark:text-gray-100 ${query.search ? 'border-sky-400' : 'border-gray-300 dark:border-gray-600'}`}
            />
          </label>
          <TableFilterSelect label={t('input.team', settings.uiLanguage)} allLabel={t('table.allTeams', settings.uiLanguage)} value={query.team} options={queryOptions.teams} onChange={team => setQuery(current => ({ ...current, team }))} />
          <TableFilterSelect label={t('input.skill', settings.uiLanguage)} allLabel={t('table.allSkills', settings.uiLanguage)} value={query.skill} options={queryOptions.skills} onChange={skill => setQuery(current => ({ ...current, skill }))} />
          <TableFilterSelect label={t('input.result', settings.uiLanguage)} allLabel={t('table.allResults', settings.uiLanguage)} value={query.result} options={queryOptions.results} onChange={result => setQuery(current => ({ ...current, result }))} />
          <TableFilterSelect label={settings.uiLanguage === 'th' ? 'เกรดทักษะ' : 'Skill grade'} allLabel={settings.uiLanguage === 'th' ? 'ทุกเกรด' : 'All grades'} specialLabel={settings.uiLanguage === 'th' ? 'ไม่ระบุเกรด' : 'Not graded'} value={query.resultDetail} options={queryOptions.resultDetails} onChange={resultDetail => setQuery(current => ({ ...current, resultDetail }))} />
          <TableFilterSelect label={t('table.foul', settings.uiLanguage)} allLabel={t('table.allFouls', settings.uiLanguage)} value={query.foul} options={queryOptions.fouls} onChange={foul => setQuery(current => ({ ...current, foul }))} />
          <TableFilterSelect label={t('input.area', settings.uiLanguage)} allLabel={t('table.allAreas', settings.uiLanguage)} value={query.area} options={queryOptions.areas} onChange={area => setQuery(current => ({ ...current, area }))} />
          {queryOptions.startAreas.length > 0 && <TableFilterSelect label={settings.uiLanguage === 'th' ? 'จุดเริ่ม' : 'Start area'} allLabel={settings.uiLanguage === 'th' ? 'ทุกจุดเริ่ม' : 'All starts'} value={query.startArea} options={queryOptions.startAreas} onChange={startArea => setQuery(current => ({ ...current, startArea }))} />}
          {queryOptions.targetAreas.length > 0 && <TableFilterSelect label={settings.uiLanguage === 'th' ? 'จุดเป้าหมาย' : 'Target area'} allLabel={settings.uiLanguage === 'th' ? 'ทุกเป้าหมาย' : 'All targets'} value={query.targetArea} options={queryOptions.targetAreas} onChange={targetArea => setQuery(current => ({ ...current, targetArea }))} />}
          {queryOptions.systemContexts.length > 0 && <TableFilterSelect label="System" allLabel={settings.uiLanguage === 'th' ? 'ทุกบริบท' : 'All contexts'} value={query.systemContext} options={queryOptions.systemContexts} onChange={systemContext => setQuery(current => ({ ...current, systemContext }))} />}
          <TableFilterSelect label={t('table.player', settings.uiLanguage)} allLabel={t('table.allPlayers', settings.uiLanguage)} value={query.player} options={queryOptions.players} onChange={player => setQuery(current => ({ ...current, player }))} />
          <label className="flex min-w-0 flex-col gap-1 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
            {t('keyMoments.title', settings.uiLanguage)}
            <select
              value={query.bookmark}
              onChange={event => setQuery(current => ({ ...current, bookmark: event.target.value as EventQuery['bookmark'] }))}
              className={`h-9 min-w-0 rounded-md border bg-white px-2 text-xs normal-case text-gray-800 outline-none focus:border-sky-500 dark:bg-gray-900 dark:text-gray-100 ${query.bookmark !== 'all' ? 'border-amber-400' : 'border-gray-300 dark:border-gray-600'}`}
            >
              <option value="all">{t('table.all', settings.uiLanguage)}</option>
              <option value="bookmarked">{t('keyMoments.saved', settings.uiLanguage)}</option>
              <option value="unbookmarked">{t('keyMoments.notSaved', settings.uiLanguage)}</option>
            </select>
          </label>
        </div>

        <div className="mt-2 flex flex-wrap items-end gap-2">
          <TimeFilterInput label={t('table.timeFrom', settings.uiLanguage)} value={query.timeFrom} invalid={invalidTimeRange} onChange={timeFrom => setQuery(current => ({ ...current, timeFrom }))} />
          <TimeFilterInput label={t('table.timeTo', settings.uiLanguage)} value={query.timeTo} invalid={invalidTimeRange} onChange={timeTo => setQuery(current => ({ ...current, timeTo }))} />
          <label className="flex min-w-[150px] flex-col gap-1 text-[10px] font-bold uppercase text-gray-500 dark:text-gray-400">
            {t('table.sort', settings.uiLanguage)}
            <select
              value={query.sortBy}
              onChange={event => setQuery(current => ({ ...current, sortBy: event.target.value as EventQuery['sortBy'] }))}
              className="h-9 rounded-md border border-gray-300 bg-white px-2 text-xs normal-case text-gray-800 outline-none focus:border-sky-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="videoTime">{t('table.videoTime', settings.uiLanguage)}</option>
              <option value="no">{t('table.no', settings.uiLanguage)}</option>
              <option value="createdAt">{t('table.createdAt', settings.uiLanguage)}</option>
              <option value="team">{t('input.team', settings.uiLanguage)}</option>
              <option value="skill">{t('input.skill', settings.uiLanguage)}</option>
              <option value="result">{t('input.result', settings.uiLanguage)}</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => setQuery(current => ({ ...current, sortDirection: current.sortDirection === 'asc' ? 'desc' : 'asc' }))}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-xs font-bold text-gray-700 hover:border-sky-400 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200"
          >
            {query.sortDirection === 'asc' ? t('table.ascending', settings.uiLanguage) : t('table.descending', settings.uiLanguage)}
          </button>
          <button
            type="button"
            onClick={() => setQuery(INITIAL_EVENT_QUERY)}
            disabled={!hasActiveFilters}
            className={`h-9 rounded-md border px-3 text-xs font-bold transition ${hasActiveFilters ? 'border-gray-300 bg-white text-gray-700 hover:border-red-300 hover:text-red-600 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200' : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-600'}`}
          >
            <span className="inline-flex items-center gap-1.5"><FilterX size={14} /> {t('table.clearFilters', settings.uiLanguage)}</span>
          </button>
          {query.search !== deferredSearch && <span className="pb-2 text-[11px] text-sky-600">{t('table.pending', settings.uiLanguage)}</span>}
          {invalidTimeRange && <span className="pb-2 text-[11px] font-semibold text-red-600">{t('table.invalidTimeRange', settings.uiLanguage)}</span>}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-wrap items-center gap-2 text-[11px]">
        <span className="font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {settings.uiLanguage === 'th' ? 'คุณภาพข้อมูล' : 'Data Quality'}
        </span>
        <span className="px-2 py-1 rounded-full bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 border border-green-100 dark:border-green-900/40">
          {settings.uiLanguage === 'th' ? 'สมบูรณ์' : 'Valid'}: {dataQuality.validEvents}
        </span>
        <span className={`px-2 py-1 rounded-full border ${dataQuality.incompleteEvents > 0 ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-100 dark:border-red-900/40' : 'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400 border-gray-100 dark:border-gray-700'}`}>
          {settings.uiLanguage === 'th' ? 'ไม่ครบ' : 'Incomplete'}: {dataQuality.incompleteEvents}
        </span>
        <span className={`px-2 py-1 rounded-full border ${dataQuality.warnings > 0 ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-100 dark:border-amber-900/40' : 'bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400 border-gray-100 dark:border-gray-700'}`}>
          {settings.uiLanguage === 'th' ? 'คำเตือน' : 'Warnings'}: {dataQuality.warnings}
        </span>
        <span className="px-2 py-1 rounded-full bg-gray-50 text-gray-500 dark:bg-gray-900 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
          {settings.uiLanguage === 'th' ? 'Legacy' : 'Legacy'}: {dataQuality.legacyEvents}
        </span>
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
              {visibleEvents.map((row, index) => (
                <ScoutingTableRow 
                  key={`${row.id}-${index}`}
                  row={row}
                  index={index}
                  settings={settings}
                  copiedId={copiedId}
                  handleNoteChange={handleNoteChange}
                  handleResultTextChange={handleResultTextChange}
                  setEditingEvent={setEditingEvent}
                  replaySegment={replaySegment}
                  jumpToTimestamp={jumpToTimestamp}
                  toggleBookmark={toggleBookmark}
                  copyToClipboard={copyToClipboard}
                  duplicateRow={duplicateRow}
                  deleteEventRow={deleteEventRow}
                  showToast={showToast}
                />
              ))}
              {filteredEvents.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-gray-400 text-sm">
                    {events.length === 0 ? t('table.noEvents', settings.uiLanguage) : t('table.noMatches', settings.uiLanguage)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile / Tablet Card View */}
        <div className="lg:hidden flex flex-col p-2 gap-2">
          {visibleEvents.map((row, index) => (
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
                    <button onClick={() => replaySegment(row)} className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded-lg border border-sky-100 dark:border-sky-800" title={t('keyMoments.openReplay', settings.uiLanguage)}>
                      <Play size={10} className="fill-current" /> {formatTime(row.sequenceStartTime)} - {formatTime(row.sequenceEndTime)} ({row.duration.toFixed(1)}s)
                    </button>
                  ) : row.videoTime !== undefined ? (
                    <button onClick={() => replaySegment(row)} className="flex items-center gap-1 text-xs text-sky-600 bg-sky-50 dark:bg-sky-900/30 px-1.5 py-0.5 rounded-lg" title={t('keyMoments.openReplay', settings.uiLanguage)}>
                      <Play size={12} className="fill-current" /> {formatTime(row.videoTime)}
                    </button>
                  ) : null}
                </div>
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => toggleBookmark(row)}
                    aria-pressed={Boolean(row.isBookmarked)}
                    className={`p-1.5 rounded-lg transition-all ${row.isBookmarked ? 'bg-amber-50 text-amber-500 dark:bg-amber-950/30' : 'text-gray-500 hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-gray-700/50'}`}
                    title={row.isBookmarked ? t('keyMoments.remove', settings.uiLanguage) : t('keyMoments.add', settings.uiLanguage)}
                  >
                    <Star size={16} fill={row.isBookmarked ? 'currentColor' : 'none'} />
                  </button>
                  {getEventTimestamp(row) !== undefined && (
                    <button
                      onClick={() => jumpToTimestamp(row)}
                      className="p-1.5 text-gray-500 hover:bg-sky-50 hover:text-sky-600 dark:hover:bg-gray-700/50 rounded-lg"
                      title={t('table.jumpToTime', settings.uiLanguage)}
                    >
                      <Clock size={16} />
                    </button>
                  )}
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
          {filteredEvents.length === 0 && (
            <div className="text-center text-gray-400 py-4 text-sm">
              {events.length === 0 ? t('table.noEvents', settings.uiLanguage) : t('table.noMatches', settings.uiLanguage)}
            </div>
          )}
        </div>
      </div>

      {filteredEvents.length > TABLE_PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
          <span>{t('table.page', settings.uiLanguage)} {page} / {pageCount}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(current => Math.max(1, current - 1))}
              disabled={page === 1}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800"
              aria-label={t('table.previousPage', settings.uiLanguage)}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              type="button"
              onClick={() => setPage(current => Math.min(pageCount, current + 1))}
              disabled={page === pageCount}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-300 bg-white hover:border-sky-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800"
              aria-label={t('table.nextPage', settings.uiLanguage)}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {showDeleteAllModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-gray-800 rounded-2xl max-w-sm w-full p-6 shadow-sm border border-gray-100 dark:border-gray-700 transform scale-100 transition-all animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400 mb-4">
              <div className="p-3 bg-red-100 dark:bg-red-950/40 rounded-full">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                {t('table.confirmDeleteAllTitle', settings.uiLanguage)}
              </h3>
            </div>
            
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
              {t('table.confirmDeleteAllMessage', settings.uiLanguage)}
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteAllModal(false)}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg cursor-pointer transition-colors"
              >
                {t('table.cancel', settings.uiLanguage)}
              </button>
              <button
                onClick={() => {
                  saveEventsWithHistory(() => []);
                  showToast(t('table.deleteAllDone', settings.uiLanguage));
                  setShowDeleteAllModal(false);
                }}
                className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg cursor-pointer transition-colors shadow-sm"
              >
                {t('table.confirmDelete', settings.uiLanguage)}
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

function ExportButtons({ events, isFiltered }: { events: EventRow[]; isFiltered: boolean }) {
  const { settings } = useScoutContext();
  const filenameSuffix = isFiltered ? '_filtered' : '';
  const exportCSV = () => {
    if (events.length === 0) return;
    const csvContent = createEventsCsv(events, settings.uiLanguage);
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `scout_export${filenameSuffix}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    if (events.length === 0) return;
    const exportData = createEventsExport(events);
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const link = document.createElement("a");
    link.setAttribute("href", dataStr);
    link.setAttribute("download", `scout_export${filenameSuffix}_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <button onClick={exportCSV} disabled={events.length === 0} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:cursor-not-allowed disabled:opacity-40">
        <Download size={14} /> {isFiltered ? t('table.exportFilteredCsv', settings.uiLanguage) : t('table.exportCsv', settings.uiLanguage)}
      </button>
      <button onClick={exportJSON} disabled={events.length === 0} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:cursor-not-allowed disabled:opacity-40">
        <FileJson size={14} /> {isFiltered ? t('table.exportFilteredJson', settings.uiLanguage) : t('table.exportJson', settings.uiLanguage)}
      </button>
    </>
  );
}

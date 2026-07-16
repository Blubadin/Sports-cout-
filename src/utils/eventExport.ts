import { SPORT_TEMPLATES } from '../sports';
import type { EventRow } from '../types';
import { formatPreciseTime } from '../utils';
import { getAreaLabel, getFoulLabel } from './scoutData';
import { neutralizeSpreadsheetFormula } from './security';

const CSV_HEADERS = [
  'Event ID', 'NO', 'Sport', 'PT', 'Teams', 'Skills', 'Players', 'Results',
  'Basic Code', 'Extended Code', 'Thai Meaning', 'Result', 'Bookmarked',
  'Video Source', 'Video ID', 'Video URL', 'Video Time',
  'Sequence Start', 'Sequence End', 'Sequence Duration', 'Preview Start', 'Preview End',
  'Note', 'Created At', 'foulCode', 'foulRole', 'foulSeverity', 'foulLabel',
  'areaCode', 'areaLabel', 'outZone', 'areaMode', 'areaResolution',
];

const joinActionValues = (event: EventRow, getter: (action: EventRow['actions'][number]) => string | undefined): string =>
  event.actions?.map(getter).filter(Boolean).join('; ') || '';

const escapeCsvCell = (value: unknown): string => `"${neutralizeSpreadsheetFormula(value).replace(/"/g, '""')}"`;

export function createEventsCsv(events: EventRow[], uiLanguage: 'th' | 'en' = 'en'): string {
  const rows = events.map(event => {
    const template = event.sportType ? SPORT_TEMPLATES[event.sportType] : undefined;
    return [
      event.id,
      event.no,
      event.sportType || '',
      event.point,
      joinActionValues(event, action => action.teamCode),
      joinActionValues(event, action => action.skillCode),
      joinActionValues(event, action => [action.playerNumber ? `#${action.playerNumber}` : '', action.playerName].filter(Boolean).join(' ')),
      joinActionValues(event, action => action.resultCode),
      event.eventText,
      event.extendedEventText || event.eventText,
      event.thaiMeaningText || '',
      event.resultText,
      Boolean(event.isBookmarked),
      event.videoSourceType || '',
      event.videoId || event.youtubeVideoId || '',
      event.videoUrl || '',
      event.videoTime !== undefined ? formatPreciseTime(event.videoTime) : '',
      event.sequenceStartTime !== undefined ? formatPreciseTime(event.sequenceStartTime) : '',
      event.sequenceEndTime !== undefined ? formatPreciseTime(event.sequenceEndTime) : '',
      event.sequenceDuration !== undefined ? event.sequenceDuration.toFixed(2) : '',
      event.previewStartTime !== undefined ? formatPreciseTime(event.previewStartTime) : '',
      event.previewEndTime !== undefined ? formatPreciseTime(event.previewEndTime) : '',
      event.note || '',
      event.createdAt,
      joinActionValues(event, action => action.foulCode),
      joinActionValues(event, action => action.foulRole),
      joinActionValues(event, action => action.foulSeverity),
      event.actions?.map(action => action.foulCode
        ? getFoulLabel(action, { sportTemplate: template, uiLanguage })
        : '').filter(Boolean).join('; ') || '',
      joinActionValues(event, action => action.areaCode),
      event.actions?.map(action => getAreaLabel(action, { sportTemplate: template, uiLanguage })).filter(Boolean).join('; ') || '',
      joinActionValues(event, action => action.outZone),
      joinActionValues(event, action => action.areaMode),
      joinActionValues(event, action => action.areaResolution),
    ];
  });

  return `\uFEFF${[
    CSV_HEADERS.join(','),
    ...rows.map(row => row.map(escapeCsvCell).join(',')),
  ].join('\n')}`;
}

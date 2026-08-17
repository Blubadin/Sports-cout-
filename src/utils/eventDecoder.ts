import type { Action, EventRow, SportDomainPayload } from '../types';
import { createScoutId, getValidSportType } from './scoutData';

type DecodeStatus = 'accepted' | 'repaired' | 'rejected';

export function decodeAction(raw: unknown): { action: Action; status: DecodeStatus; warnings: string[] } {
  const warnings: string[] = [];
  let status: DecodeStatus = 'accepted';

  if (!raw || typeof raw !== 'object') {
    return { action: {} as Action, status: 'rejected', warnings: ['Raw action is not an object'] };
  }

  const rawObj = raw as Record<string, any>;
  let id = rawObj.id;
  if (typeof id !== 'string' || id.trim() === '') {
    id = createScoutId('action');
    status = 'repaired';
    warnings.push('Generated missing action ID');
  }

  const action: Action = { id };

  const copyString = (key: keyof Action) => {
    if (typeof rawObj[key] === 'string') {
      (action as any)[key] = rawObj[key];
    }
  };

  const copyNumber = (key: keyof Action) => {
    if (typeof rawObj[key] === 'number') {
      (action as any)[key] = rawObj[key];
    }
  };

  // String fields
  copyString('teamCode');
  copyString('skillCode');
  copyString('areaCode');
  copyString('areaLabel');
  copyString('areaMode');
  copyString('courtSide');
  copyString('outZone');
  copyString('areaResolution');
  copyString('courtViewMode');
  copyString('resultCode');
  copyString('resultDetailCode');
  copyString('foulCode');
  copyString('foulRole');
  copyString('foulSeverity');
  copyString('playerNumber');
  copyString('playerName');

  // Legacy resultCode check
  // The system specifically said keep Unknown as Unknown
  if (rawObj.resultCode === 'Unknown') {
    action.resultCode = 'Unknown';
  }

  if (typeof rawObj.descriptors === 'object' && rawObj.descriptors !== null) {
    const descriptors: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawObj.descriptors)) {
      if (typeof v === 'string') descriptors[k] = v;
    }
    action.descriptors = descriptors;
  }

  copyNumber('gridX');
  copyNumber('gridY');
  
  if (typeof rawObj.pointX === 'number') {
    action.pointX = Math.max(0, Math.min(1, rawObj.pointX));
    if (action.pointX !== rawObj.pointX) {
      status = 'repaired';
      warnings.push('Clamped pointX to [0, 1]');
    }
  }
  
  if (typeof rawObj.pointY === 'number') {
    action.pointY = Math.max(0, Math.min(1, rawObj.pointY));
    if (action.pointY !== rawObj.pointY) {
      status = 'repaired';
      warnings.push('Clamped pointY to [0, 1]');
    }
  }

  const clampTime = (val: number, name: string) => {
    const clamped = Math.max(0, Math.min(86400, val));
    if (clamped !== val) {
      status = 'repaired';
      warnings.push(`Clamped ${name} to [0, 86400]`);
    }
    return clamped;
  };

  if (typeof rawObj.videoTime === 'number') action.videoTime = clampTime(rawObj.videoTime, 'videoTime');
  if (typeof rawObj.videoTimeEnd === 'number') action.videoTimeEnd = clampTime(rawObj.videoTimeEnd, 'videoTimeEnd');
  
  copyNumber('duration');
  copyNumber('realTime');

  if (typeof rawObj.scoreDelta === 'number') {
    action.scoreDelta = Math.max(-99, Math.min(99, rawObj.scoreDelta));
    if (action.scoreDelta !== rawObj.scoreDelta) {
      status = 'repaired';
      warnings.push('Clamped scoreDelta to [-99, 99]');
    }
  }

  if (rawObj.outcomeStatus) {
    if (['success', 'error', 'neutral', 'continued'].includes(rawObj.outcomeStatus)) {
      action.outcomeStatus = rawObj.outcomeStatus;
    } else {
      status = 'repaired';
      warnings.push('Invalid outcomeStatus stripped');
    }
  }

  if (rawObj.actionCategory) {
    if (['attack', 'defense', 'transition', 'set_piece', 'violation'].includes(rawObj.actionCategory)) {
      action.actionCategory = rawObj.actionCategory;
    } else {
      status = 'repaired';
      warnings.push('Invalid actionCategory stripped');
    }
  }

  if (rawObj.domainPayload && typeof rawObj.domainPayload === 'object') {
    const dp = rawObj.domainPayload as any;
    if (['volleyball', 'football', 'badminton', 'basketball'].includes(dp.type)) {
      const payload: any = { type: dp.type };
      if (dp.type === 'volleyball') {
        const decodeAreaPayload = (rawArea: unknown, fieldName: 'startArea' | 'targetArea') => {
          if (rawArea === undefined) return undefined;
          if (!rawArea || typeof rawArea !== 'object' || Array.isArray(rawArea)) {
            status = 'repaired';
            warnings.push(`Invalid volleyball ${fieldName} stripped`);
            return undefined;
          }

          const source = rawArea as Record<string, unknown>;
          const decoded: Record<string, unknown> = {};
          const stringFields = ['areaCode', 'areaLabel', 'areaMode', 'courtSide', 'outZone', 'areaResolution', 'courtViewMode'];
          const numberFields = ['gridX', 'gridY'];
          stringFields.forEach(key => {
            if (typeof source[key] === 'string') decoded[key] = source[key];
          });
          numberFields.forEach(key => {
            if (typeof source[key] === 'number') decoded[key] = source[key];
          });
          (['pointX', 'pointY'] as const).forEach(key => {
            if (typeof source[key] !== 'number') return;
            const clamped = Math.max(0, Math.min(1, source[key]));
            decoded[key] = clamped;
            if (clamped !== source[key]) {
              status = 'repaired';
              warnings.push(`Clamped volleyball ${fieldName}.${key} to [0, 1]`);
            }
          });
          return decoded;
        };

        if (typeof dp.rotation === 'number') {
          payload.rotation = Math.max(1, Math.min(6, dp.rotation));
          if (payload.rotation !== dp.rotation) {
             status = 'repaired';
             warnings.push('Clamped rotation to [1, 6]');
          }
        }
        if (typeof dp.server === 'string') payload.server = dp.server;
        if (typeof dp.rallyPhase === 'string') payload.rallyPhase = dp.rallyPhase;
        if (typeof dp.attackGrade === 'string') payload.attackGrade = dp.attackGrade;
        if (typeof dp.receptionGrade === 'string') payload.receptionGrade = dp.receptionGrade;
        const startArea = decodeAreaPayload(dp.startArea, 'startArea');
        const targetArea = decodeAreaPayload(dp.targetArea, 'targetArea');
        if (startArea) payload.startArea = startArea;
        if (targetArea) payload.targetArea = targetArea;
        if (dp.systemContext === 'in_system' || dp.systemContext === 'out_of_system') {
          payload.systemContext = dp.systemContext;
        } else if (dp.systemContext !== undefined) {
          status = 'repaired';
          warnings.push('Invalid volleyball systemContext stripped');
        }
      } else if (dp.type === 'football') {
        if (typeof dp.possessionTeam === 'string') payload.possessionTeam = dp.possessionTeam;
        if (typeof dp.phase === 'string') payload.phase = dp.phase;
        if (dp.startCoord && typeof dp.startCoord === 'object') {
          payload.startCoord = {
            x: Math.max(0, Math.min(1, dp.startCoord.x || 0)),
            y: Math.max(0, Math.min(1, dp.startCoord.y || 0)),
          };
        }
        if (dp.endCoord && typeof dp.endCoord === 'object') {
          payload.endCoord = {
            x: Math.max(0, Math.min(1, dp.endCoord.x || 0)),
            y: Math.max(0, Math.min(1, dp.endCoord.y || 0)),
          };
        }
        if (typeof dp.passSequenceIndex === 'number') payload.passSequenceIndex = dp.passSequenceIndex;
      } else if (dp.type === 'badminton') {
        if (typeof dp.strokeType === 'string') payload.strokeType = dp.strokeType;
        if (typeof dp.contactZone === 'string') payload.contactZone = dp.contactZone;
        if (typeof dp.landingZone === 'string') payload.landingZone = dp.landingZone;
        if (typeof dp.rallyStrokeIndex === 'number') payload.rallyStrokeIndex = dp.rallyStrokeIndex;
      } else if (dp.type === 'basketball') {
        if (typeof dp.possessionTeam === 'string') payload.possessionTeam = dp.possessionTeam;
        if (typeof dp.shotClockRemaining === 'number') payload.shotClockRemaining = dp.shotClockRemaining;
        if (typeof dp.periodType === 'string') payload.periodType = dp.periodType;
        if (typeof dp.pointValue === 'number' && [1, 2, 3].includes(dp.pointValue)) payload.pointValue = dp.pointValue;
        if (typeof dp.reboundType === 'string') payload.reboundType = dp.reboundType;
      }
      action.domainPayload = payload as SportDomainPayload;
    }
  }

  return { action, status, warnings };
}

export function decodeEventRow(raw: unknown): { event: EventRow; status: DecodeStatus; warnings: string[] } {
  const warnings: string[] = [];
  let status: DecodeStatus = 'accepted';

  if (!raw || typeof raw !== 'object') {
    return { event: {} as EventRow, status: 'rejected', warnings: ['Raw event is not an object'] };
  }

  const rawObj = raw as Record<string, any>;
  
  if (rawObj.eventText === undefined && rawObj.no === undefined && rawObj.resultText === undefined && rawObj.actions === undefined) {
    return { event: {} as EventRow, status: 'rejected', warnings: ['Event missing core properties'] };
  }

  let id = rawObj.id;
  if (typeof id !== 'string' || id.trim() === '') {
    id = createScoutId('event');
    status = 'repaired';
    warnings.push('Generated missing event ID');
  }

  const event: EventRow = {
    id,
    no: typeof rawObj.no === 'number' ? rawObj.no : 1,
    point: typeof rawObj.point === 'number' ? rawObj.point : 1,
    actions: [],
    eventText: typeof rawObj.eventText === 'string' ? rawObj.eventText : '',
    resultText: '0',
    createdAt: typeof rawObj.createdAt === 'string' ? rawObj.createdAt : new Date().toISOString()
  };

  if (typeof rawObj.no !== 'number') {
    status = 'repaired';
    warnings.push('Defaulted no to 1');
  }
  if (typeof rawObj.point !== 'number') {
    status = 'repaired';
    warnings.push('Defaulted point to 1');
  }
  if (typeof rawObj.eventText !== 'string') {
    status = 'repaired';
    warnings.push('Defaulted eventText to empty string');
  }
  if (typeof rawObj.createdAt !== 'string') {
    status = 'repaired';
    warnings.push('Generated createdAt');
  }

  if (rawObj.resultText === '+1' || rawObj.resultText === '-1' || rawObj.resultText === '0') {
    event.resultText = rawObj.resultText;
  } else {
    status = 'repaired';
    warnings.push(`Repaired resultText from ${rawObj.resultText} to 0`);
  }

  if (rawObj.sportType) {
    event.sportType = getValidSportType(rawObj.sportType);
    if (event.sportType !== rawObj.sportType) {
      status = 'repaired';
      warnings.push(`Repaired sportType from ${rawObj.sportType}`);
    }
  }

  if (Array.isArray(rawObj.actions)) {
    for (const rawAction of rawObj.actions) {
      const { action, status: actionStatus, warnings: actionWarnings } = decodeAction(rawAction);
      event.actions.push(action);
      if (actionStatus === 'repaired' || actionStatus === 'rejected') {
        if (status === 'accepted') status = 'repaired'; // Only downgrade accepted to repaired
        warnings.push(...actionWarnings.map(w => `Action[${action.id}]: ${w}`));
      }
    }
  } else {
    status = 'repaired';
    warnings.push('Missing or invalid actions array, defaulted to []');
  }

  const copyString = (key: keyof EventRow) => {
    if (typeof rawObj[key] === 'string') {
      (event as any)[key] = rawObj[key];
    }
  };
  const copyNumber = (key: keyof EventRow) => {
    if (typeof rawObj[key] === 'number') {
      (event as any)[key] = rawObj[key];
    }
  };
  const copyBoolean = (key: keyof EventRow) => {
    if (typeof rawObj[key] === 'boolean') {
      (event as any)[key] = rawObj[key];
    }
  };

  copyString('thaiMeaningText');
  copyString('extendedEventText');
  copyString('videoSourceType');
  copyString('youtubeVideoId');
  copyString('videoId');
  copyString('videoUrl');
  copyString('localFileName');
  copyString('bookmarkNote');
  copyString('bookmarkedAt');
  copyString('note');
  copyString('rallyId');
  copyString('phaseType');

  copyBoolean('isBookmarked');

  const clampTime = (val: number, name: string) => {
    const clamped = Math.max(0, Math.min(86400, val));
    if (clamped !== val) {
      if (status === 'accepted') status = 'repaired';
      warnings.push(`Clamped ${name} to [0, 86400]`);
    }
    return clamped;
  };

  if (typeof rawObj.videoTime === 'number') event.videoTime = clampTime(rawObj.videoTime, 'videoTime');
  if (typeof rawObj.sequenceStartTime === 'number') event.sequenceStartTime = clampTime(rawObj.sequenceStartTime, 'sequenceStartTime');
  if (typeof rawObj.sequenceEndTime === 'number') event.sequenceEndTime = clampTime(rawObj.sequenceEndTime, 'sequenceEndTime');
  if (typeof rawObj.sequenceDuration === 'number') event.sequenceDuration = rawObj.sequenceDuration;
  if (typeof rawObj.duration === 'number') event.duration = rawObj.duration;
  if (typeof rawObj.clipStartTime === 'number') event.clipStartTime = clampTime(rawObj.clipStartTime, 'clipStartTime');
  if (typeof rawObj.clipEndTime === 'number') event.clipEndTime = clampTime(rawObj.clipEndTime, 'clipEndTime');
  if (typeof rawObj.previewStartTime === 'number') event.previewStartTime = clampTime(rawObj.previewStartTime, 'previewStartTime');
  if (typeof rawObj.previewEndTime === 'number') event.previewEndTime = clampTime(rawObj.previewEndTime, 'previewEndTime');

  if (typeof rawObj.scoreDelta === 'number') {
    event.scoreDelta = Math.max(-99, Math.min(99, rawObj.scoreDelta));
    if (event.scoreDelta !== rawObj.scoreDelta) {
      if (status === 'accepted') status = 'repaired';
      warnings.push('Clamped scoreDelta to [-99, 99]');
    }
  }

  if (rawObj.outcomeStatus) {
    if (['success', 'error', 'neutral', 'continued'].includes(rawObj.outcomeStatus)) {
      event.outcomeStatus = rawObj.outcomeStatus;
    } else {
      if (status === 'accepted') status = 'repaired';
      warnings.push('Invalid outcomeStatus stripped');
    }
  }

  return { event, status, warnings };
}

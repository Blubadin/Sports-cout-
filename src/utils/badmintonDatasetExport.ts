/**
 * badmintonDatasetExport.ts — Training Dataset Exporter (PDF §95)
 * Extracts paired temporal windows around manual scouting events:
 * [t - 0.5s, t + 0.5s] with videoTime, skillCode, player, court location,
 * result, and corresponding tracking/pose sequences for future ML training.
 */

import type { EventRow } from '../types';
import type { TrackingSample } from '../services/storage/trackingStorage';

export interface BadmintonDatasetInstance {
  eventId: string;
  videoTime: number;
  timeWindow: {
    startSec: number;
    endSec: number;
    durationSec: number;
  };
  manualSkillLabel: string;
  resultCode?: string;
  teamCode?: string;
  player?: string;
  courtLocation?: {
    gridX?: number;
    gridY?: number;
    pointX?: number;
    pointY?: number;
    areaCode?: string;
  };
  trackingSequence: TrackingSample[];
}

export interface BadmintonDatasetPayload {
  datasetVersion: '1.0';
  sport: 'badminton';
  exportedAt: string;
  totalInstances: number;
  skillDistribution: Record<string, number>;
  instances: BadmintonDatasetInstance[];
}

/**
 * Builds training dataset payload from manual scouting events and tracking samples.
 * Temporal window: [event.videoTime - windowBeforeSec, event.videoTime + windowAfterSec] (PDF §88, §95)
 */
export function buildBadmintonTrainingDataset(
  events: EventRow[],
  samples: TrackingSample[],
  windowBeforeSec = 0.5,
  windowAfterSec = 0.5
): BadmintonDatasetPayload {
  const instances: BadmintonDatasetInstance[] = [];
  const skillDistribution: Record<string, number> = {};

  for (const ev of events) {
    if (ev.sportType && ev.sportType !== 'badminton') continue;
    const t = ev.videoTime;
    if (t === undefined || t === null || t < 0) continue;

    const skillCode = ev.actions?.[0]?.skillCode || 'UNKNOWN';
    skillDistribution[skillCode] = (skillDistribution[skillCode] || 0) + 1;

    const startSec = Math.max(0, Number((t - windowBeforeSec).toFixed(3)));
    const endSec = Number((t + windowAfterSec).toFixed(3));

    // Extract tracking samples within temporal window
    const windowSamples = samples.filter(
      (s) => s.timestamp >= startSec && s.timestamp <= endSec
    );

    const action = ev.actions?.[0];

    instances.push({
      eventId: ev.id,
      videoTime: t,
      timeWindow: {
        startSec,
        endSec,
        durationSec: Number((endSec - startSec).toFixed(3)),
      },
      manualSkillLabel: skillCode,
      resultCode: action?.resultCode || ev.resultText,
      teamCode: action?.teamCode,
      player: action?.playerName || action?.playerNumber,
      courtLocation: action
        ? {
            gridX: action.gridX,
            gridY: action.gridY,
            pointX: action.pointX,
            pointY: action.pointY,
            areaCode: action.areaCode,
          }
        : undefined,
      trackingSequence: windowSamples,
    });
  }

  return {
    datasetVersion: '1.0',
    sport: 'badminton',
    exportedAt: new Date().toISOString(),
    totalInstances: instances.length,
    skillDistribution,
    instances,
  };
}

/**
 * Trigger browser download of the training dataset as a JSON file
 */
export function downloadBadmintonTrainingDataset(
  payload: BadmintonDatasetPayload,
  filename = 'badminton_ai_training_dataset.json'
): void {
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', filename);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

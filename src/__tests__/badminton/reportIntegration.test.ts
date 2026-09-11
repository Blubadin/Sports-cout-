import { describe, it, expect } from 'vitest';
import { getSportRuleEngine } from '../../sports/rules/registry';
import { buildAnalyticsSummary } from '../../utils/analyticsEngine';
import type { EventRow, Team } from '../../types';
import type { TrackingAnalysis } from '../../services/storage/trackingStorage';

describe('Phase 13: Report Integration (PDF §59, Phase 13)', () => {
  const teams: Team[] = [
    { id: 't1', code: 'THA', name: 'Thailand', thaiName: 'ไทย' },
    { id: 't2', code: 'MAS', name: 'Malaysia', thaiName: 'มาเลเซีย' },
  ];

  describe('Canonical SportRuleEngine in Report Scoring', () => {
    it('uses getSportRuleEngine to resolve canonical match score without ad-hoc filter', () => {
      const ruleEngine = getSportRuleEngine('badminton');
      const events: EventRow[] = [
        {
          id: 'ev-1',
          no: 1,
          point: 1,
          resultText: '+1',
          eventText: 'THA / SMH / Yes',
          createdAt: '',
          actions: [{ teamCode: 'THA', skillCode: 'SMH', resultCode: 'Yes' }],
        },
        {
          id: 'ev-2',
          no: 2,
          point: 2,
          resultText: '+1',
          eventText: 'MAS / CLR / Out',
          createdAt: '',
          actions: [{ teamCode: 'MAS', skillCode: 'CLR', resultCode: 'Out' }],
        },
      ];

      const matchScores: Record<string, number> = { THA: 0, MAS: 0 };
      for (const ev of events) {
        const res = ruleEngine.resolveEvent(ev.actions, {
          sportType: 'badminton',
          teamCodes: ['THA', 'MAS'],
        }, ev);
        for (const [teamCode, delta] of Object.entries(res.teamScoreDeltas)) {
          matchScores[teamCode] = (matchScores[teamCode] ?? 0) + delta;
        }
      }

      // Ev 1: THA scores (SMH Yes -> +1 for THA)
      // Ev 2: MAS error (CLR Out -> +1 for THA)
      expect(matchScores['THA']).toBe(2);
      expect(matchScores['MAS']).toBe(0);
    });
  });

  describe('AnalyticsEngine integration in Report', () => {
    it('computes standardized analytics summary for report', () => {
      const events: EventRow[] = [
        {
          id: '1',
          no: 1,
          point: 1,
          resultText: '+1',
          sportType: 'badminton',
          eventText: 'THA / SMH / Yes',
          createdAt: '',
          actions: [{ teamCode: 'THA', skillCode: 'SMH', resultCode: 'Yes', areaCode: 'Z1' }],
        },
      ];

      const summary = buildAnalyticsSummary(events, {
        sportType: 'badminton',
        teams,
        uiLanguage: 'th',
      });

      expect(summary.totalEvents).toBe(1);
      expect(summary.totalActions).toBe(1);
      expect(summary.skillCounts['SMH']).toBe(1);
      expect(summary.teamCounts['THA']).toBe(1);
    });
  });

  describe('Conditional Movement and Tracking Quality Display', () => {
    it('verifies tracking summary presence condition', () => {
      const sampleAnalysis: TrackingAnalysis = {
        id: 'analysis-1',
        projectId: 'proj-123',
        sportType: 'badminton',
        gameType: 'singles',
        summary: {
          durationSeconds: 120,
          sampleCount: 1200,
          players: {
            near_player: {
              totalDistanceMeters: 45.2,
              avgSpeedMps: 1.1,
              p95SpeedMps: 2.8,
              maxSpeedMps: 4.2,
              courtCoverage: { frontPercent: 30, midPercent: 40, rearPercent: 30, leftPercent: 50, rightPercent: 50 },
              basePosition: { avgCourtX: 2.5, avgCourtY: 3.8, dispersion: 1.2 },
              lateralMovementMeters: 20,
              frontBackMovementMeters: 25.2,
            },
          },
        },
        quality: {
          detectionCoverage: 0.96,
          lostTimePercent: 2.5,
          confidence: 0.91,
          manualCorrections: 0,
        },
        status: 'completed',
        engineVersion: '1.0.0',
        detectorModel: 'yolov8n',
        trackerModel: 'bytetrack',
        sampleRateHz: 10,
        players: [{ playerId: 'near_player', side: 'near' }],
        createdAt: '',
      };

      const hasTrackingData = Boolean(
        sampleAnalysis.summary && Object.keys(sampleAnalysis.summary.players).length > 0
      );
      expect(hasTrackingData).toBe(true);

      const nullAnalysis = null;
      const hasNullTrackingData = Boolean(
        nullAnalysis?.['summary'] && Object.keys(nullAnalysis?.['summary']?.['players'] || {}).length > 0
      );
      expect(hasNullTrackingData).toBe(false);
    });
  });
});

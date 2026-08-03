import type { EventRow, ScoutProject } from '../types';
import { buildAnalyticsSummary } from './analyticsEngine';

export type ReportConfig = {
  title: string;
  matchDate?: string;
  scouterName?: string;
  includePitchMap?: boolean;
  includeKeyMoments?: boolean;
};

export type MatchReportData = {
  projectTitle: string;
  sportType: string;
  totalEvents: number;
  teamAScore: number;
  teamBScore: number;
  teamAName: string;
  teamBName: string;
  earnedPointsTeamA: number;
  earnedPointsTeamB: number;
  keyMomentsCount: number;
  generatedAt: string;
};

export function generateMatchReportData(project: ScoutProject): MatchReportData {
  const summary = buildAnalyticsSummary(project.events || []);
  const teamA = project.teams[0];
  const teamB = project.teams[1];

  const teamAEarned = summary.derivedOutcomePoints.earnedByTeam[teamA?.code || ''] || 0;
  const teamBEarned = summary.derivedOutcomePoints.earnedByTeam[teamB?.code || ''] || 0;
  const keyMoments = (project.events || []).filter(e => e.isBookmarked);

  return {
    projectTitle: project.title,
    sportType: project.sportType,
    totalEvents: project.events?.length || 0,
    teamAScore: project.matchInfo.currentPoint || 0,
    teamBScore: 0,
    teamAName: teamA?.name || teamA?.code || 'Team A',
    teamBName: teamB?.name || teamB?.code || 'Team B',
    earnedPointsTeamA: teamAEarned,
    earnedPointsTeamB: teamBEarned,
    keyMomentsCount: keyMoments.length,
    generatedAt: new Date().toISOString(),
  };
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function finiteMetric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function formatGeneratedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleString();
}

export function printMatchReportHTML(reportData: MatchReportData): string {
  const projectTitle = escapeHtml(reportData.projectTitle);
  const sportType = escapeHtml(String(reportData.sportType ?? '').toUpperCase());
  const teamAName = escapeHtml(reportData.teamAName);
  const teamBName = escapeHtml(reportData.teamBName);
  const generatedAt = escapeHtml(formatGeneratedAt(reportData.generatedAt));
  const earnedPointsTeamA = finiteMetric(reportData.earnedPointsTeamA);
  const earnedPointsTeamB = finiteMetric(reportData.earnedPointsTeamB);
  const totalEvents = finiteMetric(reportData.totalEvents);
  const keyMomentsCount = finiteMetric(reportData.keyMomentsCount);

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>SPORTSCOUT Match Report - ${projectTitle}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 2rem; color: #111; }
          h1 { color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 0.5rem; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 8px; }
          .metric-val { font-size: 1.5rem; font-weight: bold; color: #0f172a; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <h1>SPORTSCOUT Match Summary Report</h1>
        <p><strong>Project:</strong> ${projectTitle} (${sportType})</p>
        <p><strong>Generated:</strong> ${generatedAt}</p>
        
        <div class="grid">
          <div class="card">
            <h3>${teamAName}</h3>
            <div class="metric-val">Earned Points: ${earnedPointsTeamA}</div>
          </div>
          <div class="card">
            <h3>${teamBName}</h3>
            <div class="metric-val">Earned Points: ${earnedPointsTeamB}</div>
          </div>
        </div>

        <div class="card" style="margin-top: 1rem;">
          <h3>Match Overview</h3>
          <p>Total Events Logged: <strong>${totalEvents}</strong></p>
          <p>Key Moments (Bookmarked): <strong>${keyMomentsCount}</strong></p>
        </div>
      </body>
    </html>
  `;
}

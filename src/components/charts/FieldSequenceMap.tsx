import React, { useMemo } from 'react';
import { Action, EventRow, SportType } from '../../types';
import { SPORT_TEMPLATES } from '../../sports';
import { useScoutContext } from '../../context/ScoutContext';
import { Play } from 'lucide-react';
import { formatPreciseTime } from '../../utils';
import {
  formatActionMeaning,
  getAreaLabel as getScoutAreaLabel,
  getFoulLabel as getScoutFoulLabel,
} from '../../utils/scoutData';

type FieldSequenceMapProps = {
  sportType: SportType;
  events: EventRow[];
  selectedEventId?: string;
  mode: 'heatmap' | 'sequence' | 'result';
  teamFilter?: string;
  skillFilter?: string;
  resultFilter?: string;
  teamAName?: string;
  teamBName?: string;
  onEventClick?: (event: EventRow, action: Action) => void;
  onGoToVideoTime?: (videoTime: number) => void;
};

// Map components for each sport
const VolleyballField = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full max-w-[700px] bg-sky-950/40 dark:bg-sky-950/20 rounded-xl p-8 sm:p-12 mx-auto flex items-center justify-center my-4">
    <div className="absolute inset-2 sm:inset-4 border-2 border-dashed border-white/20 rounded-lg flex items-start justify-start p-2 pointer-events-none">
      <span className="text-white/30 text-xs font-bold uppercase tracking-widest">Out of Bounds</span>
    </div>
    <div className="relative w-full aspect-[2/1] bg-[#f0bd7e] border-4 border-white shadow-xl">
      {/* Midline / Net */}
      <div className="absolute top-0 bottom-0 left-1/2 w-2 bg-white -translate-x-1/2 z-0 shadow-sm" />
      <div className="absolute top-[-10%] bottom-[-10%] left-1/2 w-4 bg-gray-800 -translate-x-1/2 z-10 opacity-30" />
      
      {/* 3m lines */}
      <div className="absolute top-0 bottom-0 left-[33.3%] w-1 bg-white opacity-70" />
      <div className="absolute top-0 bottom-0 right-[33.3%] w-1 bg-white opacity-70" />
      
      {children}
    </div>
  </div>
);

const FootballField = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full max-w-[500px] bg-green-950/40 dark:bg-green-950/20 rounded-xl p-8 sm:p-12 mx-auto flex items-center justify-center my-4">
    <div className="absolute inset-2 sm:inset-4 border-2 border-dashed border-white/20 rounded-lg flex items-start justify-start p-2 pointer-events-none">
      <span className="text-white/30 text-xs font-bold uppercase tracking-widest">Out of Bounds</span>
    </div>
    <div className="relative w-full aspect-[2/3] bg-green-600 border-4 border-white shadow-xl">
      <div className="absolute top-1/2 left-0 right-0 h-1 bg-white opacity-60" />
      <div className="absolute top-1/2 left-1/2 w-16 h-16 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 opacity-60" />
      <div className="absolute top-0 left-1/4 right-1/4 h-1/6 border-2 border-white opacity-60" />
      <div className="absolute bottom-0 left-1/4 right-1/4 h-1/6 border-2 border-white opacity-60" />
      {children}
    </div>
  </div>
);

const BadmintonField = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full max-w-[400px] bg-sky-950/40 dark:bg-sky-950/20 rounded-xl p-8 sm:p-12 mx-auto flex items-center justify-center my-4">
    <div className="absolute inset-2 sm:inset-4 border-2 border-dashed border-white/20 rounded-lg flex items-start justify-start p-2 pointer-events-none">
      <span className="text-white/30 text-xs font-bold uppercase tracking-widest">Out of Bounds</span>
    </div>
    <div className="relative w-full aspect-[1/2.2] bg-[#3a8b64] border-4 border-white shadow-xl">
      <div className="absolute top-1/2 left-0 right-0 h-2 bg-white -translate-y-1/2 shadow-sm" />
      <div className="absolute top-[40%] left-0 right-0 h-1 bg-white opacity-70" />
      <div className="absolute bottom-[40%] left-0 right-0 h-1 bg-white opacity-70" />
      <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-white -translate-x-1/2 opacity-70" />
      <div className="absolute top-0 bottom-0 left-[10%] w-1 bg-white opacity-70" />
      <div className="absolute top-0 bottom-0 right-[10%] w-1 bg-white opacity-70" />
      {children}
    </div>
  </div>
);

const BasketballField = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full max-w-[400px] bg-amber-900/20 dark:bg-amber-900/10 rounded-xl p-8 sm:p-12 mx-auto flex items-center justify-center my-4">
    <div className="absolute inset-2 sm:inset-4 border-2 border-dashed border-white/20 rounded-lg flex items-start justify-start p-2 pointer-events-none">
      <span className="text-white/30 text-xs font-bold uppercase tracking-widest">Out of Bounds</span>
    </div>
    <div className="relative w-full aspect-[1/1.9] bg-[#dd9f60] border-4 border-white shadow-xl">
      <div className="absolute top-1/2 left-0 right-0 h-1 bg-white opacity-60" />
      <div className="absolute top-1/2 left-1/2 w-16 h-16 rounded-full border-4 border-white -translate-x-1/2 -translate-y-1/2 opacity-60" />
      
      {/* Top half */}
      <div className="absolute top-0 left-1/2 w-[32%] h-[19%] border-4 border-white -translate-x-1/2" />
      <div className="absolute top-0 left-1/2 w-[60%] aspect-square border-4 border-white rounded-full -translate-x-1/2" />
      <div className="absolute top-[2.5%] left-1/2 w-[10%] h-[1%] bg-red-700 -translate-x-1/2 shadow-sm" />
      <div className="absolute top-[4%] left-1/2 w-3 h-3 border-2 border-red-700 rounded-full -translate-x-1/2 bg-transparent z-10" />

      {/* Bottom half */}
      <div className="absolute bottom-0 left-1/2 w-[32%] h-[19%] border-4 border-white -translate-x-1/2" />
      <div className="absolute bottom-0 left-1/2 w-[60%] aspect-square border-4 border-white rounded-full -translate-x-1/2" />
      <div className="absolute bottom-[2.5%] left-1/2 w-[10%] h-[1%] bg-red-700 -translate-x-1/2 shadow-sm" />
      <div className="absolute bottom-[4%] left-1/2 w-3 h-3 border-2 border-red-700 rounded-full -translate-x-1/2 bg-transparent z-10" />
      {children}
    </div>
  </div>
);

const SPORT_COMPONENTS: Record<SportType, React.FC<any>> = {
  volleyball: VolleyballField,
  football: FootballField,
  badminton: BadmintonField,
  basketball: BasketballField,
};

// Area coordinates mappings (percentage based)
const AREA_COORDS: Record<SportType, Record<string, { top: number, left: number }>> = {
  volleyball: {
    'LN': { top: 40, left: 20 },
    'CN': { top: 40, left: 50 },
    'RN': { top: 40, left: 80 },
    'LB': { top: 75, left: 20 },
    'CB': { top: 75, left: 50 },
    'RB': { top: 75, left: 80 },
    'OUT': { top: 108, left: 50 },
    'LONG_OUT': { top: 110, left: 50 },
    'SIDE_OUT': { top: 50, left: -6 },
    'NET_ERR': { top: 50, left: 50 },
    'UNKNOWN': { top: 50, left: 50 },
    // Detailed out zones
    'long_out_opp': { top: -8, left: 50 },
    'side_out_left_opp': { top: 25, left: -6 },
    'side_out_right_opp': { top: 25, left: 106 },
    'long_out_own': { top: 108, left: 50 },
    'side_out_left_own': { top: 75, left: -6 },
    'side_out_right_own': { top: 75, left: 106 },
  },
  football: {
    'ATT_L': { top: 20, left: 20 },
    'ATT_C': { top: 20, left: 50 },
    'ATT_R': { top: 20, left: 80 },
    'MID_L': { top: 50, left: 20 },
    'MID_C': { top: 50, left: 50 },
    'MID_R': { top: 50, left: 80 },
    'DEF_L': { top: 80, left: 20 },
    'DEF_C': { top: 80, left: 50 },
    'DEF_R': { top: 80, left: 80 },
    'BOX': { top: 10, left: 50 },
    'GOAL': { top: 5, left: 50 },
    'OUT': { top: 108, left: 50 },
    'UNKNOWN': { top: 50, left: 50 },
    // Detailed out zones
    'opp_endline': { top: -8, left: 50 },
    'left_touchline_mid': { top: 50, left: -6 },
    'right_touchline_mid': { top: 50, left: 106 },
    'own_endline': { top: 108, left: 50 },
  },
  badminton: {
    'NET': { top: 48, left: 50 },
    'FL': { top: 60, left: 25 },
    'FC': { top: 60, left: 50 },
    'FR': { top: 60, left: 75 },
    'ML': { top: 75, left: 25 },
    'MC': { top: 75, left: 50 },
    'MR': { top: 75, left: 75 },
    'BL': { top: 90, left: 25 },
    'BC': { top: 90, left: 50 },
    'BR': { top: 90, left: 75 },
    'OUT': { top: 108, left: 50 },
    'NET_ERR': { top: 50, left: 50 },
    'UNKNOWN': { top: 50, left: 50 },
    // Detailed out zones
    'opp_back_out': { top: -8, left: 50 },
    'side_left': { top: 50, left: -6 },
    'side_right': { top: 50, left: 106 },
    'own_back_out': { top: 108, left: 50 },
  },
  basketball: {
    'HOOP': { top: 7.5, left: 50 },
    'PAINT': { top: 15, left: 50 },
    'LEFT_WING': { top: 25, left: 20 },
    'TOP_KEY': { top: 35, left: 50 },
    'RIGHT_WING': { top: 25, left: 80 },
    'LEFT_CORNER': { top: 7.5, left: 10 },
    'RIGHT_CORNER': { top: 7.5, left: 90 },
    'MID_RANGE': { top: 22.5, left: 50 },
    'THREE_PT': { top: 42.5, left: 50 },
    'OUT': { top: 108, left: 50 },
    'UNKNOWN': { top: 50, left: 50 },
    // Detailed out zones
    'endline': { top: -8, left: 50 },
    'left_sideline': { top: 50, left: -6 },
    'right_sideline': { top: 50, left: 106 },
    'baseline_left': { top: 108, left: 25 },
    'baseline_right': { top: 108, left: 75 },
  }
};

const hashString = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
};

const getAreaPrecisionLabel = (action: Action) => {
  if (action.pointX !== undefined && action.pointY !== undefined) return 'Point';
  if (action.outZone || action.areaResolution === 'out-zone') return 'Out';
  if (action.areaMode === 'detailed' || action.areaResolution === 'detailed' || action.areaCode?.includes('-')) return 'Detailed';
  if (action.areaCode) return 'Zone';
  return 'Unknown';
};

export default function FieldSequenceMap({ 
  sportType, events, selectedEventId, mode, 
  teamFilter, skillFilter, resultFilter, 
  teamAName, teamBName,
  onEventClick,
  onGoToVideoTime,
}: FieldSequenceMapProps) {
  const { setPreviewState, settings, teams } = useScoutContext();
  const [selectedAreaGroup, setSelectedAreaGroup] = React.useState<{ key: string; label: string; actions: any[] } | null>(null);
  const sportTemplate = SPORT_TEMPLATES[sportType];
  
  const filteredEvents = useMemo(() => {
    return events.filter(e => e.sportType === sportType && (!selectedEventId || e.id === selectedEventId));
  }, [events, sportType, selectedEventId]);

  const mapData = useMemo(() => {
    const data: any[] = [];
    let sequenceIndex = 1;

    filteredEvents.forEach((e, eIdx) => {
      e.actions?.forEach((a, aIdx) => {
        if (teamFilter && a.teamCode !== teamFilter && teamFilter !== 'ALL') return;
        if (skillFilter && a.skillCode !== skillFilter && skillFilter !== 'ALL') return;
        if (resultFilter && a.resultCode !== resultFilter && resultFilter !== 'ALL') return;

        let coords = { top: 50, left: 50 };

        // 1. Point tap:
        if (a.pointX !== undefined && a.pointY !== undefined) {
          const clamp = (val: number) => Math.max(0, Math.min(1, val));
          coords = { top: clamp(a.pointY) * 100, left: clamp(a.pointX) * 100 };
        }
        // 2. Out Zone:
        else if (a.outZone) {
          const zone = a.outZone;
          if (sportType === 'volleyball') {
            if (zone === 'side_left_near') coords = { top: 75, left: -10 };
            else if (zone === 'side_left_far') coords = { top: 25, left: -10 };
            else if (zone === 'side_right_near') coords = { top: 75, left: 110 };
            else if (zone === 'side_right_far') coords = { top: 25, left: 110 };
            else if (zone === 'back_left') coords = { top: 110, left: 20 };
            else if (zone === 'back_right') coords = { top: 110, left: 80 };
            else if (zone === 'opp_back_left') coords = { top: -10, left: 20 };
            else if (zone === 'opp_back_right') coords = { top: -10, left: 80 };
            else if (zone === 'net_error' || zone === 'net_err') coords = { top: 50, left: 50 };
            else coords = AREA_COORDS['volleyball']?.[zone] || { top: 110, left: 50 };
          } else if (sportType === 'football') {
            if (zone === 'left_touchline_def') coords = { top: 80, left: -10 };
            else if (zone === 'left_touchline_mid') coords = { top: 50, left: -10 };
            else if (zone === 'left_touchline_att') coords = { top: 20, left: -10 };
            else if (zone === 'right_touchline_def') coords = { top: 80, left: 110 };
            else if (zone === 'right_touchline_mid') coords = { top: 50, left: 110 };
            else if (zone === 'right_touchline_att') coords = { top: 20, left: 110 };
            else if (zone === 'own_endline' || zone === 'goal_kick') coords = { top: 110, left: 50 };
            else if (zone === 'opp_endline') coords = { top: -10, left: 50 };
            else if (zone === 'corner_left') coords = { top: -5, left: -5 };
            else if (zone === 'corner_right') coords = { top: -5, left: 105 };
            else coords = AREA_COORDS['football']?.[zone] || { top: 110, left: 50 };
          } else if (sportType === 'badminton') {
            if (zone === 'opp_back_out') coords = { top: -10, left: 50 };
            else if (zone === 'own_back_out') coords = { top: 110, left: 50 };
            else if (zone === 'side_left' || zone === 'side_left_near') coords = { top: 75, left: -10 };
            else if (zone === 'side_left_far') coords = { top: 25, left: -10 };
            else if (zone === 'side_right' || zone === 'side_right_near') coords = { top: 75, left: 110 };
            else if (zone === 'side_right_far') coords = { top: 25, left: 110 };
            else if (zone === 'back_left') coords = { top: 110, left: 25 };
            else if (zone === 'back_right') coords = { top: 110, left: 75 };
            else coords = AREA_COORDS['badminton']?.[zone] || { top: 110, left: 50 };
          } else if (sportType === 'basketball') {
            if (zone === 'endline') coords = { top: -10, left: 50 };
            else if (zone === 'left_sideline') coords = { top: 50, left: -10 };
            else if (zone === 'right_sideline') coords = { top: 50, left: 110 };
            else if (zone === 'baseline_left') coords = { top: 110, left: 20 };
            else if (zone === 'baseline_right') coords = { top: 110, left: 80 };
            else coords = AREA_COORDS['basketball']?.[zone] || { top: 110, left: 50 };
          } else {
            coords = { top: 110, left: 50 };
          }
        }
        // 3. Detailed grid / areaCode with detailed layout:
        else if (a.areaMode === 'detailed' || (a.areaCode && a.areaCode.includes('-'))) {
          if (sportType === 'football' && a.areaCode?.startsWith('F-')) {
            const [, r, c] = a.areaCode.split('-');
            coords = { 
              top: (parseInt(r, 10) + 0.5) * (100 / 4), 
              left: (parseInt(c, 10) + 0.5) * (100 / 4) 
            };
          } else if (sportType === 'volleyball') {
            const code = a.areaCode || '';
            const baseCode = code.split('-')[0];
            const subGrid = code.split('-')[1];
            
            const isTeamA = a.courtSide === 'teamA';
            const isTeamB = a.courtSide === 'teamB';
            
            if (['LN', 'CN', 'RN', 'LB', 'CB', 'RB'].includes(baseCode) && (isTeamA || isTeamB)) {
              let top = 50;
              let left = 50;
              
              if (['LN', 'CN', 'RN'].includes(baseCode)) top = 25;
              if (['LB', 'CB', 'RB'].includes(baseCode)) top = 75;
              
              if (isTeamA) {
                if (['LN', 'LB'].includes(baseCode)) left = 16;
                if (['CN', 'CB'].includes(baseCode)) left = 33;
                if (['RN', 'RB'].includes(baseCode)) left = 45;
              } else {
                if (['RN', 'RB'].includes(baseCode)) left = 55;
                if (['CN', 'CB'].includes(baseCode)) left = 67;
                if (['LN', 'LB'].includes(baseCode)) left = 84;
              }
              
              if (subGrid) {
                const subIdx = parseInt(subGrid, 10);
                if (subIdx === 1) { top -= 10; left -= 5; }
                if (subIdx === 2) { top -= 10; left += 5; }
                if (subIdx === 3) { top += 10; left -= 5; }
                if (subIdx === 4) { top += 10; left += 5; }
              }
              
              coords = { top, left };
            } else {
              coords = AREA_COORDS[sportType]?.[a.areaCode || ''] || { top: 50, left: 50 };
            }
          } else {
            if (a.gridX !== undefined && a.gridY !== undefined) {
              coords = {
                top: (a.gridY + 0.5) * 25,
                left: (a.gridX + 0.5) * 25
              };
            } else {
              coords = AREA_COORDS[sportType]?.[a.areaCode || ''] || { top: 50, left: 50 };
            }
          }
        }
        // 4. Standard areaCode fallback:
        else {
          let targetArea = a.areaCode || '';
          if (targetArea === 'THREE_POINT') targetArea = 'THREE_PT';
          if (['OUT', 'SIDE_OUT', 'LONG_OUT'].includes(targetArea)) {
            coords = AREA_COORDS[sportType]?.[targetArea] || { top: 108, left: 50 };
          } else {
            coords = AREA_COORDS[sportType]?.[targetArea] || { top: 50, left: 50 };
          }
        }

        // Apply courtSide reflection for full pitch sports (football, basketball)
        if ((sportType === 'football' || sportType === 'basketball') && a.courtSide === 'teamB') {
          coords = {
            top: 100 - coords.top,
            left: 100 - coords.left
          };
        }

        const idHash = Math.abs(hashString(a.id || `${eIdx}-${aIdx}`));
        const topJitter = (idHash % 10) - 5;
        const leftJitter = ((idHash >> 4) % 10) - 5;
        
        data.push({
          ...a,
          eventId: e.id,
          videoTime: e.videoTime,
          coords,
          areaLabel: getScoutAreaLabel(a, { sportTemplate, uiLanguage: settings.uiLanguage }),
          foulLabel: getScoutFoulLabel(a, { sportTemplate, uiLanguage: settings.uiLanguage }),
          displayText: formatActionMeaning(a, { sportTemplate, teams, uiLanguage: settings.uiLanguage }),
          precision: getAreaPrecisionLabel(a),
          jitter: { top: topJitter * 0.4, left: leftJitter * 0.4 },
          sequence: sequenceIndex++
        });
      });
    });
    return data;
  }, [filteredEvents, teamFilter, skillFilter, resultFilter, sportType, sportTemplate, settings.uiLanguage, teams]);

  const FieldComponent = SPORT_COMPONENTS[sportType];

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="coach-panel-flat flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-500" />
          <span>{teamAName || 'Team A'}</span>
          <span className="h-2 w-2 rounded-full bg-orange-500 ml-2" />
          <span>{teamBName || 'Team B'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-green-500/15 px-2 py-1 text-green-700 dark:text-green-300">Yes</span>
          <span className="rounded-full bg-red-500/15 px-2 py-1 text-red-700 dark:text-red-300">Out</span>
          <span className="rounded-full bg-amber-500/15 px-2 py-1 text-amber-700 dark:text-amber-300">Foul</span>
          <span className="rounded-full bg-slate-500/15 px-2 py-1 text-slate-600 dark:text-slate-300">Precision: Point / Detailed / Zone</span>
        </div>
      </div>
      <div className="relative w-full flex flex-col justify-center items-center">
        {(teamAName || teamBName) && (
          <div className="flex gap-4 text-xs font-bold mb-1 mt-2 bg-white dark:bg-gray-800 px-3 py-1.5 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
            {teamAName && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-500 shadow-sm border border-white dark:border-gray-800"></span> <span className="text-gray-700 dark:text-gray-300">{teamAName}</span></div>}
            {teamBName && <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-orange-500 shadow-sm border border-white dark:border-gray-800"></span> <span className="text-gray-700 dark:text-gray-300">{teamBName}</span></div>}
          </div>
        )}
        <FieldComponent>
          {mode === 'heatmap' && (() => {
            const groups = new Map<string, { count: number, top: number, left: number, label: string, actions: any[], teamCode?: string }>();
            
            mapData.forEach(d => {
              let groupKey = '';
              let groupLabel = '';
              const teamId = d.teamCode || '';
              
              if (d.pointX !== undefined && d.pointY !== undefined) {
                const rx = Math.round(d.pointX * 20) / 20; // group close points
                const ry = Math.round(d.pointY * 20) / 20;
                groupKey = `point-${rx}-${ry}-${teamId}`;
                groupLabel = d.areaLabel || `Point (${d.pointX.toFixed(2)}, ${d.pointY.toFixed(2)})`;
              } else if (d.outZone) {
                groupKey = `out-${d.outZone}-${teamId}`;
                groupLabel = d.areaLabel || d.outZone;
              } else if (d.areaCode) {
                groupKey = d.courtSide ? `${d.courtSide}:${d.areaCode}-${teamId}` : `${d.areaCode}-${teamId}`;
                groupLabel = d.areaLabel || d.areaCode;
              } else {
                groupKey = `unknown-${teamId}`;
                groupLabel = 'Unknown Area';
              }

              if (!groups.has(groupKey)) {
                groups.set(groupKey, { count: 0, top: d.coords.top, left: d.coords.left, label: groupLabel, actions: [], teamCode: teamId });
              }
              const g = groups.get(groupKey)!;
              g.count += 1;
              g.actions.push(d);
            });

            return Array.from(groups.entries()).map(([key, g]) => {
              const intensity = Math.min(g.count / 5, 1);
              const isOutZone = key.startsWith('out-') || g.actions.some(a => !!a.outZone || a.resultCode === 'Out');
              
              const ringClass = isOutZone ? 'ring-2 ring-yellow-400 ring-offset-1' : g.actions.some(a => a.resultCode === 'Out') ? 'ring-2 ring-yellow-400 ring-offset-1' : '';
              let colorClass = isOutZone ? 'bg-amber-500' : 'bg-gray-500';
              if (!isOutZone) {
                 if (g.teamCode === teamAName) {
                    colorClass = 'bg-sky-500';
                 } else if (g.teamCode === teamBName) {
                    colorClass = 'bg-orange-500';
                 } else {
                    colorClass = 'bg-red-500';
                 }
              }

              let offsetLeft = 0;
              if (g.teamCode === teamAName) offsetLeft = -10;
              else if (g.teamCode === teamBName) offsetLeft = 10;

              const precision = g.actions[0]?.precision || 'Unknown';
              const displayLabel = `${g.label} (${precision}) [${g.teamCode || 'No Team'}]`;

              return (
                <div 
                  key={key}
                  className={`absolute rounded-full ${colorClass} flex items-center justify-center text-white text-xs font-bold hover:scale-110 transition-transform ${ringClass}`}
                  style={{
                    top: `calc(${g.top}% - 15px)`,
                    left: `calc(${g.left}% + ${offsetLeft}px - 15px)`,
                    width: '30px',
                    height: '30px',
                    opacity: 0.45 + (intensity * 0.55),
                    cursor: 'pointer'
                  }}
                  title={`${displayLabel}: ${g.count} actions`}
                  onClick={() => setSelectedAreaGroup({ key, label: g.label, actions: g.actions })}
                >
                  {g.count}
                </div>
              );
            });
          })()}

          {mode === 'sequence' && !selectedEventId && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/5 z-30">
              <span className="bg-white px-3 py-1.5 rounded-lg shadow-sm text-xs font-medium text-gray-500 border border-gray-200">
                เลือก Event ในตารางเพื่อดู Sequence
              </span>
            </div>
          )}
          {mode === 'sequence' && selectedEventId && mapData.map((d, i) => {
            const isFoul = !!d.foulCode;
            let sequenceColorClass = 'bg-gray-500';
            if (d.teamCode === teamAName) sequenceColorClass = 'bg-sky-500';
            else if (d.teamCode === teamBName) sequenceColorClass = 'bg-orange-500';
            
            if (isFoul) {
              sequenceColorClass = d.foulSeverity === 'card' ? 'bg-red-600' : 'bg-amber-500';
            }

            const timeLabel = d.videoTime !== undefined ? formatPreciseTime(d.videoTime) : '-';
            let tooltip = `${d.displayText || `${d.teamCode} - ${d.skillCode}`} | ${d.resultCode || '-'} | ${d.areaLabel || d.outZone || d.areaCode || '-'} | ${d.precision} | ${timeLabel}`;
            if (isFoul) {
              tooltip = `[FOUL] Team: ${d.teamCode}, Code: ${d.foulCode}, Label: ${d.foulLabel || d.foulCode}, Area: ${d.areaLabel || d.outZone || d.areaCode || '-'}, Time: ${timeLabel}`;
            }

            return (
            <React.Fragment key={i}>
              {i > 0 && d.eventId === mapData[i-1].eventId && (
                <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 10 }}>
                  <line 
                    x1={`${mapData[i-1].coords.left}%`} 
                    y1={`${mapData[i-1].coords.top}%`} 
                    x2={`${d.coords.left}%`} 
                    y2={`${d.coords.top}%`} 
                    stroke="rgba(0,0,0,0.4)" 
                    strokeWidth="2" 
                    strokeDasharray="4"
                  />
                </svg>
              )}
              <div 
                className={`absolute rounded-full ${sequenceColorClass} text-white text-xs font-bold flex items-center justify-center shadow-md z-20 cursor-pointer hover:scale-125 transition-transform ${isFoul ? 'ring-2 ring-red-500 ring-offset-1 animate-pulse' : ''}`}
                style={{
                  top: `${d.coords.top}%`,
                  left: `${d.coords.left}%`,
                  width: '20px',
                  height: '20px',
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={() => onEventClick && onEventClick(filteredEvents.find(e => e.id === d.eventId)!, d)}
                onDoubleClick={() => d.videoTime !== undefined && onGoToVideoTime?.(d.videoTime)}
                title={tooltip}
              >
                {isFoul ? '!' : d.sequence}
              </div>
            </React.Fragment>
          )})}

          {mode === 'result' && mapData.map((d, i) => {
            const isFoul = !!d.foulCode;
            const color = isFoul 
              ? (d.foulSeverity === 'card' ? 'bg-red-600' : 'bg-amber-500') 
              : d.resultCode === 'Yes' 
                ? 'bg-green-500' 
                : d.outZone 
                  ? 'bg-amber-500' 
                  : d.resultCode === 'Out' 
                    ? 'bg-red-500' 
                    : 'bg-gray-500';

            let ringColor = 'ring-gray-400';
            if (d.teamCode === teamAName) ringColor = 'ring-sky-500';
            else if (d.teamCode === teamBName) ringColor = 'ring-orange-500';
            
            const timeLabel = d.videoTime !== undefined ? formatPreciseTime(d.videoTime) : '-';
            let tooltip = `${d.displayText || `${d.teamCode} - ${d.skillCode}`} | ${d.resultCode || '-'} | ${d.areaLabel || d.outZone || d.areaCode || '-'} | ${d.precision} | ${timeLabel}`;
            if (isFoul) {
              tooltip = `[FOUL] Team: ${d.teamCode}, Code: ${d.foulCode}, Label: ${d.foulLabel || d.foulCode}, Area: ${d.areaLabel || d.outZone || d.areaCode || '-'}, Time: ${timeLabel}`;
            }

            return (
              <div 
                key={i}
                className={`absolute rounded-full ${color} ring-2 ring-offset-1 ${ringColor} shadow-sm z-10 ${isFoul ? 'opacity-100 animate-pulse scale-125' : 'opacity-70'} cursor-pointer hover:opacity-100 hover:scale-150 transition-all`}
                style={{
                  top: `${d.coords.top + d.jitter.top}%`,
                  left: `${d.coords.left + d.jitter.left}%`,
                  width: isFoul ? '16px' : '12px',
                  height: isFoul ? '16px' : '12px',
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={() => onEventClick && onEventClick(filteredEvents.find(e => e.id === d.eventId)!, d)}
                onDoubleClick={() => d.videoTime !== undefined && onGoToVideoTime?.(d.videoTime)}
                title={tooltip}
              >
                {isFoul && (
                  <span className="text-[9px] font-bold text-white flex items-center justify-center h-full w-full">!</span>
                )}
              </div>
            )
          })}
        </FieldComponent>
      </div>
      
      {/* Detail Panel */}
      {selectedAreaGroup && mode === 'heatmap' && (
        <div className="coach-panel p-4 mt-2 text-sm">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-gray-800 dark:text-gray-100">
              Area: {selectedAreaGroup.label}
              {selectedAreaGroup.actions[0]?.precision && ` (${selectedAreaGroup.actions[0].precision})`}
            </h4>
            <button onClick={() => setSelectedAreaGroup(null)} className="text-gray-400 hover:text-gray-600">&times;</button>
          </div>
          {(() => {
            const areaActions = selectedAreaGroup.actions;
            const total = areaActions.length;
            const skillCounts = areaActions.reduce((acc: Record<string, number>, curr) => {
              acc[curr.skillCode || ''] = (acc[curr.skillCode || ''] || 0) + 1;
              return acc;
            }, {});
            const topSkill = Object.entries(skillCounts).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || '-';
            
            const teamCounts = areaActions.reduce((acc: Record<string, number>, curr) => {
              acc[curr.teamCode || ''] = (acc[curr.teamCode || ''] || 0) + 1;
              return acc;
            }, {});
            const topTeam = Object.entries(teamCounts).sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] || '-';
            
            const yes = areaActions.filter(a => a.resultCode === 'Yes').length;
            const out = areaActions.filter(a => a.resultCode === 'Out').length;
            const pass = areaActions.filter(a => a.resultCode === 'Pass').length;

            return (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-gray-500 text-xs">Total Actions</div>
                    <div className="font-bold text-lg">{total}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Top Skill</div>
                    <div className="font-bold">{topSkill}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Top Team</div>
                    <div className="font-bold">{topTeam}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 text-xs">Result Breakdown</div>
                    <div className="flex gap-2 text-xs font-bold">
                      <span className="text-green-600">Yes: {yes}</span>
                      <span className="text-red-600">Out: {out}</span>
                      <span className="text-gray-600">Pass: {pass}</span>
                    </div>
                  </div>
                </div>
                
                <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                  <div className="text-xs font-bold text-gray-500 mb-2">Events ({areaActions.length})</div>
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
                    {areaActions.map((a, i) => {
                      const evt = events.find(e => e.id === a.eventId);
                      if (!evt) return null;
                      return (
                        <div key={`${a.id}-${i}`} className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg text-xs">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">#{evt.no} {a.skillCode || a.foulCode || 'Action'} <span className="ml-1 rounded bg-slate-200/70 dark:bg-slate-600/70 px-1.5 py-0.5 text-[10px]">{a.precision}</span></span>
                            <span className="text-gray-500">{a.displayText || evt.eventText}</span>
                            {a.videoTime !== undefined && <span className="text-gray-400">{formatPreciseTime(a.videoTime)}</span>}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            {a.videoTime !== undefined && onGoToVideoTime && (
                              <button
                                onClick={() => onGoToVideoTime(a.videoTime)}
                                className="p-1.5 rounded-md bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                                title="Jump to video time"
                              >
                                {formatPreciseTime(a.videoTime)}
                              </button>
                            )}
                            <button 
                              onClick={() => setPreviewState({ isActive: true, eventRow: evt, loop: true })}
                              className="p-1.5 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-600 hover:bg-sky-100 dark:hover:bg-sky-900/50 transition-colors flex items-center gap-1"
                              title="Replay Sequence"
                            >
                              <Play size={12} className="fill-current" />
                              Replay
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

import React, { useMemo } from 'react';
import { Action, EventRow, SportType } from '../../types';

type FieldSequenceMapProps = {
  sportType: SportType;
  events: EventRow[];
  selectedEventId?: string;
  mode: 'heatmap' | 'sequence' | 'result';
  teamFilter?: string;
  skillFilter?: string;
  resultFilter?: string;
  onEventClick?: (event: EventRow, action: Action) => void;
  onGoToVideoTime?: (videoTime: number) => void;
};

// Map components for each sport
const VolleyballField = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full max-w-[600px] aspect-[2/1] bg-[#f0bd7e] border-4 border-white mx-auto overflow-hidden">
    {/* Midline / Net */}
    <div className="absolute top-0 bottom-0 left-1/2 w-2 bg-white -translate-x-1/2 z-0 shadow-sm" />
    <div className="absolute top-[-10%] bottom-[-10%] left-1/2 w-4 bg-gray-800 -translate-x-1/2 z-10 opacity-30" />
    
    {/* 3m lines */}
    <div className="absolute top-0 bottom-0 left-[33.3%] w-1 bg-white opacity-70" />
    <div className="absolute top-0 bottom-0 right-[33.3%] w-1 bg-white opacity-70" />
    
    {children}
  </div>
);

const FootballField = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full max-w-[400px] aspect-[2/3] bg-emerald-600 border-4 border-white mx-auto overflow-hidden">
    <div className="absolute top-1/2 left-0 right-0 h-1 bg-white opacity-60" />
    <div className="absolute top-1/2 left-1/2 w-16 h-16 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 opacity-60" />
    <div className="absolute top-0 left-1/4 right-1/4 h-1/6 border-2 border-white opacity-60" />
    <div className="absolute bottom-0 left-1/4 right-1/4 h-1/6 border-2 border-white opacity-60" />
    {children}
  </div>
);

const BadmintonField = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full max-w-[400px] aspect-[1/2.2] bg-[#3a8b64] border-4 border-white mx-auto overflow-hidden">
    <div className="absolute top-1/2 left-0 right-0 h-2 bg-white -translate-y-1/2 shadow-sm" />
    <div className="absolute top-[40%] left-0 right-0 h-1 bg-white opacity-70" />
    <div className="absolute bottom-[40%] left-0 right-0 h-1 bg-white opacity-70" />
    <div className="absolute top-0 bottom-0 left-1/2 w-1 bg-white -translate-x-1/2 opacity-70" />
    <div className="absolute top-0 bottom-0 left-[10%] w-1 bg-white opacity-70" />
    <div className="absolute top-0 bottom-0 right-[10%] w-1 bg-white opacity-70" />
    {children}
  </div>
);

const BasketballField = ({ children }: { children: React.ReactNode }) => (
  <div className="relative w-full max-w-[400px] aspect-[4/3] bg-[#dd9f60] border-4 border-white mx-auto overflow-hidden">
    <div className="absolute top-0 left-1/2 w-[30%] h-[40%] border-4 border-white -translate-x-1/2" />
    <div className="absolute top-0 left-1/2 w-[60%] aspect-square border-4 border-white rounded-full -translate-x-1/2" />
    <div className="absolute top-[5%] left-1/2 w-[10%] h-[2%] bg-orange-700 -translate-x-1/2 shadow-sm" />
    <div className="absolute top-[8%] left-1/2 w-3 h-3 border-2 border-orange-700 rounded-full -translate-x-1/2 bg-transparent z-10" />
    {children}
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
    'OUT': { top: 95, left: 50 },
    'LONG_OUT': { top: 100, left: 50 },
    'SIDE_OUT': { top: 75, left: 5 },
    'NET_ERR': { top: 50, left: 50 },
    'UNKNOWN': { top: 50, left: 50 }
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
    'OUT': { top: 95, left: 50 },
    'UNKNOWN': { top: 50, left: 50 }
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
    'OUT': { top: 98, left: 50 },
    'NET_ERR': { top: 50, left: 50 },
    'UNKNOWN': { top: 50, left: 50 }
  },
  basketball: {
    'HOOP': { top: 15, left: 50 },
    'PAINT': { top: 30, left: 50 },
    'LEFT_WING': { top: 50, left: 20 },
    'TOP_KEY': { top: 70, left: 50 },
    'RIGHT_WING': { top: 50, left: 80 },
    'LEFT_CORNER': { top: 15, left: 10 },
    'RIGHT_CORNER': { top: 15, left: 90 },
    'MID_RANGE': { top: 45, left: 50 },
    'THREE_PT': { top: 85, left: 50 },
    'OUT': { top: 95, left: 50 },
    'UNKNOWN': { top: 50, left: 50 }
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

export default function FieldSequenceMap({ 
  sportType, events, selectedEventId, mode, 
  teamFilter, skillFilter, resultFilter, 
  onEventClick 
}: FieldSequenceMapProps) {
  const [selectedAreaGroup, setSelectedAreaGroup] = React.useState<{ key: string; label: string; actions: any[] } | null>(null);
  
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

        let coords = AREA_COORDS[sportType]?.[a.areaCode || ''] || { top: 50, left: 50 };
        
        // Adjust for volleyball horizontal court
        if (sportType === 'volleyball' && ['LN', 'CN', 'RN', 'LB', 'CB', 'RB'].includes(a.areaCode || '')) {
          const isTeamA = a.courtSide === 'teamA';
          const isTeamB = a.courtSide === 'teamB';
          
          if (isTeamA || isTeamB) {
            let top = 50;
            let left = 50;
            const code = a.areaCode;
            
            // Top row
            if (['LN', 'CN', 'RN'].includes(code || '')) top = 25;
            // Bottom row
            if (['LB', 'CB', 'RB'].includes(code || '')) top = 75;
            
            if (isTeamA) {
              if (['LN', 'LB'].includes(code || '')) left = 16;
              if (['CN', 'CB'].includes(code || '')) left = 33;
              if (['RN', 'RB'].includes(code || '')) left = 45;
            } else {
              if (['RN', 'RB'].includes(code || '')) left = 55;
              if (['CN', 'CB'].includes(code || '')) left = 67;
              if (['LN', 'LB'].includes(code || '')) left = 84;
            }
            coords = { top, left };
          }
        }
        const idHash = Math.abs(hashString(a.id || `${eIdx}-${aIdx}`));
        const topJitter = (idHash % 10) - 5;
        const leftJitter = ((idHash >> 4) % 10) - 5;
        
        data.push({
          ...a,
          eventId: e.id,
          videoTime: e.videoTime,
          coords,
          jitter: { top: topJitter * 0.4, left: leftJitter * 0.4 },
          sequence: sequenceIndex++
        });
      });
    });
    return data;
  }, [filteredEvents, teamFilter, skillFilter, resultFilter, sportType]);

  const FieldComponent = SPORT_COMPONENTS[sportType];

  return (
    <div className="w-full flex flex-col gap-4">
      <div className="relative w-full flex justify-center">
        <FieldComponent>
          {mode === 'heatmap' && (() => {
            const groups = new Map<string, { count: number, top: number, left: number, label: string, actions: any[] }>();
            
            mapData.forEach(d => {
              const label = d.courtSide ? `${d.courtSide}:${d.areaCode}` : (d.areaCode || 'UNKNOWN');
              const key = label;
              if (!groups.has(key)) {
                groups.set(key, { count: 0, top: d.coords.top, left: d.coords.left, label, actions: [] });
              }
              const g = groups.get(key)!;
              g.count += 1;
              g.actions.push(d);
            });

            return Array.from(groups.entries()).map(([key, g]) => {
              const intensity = Math.min(g.count / 5, 1);
              return (
                <div 
                  key={key}
                  className="absolute rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold hover:scale-110 transition-transform"
                  style={{
                    top: `${g.top}%`,
                    left: `${g.left}%`,
                    width: '30px',
                    height: '30px',
                    transform: 'translate(-50%, -50%)',
                    opacity: 0.3 + (intensity * 0.7),
                    cursor: 'pointer'
                  }}
                  title={`${g.label}: ${g.count} actions`}
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
          {mode === 'sequence' && selectedEventId && mapData.map((d, i) => (
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
                className="absolute rounded-full bg-sky-600 text-white text-[10px] font-bold flex items-center justify-center shadow-md z-20 cursor-pointer hover:scale-125 transition-transform"
                style={{
                  top: `${d.coords.top}%`,
                  left: `${d.coords.left}%`,
                  width: '20px',
                  height: '20px',
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={() => onEventClick && onEventClick(filteredEvents.find(e => e.id === d.eventId)!, d)}
                title={`${d.teamCode} - ${d.skillCode} (${d.resultCode})`}
              >
                {d.sequence}
              </div>
            </React.Fragment>
          ))}

          {mode === 'result' && mapData.map((d, i) => {
            const color = d.resultCode === 'Yes' ? 'bg-green-500' : d.resultCode === 'Out' ? 'bg-red-500' : 'bg-gray-500';
            return (
              <div 
                key={i}
                className={`absolute rounded-full ${color} shadow-sm z-10 opacity-70 cursor-pointer hover:opacity-100 hover:scale-150 transition-all`}
                style={{
                  top: `${d.coords.top + d.jitter.top}%`,
                  left: `${d.coords.left + d.jitter.left}%`,
                  width: '12px',
                  height: '12px',
                  transform: 'translate(-50%, -50%)',
                }}
                onClick={() => onEventClick && onEventClick(filteredEvents.find(e => e.id === d.eventId)!, d)}
                title={`${d.teamCode} - ${d.skillCode} (${d.resultCode})`}
              />
            )
          })}
        </FieldComponent>
      </div>
      
      {/* Detail Panel */}
      {selectedAreaGroup && mode === 'heatmap' && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 mt-2 text-sm">
          <div className="flex justify-between items-center mb-3">
            <h4 className="font-bold text-gray-800 dark:text-gray-100">Area: {selectedAreaGroup.label}</h4>
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
            );
          })()}
        </div>
      )}
    </div>
  );
}

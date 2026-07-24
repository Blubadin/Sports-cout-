import React, { useState } from 'react';
import { FootballPitchZone, getPitchZoneFromPoint, SequenceLine, ZONES } from '../../football/footballDomain';

interface FootballPiccoPitchProps {
  sequenceLines: SequenceLine[];
  activeBallLocation?: { x: number; y: number };
  homeTeamName: string;
  awayTeamName: string;
  attackingDirection: 'left-to-right' | 'right-to-left';
  detailedMode?: boolean; // false for 3x3, true for 15-zone (5x3)
  onPitchClick?: (point: { x: number; y: number }) => void;
}

export const FootballPiccoPitch: React.FC<FootballPiccoPitchProps> = ({
  sequenceLines,
  activeBallLocation,
  homeTeamName,
  awayTeamName,
  attackingDirection,
  detailedMode = true,
  onPitchClick,
}) => {
  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onPitchClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    onPitchClick({ x, y });
  };

  return (
    <div className="football-picco-pitch-container" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', position: 'relative' }}>
      <div className="team-names" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span>{homeTeamName}</span>
        {attackingDirection === 'left-to-right' ? <span>&#8594; Attack Direction</span> : <span>&#8592; Attack Direction</span>}
        <span>{awayTeamName}</span>
      </div>
      
      <svg
        viewBox="0 0 100 100"
        style={{ width: '100%', height: 'auto', border: '2px solid black', backgroundColor: '#4CAF50', cursor: onPitchClick ? 'pointer' : 'default' }}
        onClick={handleSvgClick}
      >
        {/* Pitch markings */}
        <line x1="50" y1="0" x2="50" y2="100" stroke="white" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="10" stroke="white" strokeWidth="0.5" fill="none" />
        
        {/* Penalty areas */}
        <rect x="0" y="20" width="18" height="60" stroke="white" strokeWidth="0.5" fill="none" />
        <rect x="82" y="20" width="18" height="60" stroke="white" strokeWidth="0.5" fill="none" />

        {/* Zones overlay */}
        {detailedMode ? (
          // 5x3 overlay
          <>
            {[33.3, 66.6].map(x => <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="100" stroke="rgba(255,255,255,0.3)" strokeWidth="0.2" strokeDasharray="1 1" />)}
            {[20, 40, 60, 80].map(y => <line key={`y-${y}`} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth="0.2" strokeDasharray="1 1" />)}
          </>
        ) : (
          // 3x3 overlay
          <>
            {[33.3, 66.6].map(x => <line key={`x-${x}`} x1={x} y1="0" x2={x} y2="100" stroke="rgba(255,255,255,0.3)" strokeWidth="0.2" strokeDasharray="1 1" />)}
            {[33.3, 66.6].map(y => <line key={`y-${y}`} x1="0" y1={y} x2="100" y2={y} stroke="rgba(255,255,255,0.3)" strokeWidth="0.2" strokeDasharray="1 1" />)}
          </>
        )}

        {/* Sequence lines */}
        {sequenceLines.map((line, idx) => (
          <line
            key={`seq-${idx}`}
            x1={line.start.x * 100}
            y1={line.start.y * 100}
            x2={line.end.x * 100}
            y2={line.end.y * 100}
            stroke={line.type === 'Dribble' ? 'blue' : 'yellow'}
            strokeWidth="1"
            strokeDasharray={line.type === 'Dribble' ? '2 1' : 'none'}
            markerEnd="url(#arrowhead)"
          />
        ))}

        {/* Active ball location */}
        {activeBallLocation && (
          <circle
            cx={activeBallLocation.x * 100}
            cy={activeBallLocation.y * 100}
            r="2"
            fill="white"
            stroke="black"
            strokeWidth="0.5"
          />
        )}

        <defs>
          <marker id="arrowhead" markerWidth="5" markerHeight="4" refX="5" refY="2" orient="auto">
            <polygon points="0 0, 5 2, 0 4" fill="yellow" />
          </marker>
        </defs>
      </svg>
    </div>
  );
};

import type { ReactNode } from 'react';
import type { SportType } from '../../types';

interface SportCourtSurfaceProps {
  sport: SportType;
  children: ReactNode;
}

function FootballLines() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="2" y="2" width="96" height="96" />
      <line x1="2" y1="50" x2="98" y2="50" />
      <circle cx="50" cy="50" r="10" />
      <rect x="25" y="2" width="50" height="18" />
      <rect x="38" y="2" width="24" height="7" />
      <rect x="25" y="80" width="50" height="18" />
      <rect x="38" y="91" width="24" height="7" />
      <circle cx="50" cy="50" r="1" className="is-fill" />
    </svg>
  );
}

function BadmintonLines() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="4" y="2" width="92" height="96" />
      <rect x="10" y="8" width="80" height="84" />
      <line x1="4" y1="50" x2="96" y2="50" className="is-net" />
      <line x1="50" y1="8" x2="50" y2="40" />
      <line x1="50" y1="60" x2="50" y2="92" />
      <line x1="4" y1="22" x2="96" y2="22" />
      <line x1="4" y1="40" x2="96" y2="40" />
      <line x1="4" y1="60" x2="96" y2="60" />
      <line x1="4" y1="78" x2="96" y2="78" />
    </svg>
  );
}

function BasketballLines() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <rect x="2" y="2" width="96" height="96" />
      <line x1="2" y1="50" x2="98" y2="50" />
      <circle cx="50" cy="50" r="9" />
      <rect x="31" y="2" width="38" height="20" />
      <circle cx="50" cy="22" r="9" />
      <path d="M18 2 A34 34 0 0 0 82 2" />
      <rect x="31" y="78" width="38" height="20" />
      <circle cx="50" cy="78" r="9" />
      <path d="M18 98 A34 34 0 0 1 82 98" />
      <line x1="43" y1="6" x2="57" y2="6" className="is-hoop" />
      <line x1="43" y1="94" x2="57" y2="94" className="is-hoop" />
    </svg>
  );
}

function VolleyballLines() {
  return (
    <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="96" height="56" />
      <line x1="50" y1="2" x2="50" y2="58" className="is-net" />
      <line x1="34" y1="2" x2="34" y2="58" />
      <line x1="66" y1="2" x2="66" y2="58" />
    </svg>
  );
}

export default function SportCourtSurface({ sport, children }: SportCourtSurfaceProps) {
  return (
    <div className={`sport-court-surface sport-court-${sport}`} data-sport-surface={sport}>
      <div className="sport-court-lines">
        {sport === 'football' && <FootballLines />}
        {sport === 'badminton' && <BadmintonLines />}
        {sport === 'basketball' && <BasketballLines />}
        {sport === 'volleyball' && <VolleyballLines />}
      </div>
      <div className="sport-court-content">{children}</div>
    </div>
  );
}

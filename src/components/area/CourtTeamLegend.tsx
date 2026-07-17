import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { CourtTeamPresentation } from '../../utils/courtPresentation';

interface CourtTeamLegendProps {
  presentation: CourtTeamPresentation;
  language: 'th' | 'en';
}

function teamName(team: CourtTeamPresentation['nearTeam'], language: 'th' | 'en') {
  return language === 'th' ? team.thaiName || team.name || team.code : team.name || team.code;
}

function TeamBadge({
  team,
  side,
  language,
  direction,
}: {
  team: CourtTeamPresentation['nearTeam'];
  side: 'near' | 'far';
  language: 'th' | 'en';
  direction: 'up' | 'down' | 'left' | 'right';
}) {
  const DirectionIcon = direction === 'up' ? ArrowUp : direction === 'down' ? ArrowDown : direction === 'left' ? ArrowLeft : ArrowRight;
  return (
    <div className="court-team-badge" data-testid={`court-team-${side}`}>
      <span className="court-team-code">{team.code}</span>
      <span className="court-team-name">{teamName(team, language)}</span>
      <span className="court-team-direction">
        <DirectionIcon size={13} />
        {language === 'th' ? 'ทิศบุก' : 'Attack'}
      </span>
    </div>
  );
}

export default function CourtTeamLegend({ presentation, language }: CourtTeamLegendProps) {
  if (presentation.focusedTeam) {
    return (
      <div className="court-team-focus" data-testid="court-team-focused">
        <span>{language === 'th' ? 'ทีมที่กำลังวิเคราะห์' : 'Focused team'}</span>
        <strong>{presentation.focusedTeam.code}</strong>
        <span>{teamName(presentation.focusedTeam, language)}</span>
        <ArrowUp size={14} />
        <em>{language === 'th' ? 'ทิศบุก' : 'Attack direction'}</em>
      </div>
    );
  }

  if (presentation.orientation === 'horizontal') {
    return (
      <div className="court-team-legend is-horizontal">
        <TeamBadge team={presentation.nearTeam} side="near" language={language} direction="right" />
        <span className="court-team-divider">{language === 'th' ? 'เส้นกลางสนาม' : 'Center line'}</span>
        <TeamBadge team={presentation.farTeam} side="far" language={language} direction="left" />
      </div>
    );
  }

  return (
    <div className="court-team-legend is-vertical">
      <TeamBadge team={presentation.farTeam} side="far" language={language} direction="down" />
      <span className="court-team-divider">{language === 'th' ? 'ฝั่งตรงข้าม / ฝั่งไกล' : 'Opponent / Far side'}</span>
      <TeamBadge team={presentation.nearTeam} side="near" language={language} direction="up" />
    </div>
  );
}

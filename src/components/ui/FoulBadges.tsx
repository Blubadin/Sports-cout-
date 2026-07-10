import React from 'react';
import { Action, SportType, AppSettings } from '../../types';
import { SPORT_TEMPLATES } from '../../sports';

interface FoulBadgesProps {
  actions: Action[] | undefined;
  sportType: SportType;
  uiLanguage: AppSettings['uiLanguage'];
}

export default function FoulBadges({ actions, sportType, uiLanguage }: FoulBadgesProps) {
  const rowFouls = actions?.filter(a => !!a.foulCode) || [];
  
  if (rowFouls.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {rowFouls.map((foulAction, fIdx) => {
        const template = SPORT_TEMPLATES[sportType];
        const fDef = template?.fouls?.find(x => x.code === foulAction.foulCode);
        const fLabel = fDef ? (uiLanguage === 'th' ? (fDef.labelTh || fDef.label) : fDef.label) : foulAction.foulCode;
        
        const severityColor = foulAction.foulSeverity === 'card' 
          ? 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/30' 
          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-900/30';
        
        return (
          <span 
            key={fIdx} 
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${severityColor}`}
            title={`Foul: ${foulAction.foulCode} (${fLabel}) - Role: ${foulAction.foulRole || 'violation'}`}
          >
            ⚠️ {foulAction.foulCode}: {fLabel}
          </span>
        );
      })}
    </div>
  );
}

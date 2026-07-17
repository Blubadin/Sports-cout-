import React from 'react';
import { ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import { useScoutContext } from '../../context/ScoutContext';
import AreaBoundaryFrame from './AreaBoundaryFrame';
import CourtTeamLegend from './CourtTeamLegend';
import SportCourtSurface from './SportCourtSurface';
import { resolveCourtTeamPresentation } from '../../utils/courtPresentation';

interface CourtLayoutShellProps {
  sport: 'volleyball' | 'football' | 'badminton' | 'basketball';
  children: React.ReactNode;
  flipIcon?: 'ArrowLeftRight' | 'ArrowUpDown';
  titleEn: string;
  titleTh: string;
  flipLabelEn: string;
  flipLabelTh: string;
  maxWidthClass?: string;
}

export default function CourtLayoutShell({
  sport,
  children,
  flipIcon = 'ArrowLeftRight',
  titleEn,
  titleTh,
  flipLabelEn,
  flipLabelTh,
  maxWidthClass = 'max-w-xl'
}: CourtLayoutShellProps) {
  const { currentAction, settings, setSettings, selectArea, teams } = useScoutContext();
  const selectedAreaCode = currentAction.areaCode;
  const teamPresentation = resolveCourtTeamPresentation({
    teams,
    sportType: sport,
    flipCourtSide: settings.flipCourtSide,
    courtViewMode: settings.areaCourtViewMode || 'auto',
  });
  
  const FlipIconComponent = flipIcon === 'ArrowUpDown' ? ArrowUpDown : ArrowLeftRight;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {settings.uiLanguage === 'th' ? titleTh : titleEn}
        </h3>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor={`court-view-${sport}`}>
            {settings.uiLanguage === 'th' ? 'มุมมองสนาม' : 'Court view'}
          </label>
          <select
            id={`court-view-${sport}`}
            value={settings.areaCourtViewMode || 'auto'}
            onChange={(event) => setSettings(current => ({
              ...current,
              areaCourtViewMode: event.target.value as 'auto' | 'full' | 'half',
            }))}
            className="coach-control-target rounded-lg border border-gray-200 bg-gray-100 px-2 text-xs font-semibold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="auto">{settings.uiLanguage === 'th' ? 'อัตโนมัติ' : 'Auto'}</option>
            <option value="full">{settings.uiLanguage === 'th' ? 'เต็มสนาม' : 'Full Court'}</option>
            <option value="half">{settings.uiLanguage === 'th' ? 'ครึ่งสนาม' : 'Half Court'}</option>
          </select>
          <button
            onClick={() => setSettings(s => ({ ...s, flipCourtSide: !s.flipCourtSide }))}
            className="coach-control-target text-xs flex items-center gap-1 text-gray-500 hover:text-sky-600 bg-gray-100 hover:bg-sky-50 dark:bg-gray-800 dark:hover:bg-sky-900/30 px-2 rounded-lg transition-colors"
          >
            <FlipIconComponent size={12} className={settings.flipCourtSide ? 'rotate-180 transition-transform' : 'transition-transform'} />
            {settings.uiLanguage === 'th' ? flipLabelTh : flipLabelEn}
          </button>
        </div>
      </div>
      
      <div className={`flex flex-col items-center gap-1 mx-auto w-full ${maxWidthClass} overflow-visible`}>
        <CourtTeamLegend presentation={teamPresentation} language={settings.uiLanguage} />
        {settings.enableOutOfBoundsZones ? (
          <AreaBoundaryFrame
            sport={sport}
            selectedAreaCode={selectedAreaCode}
            currentOutZone={currentAction.outZone || null}
            uiLanguage={settings.uiLanguage}
            onSelectOutZone={(payload) => {
              selectArea({
                areaCode: payload.areaCode,
                areaLabel: payload.areaLabel,
                areaMode: 'normal',
                courtSide: payload.courtSide,
                outZone: payload.outZone as import('../../types').OutZoneType,
                areaResolution: 'out-zone'
              });
            }}
          >
            <SportCourtSurface sport={sport}>{children}</SportCourtSurface>
          </AreaBoundaryFrame>
        ) : (
          <div className="flex flex-row w-full items-stretch gap-1">
            <SportCourtSurface sport={sport}>{children}</SportCourtSurface>
          </div>
        )}
      </div>
    </div>
  );
}

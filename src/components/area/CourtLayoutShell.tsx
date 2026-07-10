import React from 'react';
import { ArrowLeftRight, ArrowUpDown } from 'lucide-react';
import { useScoutContext } from '../../context/ScoutContext';
import AreaBoundaryFrame from './AreaBoundaryFrame';

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
  const { currentAction, settings, setSettings, selectArea } = useScoutContext();
  const selectedAreaCode = currentAction.areaCode;
  
  const FlipIconComponent = flipIcon === 'ArrowUpDown' ? ArrowUpDown : ArrowLeftRight;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {settings.uiLanguage === 'th' ? titleTh : titleEn}
        </h3>
        <button 
          onClick={() => setSettings(s => ({ ...s, flipCourtSide: !s.flipCourtSide }))}
          className="text-xs flex items-center gap-1 text-gray-500 hover:text-sky-600 bg-gray-100 hover:bg-sky-50 dark:bg-gray-800 dark:hover:bg-sky-900/30 px-2 py-1 rounded-lg transition-colors"
        >
          <FlipIconComponent size={12} className={settings.flipCourtSide ? 'rotate-180 transition-transform' : 'transition-transform'} />
          {settings.uiLanguage === 'th' ? flipLabelTh : flipLabelEn}
        </button>
      </div>
      
      <div className={`flex flex-col items-center gap-1 mx-auto w-full ${maxWidthClass} overflow-visible`}>
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
            {children}
          </AreaBoundaryFrame>
        ) : (
          <div className="flex flex-row w-full items-stretch gap-1">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}

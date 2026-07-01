import React from 'react';
import { BOUNDARY_ZONES_BY_SPORT, BoundaryZone } from '../../sports';

interface AreaBoundaryFrameProps {
  sport: string;
  children: React.ReactNode;
  selectedAreaCode: string | null;
  currentOutZone: string | null;
  onSelectOutZone: (payload: {
    areaCode: string;
    areaLabel: string;
    outZone: string;
    courtSide: 'teamA' | 'teamB' | 'neutral';
  }) => void;
  uiLanguage: 'th' | 'en';
}

export default function AreaBoundaryFrame({
  sport,
  children,
  selectedAreaCode,
  currentOutZone,
  onSelectOutZone,
  uiLanguage,
}: AreaBoundaryFrameProps) {
  const zones = BOUNDARY_ZONES_BY_SPORT[sport] || [];

  // Helper to find zone by slot
  const getZoneBySlot = (slot: string) => zones.find((z) => z.slot === slot);

  // Helper to render button
  const renderZoneButton = (zone: BoundaryZone | undefined, extraClass = '') => {
    if (!zone) return <div className="h-full w-full" />;

    const isSelected = selectedAreaCode === zone.areaCode && currentOutZone === zone.outZone;
    const primaryLabel = zone.label;
    const secondaryLabel = zone.thaiLabel;

    return (
      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          onSelectOutZone({
            areaCode: zone.areaCode,
            areaLabel: zone.label,
            outZone: zone.outZone,
            courtSide: zone.courtSide || 'neutral',
          });
        }}
        onClick={(e) => {
          e.preventDefault();
        }}
        className={`w-full h-full min-h-[40px] px-0.5 sm:px-1 py-1.5 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-tighter active:scale-95 transition-all duration-75 shadow-sm border flex flex-col items-center justify-center leading-none select-none cursor-pointer ${
          isSelected
            ? 'bg-red-600 text-white border-red-700 shadow-md ring-2 ring-red-300 dark:ring-red-800 scale-[1.01] z-10'
            : 'bg-red-50/75 hover:bg-red-100/90 dark:bg-red-950/45 dark:hover:bg-red-900/40 text-red-700 dark:text-red-300 border-red-200/60 dark:border-red-900/30'
        } ${extraClass}`}
      >
        <span className="font-extrabold text-[9px] sm:text-[10px] tracking-tight">{primaryLabel}</span>
        {secondaryLabel && <span className="text-[7px] sm:text-[8px] font-medium opacity-75 mt-0.5">{secondaryLabel}</span>}
      </button>
    );
  };

  // Volleyball Specific Layout
  if (sport === 'volleyball') {
    const backLeftTop = getZoneBySlot('left-top');
    const backLeftBottom = getZoneBySlot('left-bottom');
    const backRightTop = getZoneBySlot('right-top');
    const backRightBottom = getZoneBySlot('right-bottom');
    const sideTopLeft = getZoneBySlot('top-left');
    const sideTopRight = getZoneBySlot('top-right');
    const sideBottomLeft = getZoneBySlot('bottom-left');
    const sideBottomRight = getZoneBySlot('bottom-right');
    const netError = getZoneBySlot('center-net');

    return (
      <div className="w-full flex flex-col gap-2.5 items-center overflow-visible select-none">
        {/* Volleyball Boundary Border Frame */}
        <div 
          className="w-full flex flex-col items-stretch overflow-visible border-2 border-red-200/50 dark:border-red-900/20 bg-red-50/10 dark:bg-red-950/5 p-1.5 rounded-2xl shadow-sm gap-1 sm:gap-1.5"
          style={{ maxWidth: 'clamp(480px, 85vw, 850px)' }}
        >
          {/* Top Row: SIDE LEFT NEAR & SIDE RIGHT FAR (Sidelines) */}
          <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
            <div className="h-10 sm:h-12">
              {sideTopLeft && renderZoneButton(sideTopLeft, 'rounded-lg')}
            </div>
            <div className="h-10 sm:h-12">
              {sideTopRight && renderZoneButton(sideTopRight, 'rounded-lg')}
            </div>
          </div>

          {/* Middle Row: Left Rail (Back A) + Main Court + Right Rail (Back B) */}
          <div className="flex flex-row gap-1 sm:gap-1.5 items-stretch min-h-[170px] sm:min-h-[220px]">
            {/* Left Boundary Rail (Back A baselines) */}
            <div className="flex flex-col gap-1 sm:gap-1.5 justify-between w-14 sm:w-18 shrink-0">
              <div className="flex-1">
                {backLeftTop && renderZoneButton(backLeftTop, 'rounded-lg')}
              </div>
              <div className="flex-1 mt-1 sm:mt-1.5">
                {backLeftBottom && renderZoneButton(backLeftBottom, 'rounded-lg')}
              </div>
            </div>

            {/* Main Court Center (approx 75-80% of width) */}
            <div className="flex-1 relative flex flex-col justify-center items-stretch overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-1.5 sm:p-2 shadow-inner">
              {children}
            </div>

            {/* Right Boundary Rail (Back B baselines) */}
            <div className="flex flex-col gap-1 sm:gap-1.5 justify-between w-14 sm:w-18 shrink-0">
              <div className="flex-1">
                {backRightTop && renderZoneButton(backRightTop, 'rounded-lg')}
              </div>
              <div className="flex-1 mt-1 sm:mt-1.5">
                {backRightBottom && renderZoneButton(backRightBottom, 'rounded-lg')}
              </div>
            </div>
          </div>

          {/* Bottom Row: SIDE RIGHT NEAR & SIDE LEFT FAR (Sidelines) */}
          <div className="grid grid-cols-2 gap-1 sm:gap-1.5">
            <div className="h-10 sm:h-12">
              {sideBottomLeft && renderZoneButton(sideBottomLeft, 'rounded-lg')}
            </div>
            <div className="h-10 sm:h-12">
              {sideBottomRight && renderZoneButton(sideBottomRight, 'rounded-lg')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const topLeft = getZoneBySlot('top-left');
  const topCenter = getZoneBySlot('top-center');
  const topRight = getZoneBySlot('top-right');

  const leftTop = getZoneBySlot('left-top');
  const leftMiddle = getZoneBySlot('left-middle');
  const leftBottom = getZoneBySlot('left-bottom');

  const rightTop = getZoneBySlot('right-top');
  const rightMiddle = getZoneBySlot('right-middle');
  const rightBottom = getZoneBySlot('right-bottom');

  const bottomLeft = getZoneBySlot('bottom-left');
  const bottomCenter = getZoneBySlot('bottom-center');
  const bottomRight = getZoneBySlot('bottom-right');

  const centerNet = getZoneBySlot('center-net');

  // Check if sport has specific slots to optimize spacing
  const hasTopRow = topLeft || topCenter || topRight;
  const hasBottomRow = bottomLeft || bottomCenter || bottomRight;
  const hasLeftCol = leftTop || leftMiddle || leftBottom;
  const hasRightCol = rightTop || rightMiddle || rightBottom;

  return (
    <div className="w-full flex flex-col gap-2 items-center overflow-visible select-none">
      {/* 3x3 Outer Grid Frame with expanded maximum width */}
      <div 
        className="grid gap-1 sm:gap-2 w-full items-stretch overflow-visible"
        style={{
          maxWidth: 'clamp(480px, 85vw, 850px)',
          gridTemplateColumns: `${hasLeftCol ? 'minmax(50px, 70px)' : '0px'} 1fr ${hasRightCol ? 'minmax(50px, 70px)' : '0px'}`,
        }}
      >
        {/* ROW 1: TOP BOUNDARIES */}
        {hasTopRow ? (
          <>
            <div className="flex items-center justify-center p-0.5">{topLeft && renderZoneButton(topLeft)}</div>
            <div className="flex items-center justify-center p-0.5">{topCenter && renderZoneButton(topCenter)}</div>
            <div className="flex items-center justify-center p-0.5">{topRight && renderZoneButton(topRight)}</div>
          </>
        ) : (
          <div className="col-span-3 h-0" />
        )}

        {/* ROW 2: SIDE BOUNDARIES + MAIN COURT */}
        {/* Left Column Stack */}
        <div className="flex flex-col justify-between gap-1.5 p-0.5">
          {leftTop && <div className="flex-1 flex items-center">{renderZoneButton(leftTop)}</div>}
          {leftMiddle && <div className="flex-1 flex items-center mt-1 sm:mt-1.5">{renderZoneButton(leftMiddle)}</div>}
          {leftBottom && <div className="flex-1 flex items-center mt-1 sm:mt-1.5">{renderZoneButton(leftBottom)}</div>}
          {!leftTop && !leftMiddle && !leftBottom && <div className="w-full" />}
        </div>

        {/* Center Main Field with Net option if applicable */}
        <div className="relative flex flex-col justify-center items-stretch overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-1.5 sm:p-2 shadow-inner">
          {children}

          {/* Floating net overlay if centerNet is active and it's NOT volleyball (which has its net error at the bottom) */}
          {centerNet && sport !== 'volleyball' && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[95%] sm:w-[85%] pointer-events-none">
              <div className="flex justify-center pointer-events-auto">
                <button
                  type="button"
                  onClick={() => {
                    const label = uiLanguage === 'th' ? centerNet.thaiLabel : centerNet.label;
                    onSelectOutZone({
                      areaCode: centerNet.areaCode,
                      areaLabel: label,
                      outZone: centerNet.outZone,
                      courtSide: 'neutral',
                    });
                  }}
                  className={`px-3 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-xs font-bold shadow-lg border transition-all pointer-events-auto cursor-pointer flex items-center gap-1 min-h-[44px] ${
                    selectedAreaCode === centerNet.areaCode && currentOutZone === centerNet.outZone
                      ? 'bg-red-600 text-white border-red-700 ring-2 ring-red-400'
                      : 'bg-amber-500/95 dark:bg-amber-600/95 hover:bg-amber-600 text-white border-amber-400'
                  }`}
                >
                  ⚠️ {uiLanguage === 'th' ? centerNet.thaiLabel : centerNet.label}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right Column Stack */}
        <div className="flex flex-col justify-between gap-1.5 p-0.5">
          {rightTop && <div className="flex-1 flex items-center">{renderZoneButton(rightTop)}</div>}
          {rightMiddle && <div className="flex-1 flex items-center mt-1 sm:mt-1.5">{renderZoneButton(rightMiddle)}</div>}
          {rightBottom && <div className="flex-1 flex items-center mt-1 sm:mt-1.5">{renderZoneButton(rightBottom)}</div>}
          {!rightTop && !rightMiddle && !rightBottom && <div className="w-full" />}
        </div>

        {/* ROW 3: BOTTOM BOUNDARIES */}
        {hasBottomRow ? (
          <>
            <div className="flex items-center justify-center p-0.5">{bottomLeft && renderZoneButton(bottomLeft)}</div>
            <div className="flex items-center justify-center p-0.5">{bottomCenter && renderZoneButton(bottomCenter)}</div>
            <div className="flex items-center justify-center p-0.5">{bottomRight && renderZoneButton(bottomRight)}</div>
          </>
        ) : (
          <div className="col-span-3 h-0" />
        )}
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import { calculateHomography, homographyToMatrix3d } from '../../utils/areaGeometry';
import { Check, X, MousePointer2 } from 'lucide-react';

interface CourtZoneOverlayProps {
  isVisible: boolean;
  isCalibrating: boolean;
  onCalibrationComplete: (pts: [number, number][]) => void;
  onCalibrationCancel: () => void;
  calibrationPoints?: { tl: [number, number]; tr: [number, number]; bl: [number, number]; br: [number, number] };
}

export default function CourtZoneOverlay({
  isVisible,
  isCalibrating,
  onCalibrationComplete,
  onCalibrationCancel,
  calibrationPoints
}: CourtZoneOverlayProps) {
  const { sportTemplate, settings } = useScoutContext();
  const [clickPts, setClickPts] = useState<[number, number][]>([]);

  const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isCalibrating) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width;
    const py = y / rect.height;
    
    if (clickPts.length < 4) {
      setClickPts([...clickPts, [px, py]]);
    }
  };

  const transformStyle = useMemo(() => {
    if (!calibrationPoints) return undefined;
    // Canonical 0-1 court corners (TL, TR, BL, BR)
    const src: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    // Map to pixel corners assuming 1000x1000 logical overlay size to use CSS matrix
    const dst: [number, number][] = [
      [calibrationPoints.tl[0] * 1000, calibrationPoints.tl[1] * 1000],
      [calibrationPoints.tr[0] * 1000, calibrationPoints.tr[1] * 1000],
      [calibrationPoints.bl[0] * 1000, calibrationPoints.bl[1] * 1000],
      [calibrationPoints.br[0] * 1000, calibrationPoints.br[1] * 1000],
    ];
    const srcPixels: [number, number][] = [[0, 0], [1000, 0], [0, 1000], [1000, 1000]];
    const h = calculateHomography(srcPixels, dst);
    return h ? { transform: homographyToMatrix3d(h), transformOrigin: '0 0' } : undefined;
  }, [calibrationPoints]);

  if (!isVisible && !isCalibrating) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {/* Calibration UI */}
      {isCalibrating && (
        <div className="absolute inset-0 bg-black/40 pointer-events-auto cursor-crosshair">
          <svg className="w-full h-full" onClick={handleSvgClick}>
            {clickPts.map((pt, i) => (
              <circle key={i} cx={`${pt[0] * 100}%`} cy={`${pt[1] * 100}%`} r="6" fill="#0ea5e9" stroke="white" strokeWidth="2" />
            ))}
          </svg>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/90 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-3 shadow-xl border border-gray-700">
            <MousePointer2 size={16} className="text-sky-400" />
            {clickPts.length === 0 && 'Click Top-Left corner'}
            {clickPts.length === 1 && 'Click Top-Right corner'}
            {clickPts.length === 2 && 'Click Bottom-Left corner'}
            {clickPts.length === 3 && 'Click Bottom-Right corner'}
            {clickPts.length === 4 && (
              <div className="flex gap-2 ml-2">
                <button onClick={() => {
                  onCalibrationComplete(clickPts);
                  setClickPts([]);
                }} className="bg-sky-500 hover:bg-sky-400 text-white px-3 py-1 rounded text-xs pointer-events-auto cursor-pointer z-50">Save</button>
                <button onClick={() => setClickPts([])} className="bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded text-xs pointer-events-auto cursor-pointer z-50">Reset</button>
              </div>
            )}
            <button onClick={onCalibrationCancel} className="p-1 hover:bg-gray-700 rounded ml-2 pointer-events-auto cursor-pointer z-50">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Actual Perspective Overlay */}
      {isVisible && !isCalibrating && transformStyle && (
        <div className="absolute top-0 left-0 w-[1000px] h-[1000px] opacity-70 pointer-events-none" style={transformStyle}>
          {/* Draw court lines and zones based on sportTemplate.areas in a 1000x1000 grid */}
          <div className="w-full h-full border-4 border-sky-400 relative">
            <div className="absolute inset-0 grid grid-cols-3 grid-rows-2">
              {sportTemplate.areas.filter(a => !['NET_ERR', 'OUT'].includes(a.code)).map((area) => {
                // Approximate generic grid rendering (in a real app, map exact areaGeometry rects)
                return (
                  <div key={area.code} className="border border-sky-400/50 flex items-center justify-center">
                    <span className="text-sky-400 font-bold text-2xl drop-shadow-md bg-black/30 px-3 py-1 rounded backdrop-blur-sm">
                      {settings.uiLanguage === 'th' ? area.thaiName : area.code}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

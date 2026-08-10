import React, { useMemo, useState } from 'react';
import { useScoutContext } from '../../context/ScoutContext';
import {
  calculateHomography,
  validateCourtCalibration,
  type CourtCalibration,
} from '../../utils/areaGeometry';
import { X, MousePointer2 } from 'lucide-react';

const VIEW_BOX_SIZE = 1000;

function projectPoint(homography: number[], point: [number, number]): [number, number] | null {
  const [x, y] = point;
  const denominator = homography[6] * x + homography[7] * y + homography[8];
  if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-10) return null;
  const projected: [number, number] = [
    (homography[0] * x + homography[1] * y + homography[2]) / denominator,
    (homography[3] * x + homography[4] * y + homography[5]) / denominator,
  ];
  return projected.every(Number.isFinite) ? projected : null;
}

function pointsAttribute(points: Array<[number, number] | null>) {
  if (points.some(point => point === null)) return undefined;
  return (points as [number, number][]).map(([x, y]) => `${x},${y}`).join(' ');
}

interface CourtZoneOverlayProps {
  isVisible: boolean;
  isCalibrating: boolean;
  onCalibrationComplete: (pts: [number, number][]) => void;
  onCalibrationCancel: () => void;
  calibrationPoints?: CourtCalibration;
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
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    
    if (clickPts.length < 4) {
      setClickPts([...clickPts, [px, py]]);
    }
  };

  const homography = useMemo(() => {
    if (!validateCourtCalibration(calibrationPoints).valid) return null;
    const safeCalibration = calibrationPoints as CourtCalibration;
    const dst: [number, number][] = [
      [safeCalibration.tl[0] * VIEW_BOX_SIZE, safeCalibration.tl[1] * VIEW_BOX_SIZE],
      [safeCalibration.tr[0] * VIEW_BOX_SIZE, safeCalibration.tr[1] * VIEW_BOX_SIZE],
      [safeCalibration.bl[0] * VIEW_BOX_SIZE, safeCalibration.bl[1] * VIEW_BOX_SIZE],
      [safeCalibration.br[0] * VIEW_BOX_SIZE, safeCalibration.br[1] * VIEW_BOX_SIZE],
    ];
    const src: [number, number][] = [
      [0, 0],
      [VIEW_BOX_SIZE, 0],
      [0, VIEW_BOX_SIZE],
      [VIEW_BOX_SIZE, VIEW_BOX_SIZE],
    ];
    return calculateHomography(src, dst);
  }, [calibrationPoints]);

  const projectedCourt = useMemo(() => {
    if (!homography) return null;
    const areas = sportTemplate.areas.filter(area => !['NET_ERR', 'OUT'].includes(area.code));
    const columns = 3;
    const rows = Math.max(2, Math.ceil(areas.length / columns));
    const outer = pointsAttribute([
      projectPoint(homography, [0, 0]),
      projectPoint(homography, [VIEW_BOX_SIZE, 0]),
      projectPoint(homography, [VIEW_BOX_SIZE, VIEW_BOX_SIZE]),
      projectPoint(homography, [0, VIEW_BOX_SIZE]),
    ]);
    if (!outer) return null;

    const lines: string[] = [];
    for (let column = 1; column < columns; column += 1) {
      const x = column * VIEW_BOX_SIZE / columns;
      const line = pointsAttribute([
        projectPoint(homography, [x, 0]),
        projectPoint(homography, [x, VIEW_BOX_SIZE]),
      ]);
      if (line) lines.push(line);
    }
    for (let row = 1; row < rows; row += 1) {
      const y = row * VIEW_BOX_SIZE / rows;
      const line = pointsAttribute([
        projectPoint(homography, [0, y]),
        projectPoint(homography, [VIEW_BOX_SIZE, y]),
      ]);
      if (line) lines.push(line);
    }

    const labels = areas.flatMap((area, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const point = projectPoint(homography, [
        (column + 0.5) * VIEW_BOX_SIZE / columns,
        (row + 0.5) * VIEW_BOX_SIZE / rows,
      ]);
      return point ? [{ area, point }] : [];
    });
    return { outer, lines, labels };
  }, [homography, sportTemplate.areas]);

  if (!isVisible && !isCalibrating) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
      {/* Calibration UI */}
      {isCalibrating && (
        <div className="absolute inset-0 bg-black/40 pointer-events-auto cursor-crosshair">
          <svg
            className="w-full h-full"
            data-testid="court-calibration-surface"
            viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}
            preserveAspectRatio="none"
            onClick={handleSvgClick}
          >
            {clickPts.map((pt, i) => (
              <circle
                key={i}
                data-testid={`calibration-point-${i}`}
                cx={pt[0] * VIEW_BOX_SIZE}
                cy={pt[1] * VIEW_BOX_SIZE}
                r="8"
                fill="#0ea5e9"
                stroke="white"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
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
      {isVisible && !isCalibrating && projectedCourt && (
        <svg
          className="absolute inset-0 h-full w-full opacity-70 pointer-events-none"
          data-testid="projected-court-layer"
          viewBox={`0 0 ${VIEW_BOX_SIZE} ${VIEW_BOX_SIZE}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon
            points={projectedCourt.outer}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="4"
            vectorEffect="non-scaling-stroke"
          />
          {projectedCourt.lines.map((line, index) => (
            <polyline
              key={index}
              points={line}
              fill="none"
              stroke="#38bdf8"
              strokeOpacity="0.5"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {projectedCourt.labels.map(({ area, point }) => (
            <text
              key={area.code}
              x={point[0]}
              y={point[1]}
              fill="#38bdf8"
              fontSize="24"
              fontWeight="700"
              textAnchor="middle"
              dominantBaseline="middle"
              stroke="rgba(0,0,0,0.65)"
              strokeWidth="5"
              paintOrder="stroke"
              vectorEffect="non-scaling-stroke"
            >
              {settings.uiLanguage === 'th' ? area.thaiName : area.code}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

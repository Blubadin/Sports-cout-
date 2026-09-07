import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  Maximize2,
  RotateCcw,
  ArrowUpDown,
  Layers,
  CheckCircle2,
  AlertCircle,
  X,
  Target,
  Sparkles,
} from 'lucide-react';
import type { AreaSelectionPayload, SportType } from '../../types';

export interface BadmintonTouchCourtProps {
  pointX?: number;
  pointY?: number;
  areaCode?: string;
  courtSide?: 'teamA' | 'teamB' | 'neutral';
  outZone?: string;
  onSelectArea?: (payload: AreaSelectionPayload) => void;
  onHoverPoint?: (payload: (AreaSelectionPayload & { isIn: boolean; detailLabel: string }) | null) => void;
  hoverPoint?: { x: number; y: number } | null;
  isDoubles?: boolean;
  compact?: boolean;
  initialViewMode?: 'full' | 'half';
  flipCourtSide?: boolean;
  onToggleFlip?: () => void;
  uiLanguage?: 'th' | 'en';
  showControls?: boolean;
  onExpand?: () => void;
  teamAName?: string;
  teamBName?: string;
  aiPlayers?: import('../../types').AITrackingPlayer[];
}

// BWF Standard Normalized Dimensions
// Total Court: 13.40m length x 6.10m width
// Margins added around court: 8% on each side
const MARGIN_X = 0.08;
const MARGIN_Y = 0.06;
const COURT_W = 1 - 2 * MARGIN_X; // 0.84
const COURT_H = 1 - 2 * MARGIN_Y; // 0.88

// Singles sideline offset: (6.10 - 5.18)/2 / 6.10 = 0.46 / 6.10 ≈ 0.0754
const SINGLES_SIDE_OFFSET = (0.46 / 6.10) * COURT_W;

// Short service line offset from net: 1.98m / 13.40m ≈ 0.1478
const SHORT_SERVICE_OFFSET = (1.98 / 13.40) * COURT_H;

// Doubles long service line offset from back line: 0.76m / 13.40m ≈ 0.0567
const DOUBLES_LONG_SERVICE_OFFSET = (0.76 / 13.40) * COURT_H;

export function resolveBadmintonPointSelection({
  normX,
  normY,
  flipCourtSide = false,
  isDoubles = true,
  uiLanguage = 'th',
  focusedHalf = 'both',
}: {
  normX: number;
  normY: number;
  flipCourtSide?: boolean;
  isDoubles?: boolean;
  uiLanguage?: 'th' | 'en';
  focusedHalf?: 'top' | 'bottom' | 'both';
}): AreaSelectionPayload & { isIn: boolean; detailLabel: string } {
  const isThai = uiLanguage === 'th';

  // Court bounding coordinates in 0..1 space
  const courtLeft = MARGIN_X;
  const courtRight = 1 - MARGIN_X;
  const courtTop = MARGIN_Y;
  const courtBottom = 1 - MARGIN_Y;
  const netY = 0.5;

  const singlesLeft = courtLeft + SINGLES_SIDE_OFFSET;
  const singlesRight = courtRight - SINGLES_SIDE_OFFSET;

  // Check In/Out
  const isOutsideDoublesWidth = normX < courtLeft || normX > courtRight;
  const isOutsideSinglesWidth = normX < singlesLeft || normX > singlesRight;
  const isOutsideWidth = isDoubles ? isOutsideDoublesWidth : isOutsideSinglesWidth;
  const isOutsideLength = normY < courtTop || normY > courtBottom;

  // Net Zone Check (within ±1.5% of net)
  const isNetZone = Math.abs(normY - netY) < 0.018 && !isOutsideDoublesWidth;

  // Determine Court Side
  const isTopHalf = normY < netY;
  const rawSide = isTopHalf ? 'opponent' : 'primary';
  const effectiveCourtSide = rawSide === 'opponent'
    ? (flipCourtSide ? 'teamA' : 'teamB')
    : (flipCourtSide ? 'teamB' : 'teamA');

  // Out Zone handling
  if (isNetZone) {
    return {
      areaCode: 'NET_ERR',
      courtSide: 'neutral',
      outZone: 'net_error',
      areaResolution: 'out-zone',
      areaMode: 'normal',
      areaLabel: isThai ? 'ติดเน็ต (Net Error)' : 'Net Error',
      pointX: normX,
      pointY: normY,
      isIn: false,
      detailLabel: isThai ? 'ติดเน็ต (Net)' : 'Hit the Net',
    };
  }

  if (isOutsideLength || isOutsideWidth) {
    let outZone = 'side_left_near';
    let label = isThai ? 'ออก (Out)' : 'Out';

    if (normY < courtTop) {
      outZone = 'opp_back_out';
      label = isThai ? 'ออกหลัง (Back Out)' : 'Long Out (Back)';
    } else if (normY > courtBottom) {
      outZone = 'own_back_out';
      label = isThai ? 'ออกหลัง (Back Out)' : 'Long Out (Back)';
    } else if (normX < (isDoubles ? courtLeft : singlesLeft)) {
      outZone = isTopHalf ? 'side_left_far' : 'side_left_near';
      label = isThai ? 'ออกข้างซ้าย (Side Out L)' : 'Side Out (Left)';
    } else if (normX > (isDoubles ? courtRight : singlesRight)) {
      outZone = isTopHalf ? 'side_right_far' : 'side_right_near';
      label = isThai ? 'ออกข้างขวา (Side Out R)' : 'Side Out (Right)';
    }

    return {
      areaCode: outZone.includes('side') ? 'SIDE_OUT' : 'LONG_OUT',
      courtSide: effectiveCourtSide,
      outZone,
      areaResolution: 'out-zone',
      areaMode: 'normal',
      areaLabel: label,
      pointX: normX,
      pointY: normY,
      isIn: false,
      detailLabel: label,
    };
  }

  // Inside Court -> Calculate 3x3 Tactical Zones (FL, FC, FR, ML, MC, MR, BL, BC, BR)
  const halfCourtH = netY - courtTop; // Height of one half
  const relYInHalf = isTopHalf
    ? (netY - normY) / halfCourtH // 0 at net, 1 at back line
    : (normY - netY) / halfCourtH; // 0 at net, 1 at back line

  // Depth Zone: Front (0..0.33), Mid (0.33..0.66), Back (0.66..1.0)
  let depthCode = 'F';
  let depthNameTh = 'หน้า';
  let depthNameEn = 'Front';
  if (relYInHalf > 0.66) {
    depthCode = 'B';
    depthNameTh = 'หลัง';
    depthNameEn = 'Back';
  } else if (relYInHalf > 0.33) {
    depthCode = 'M';
    depthNameTh = 'กลาง';
    depthNameEn = 'Mid';
  }

  // Width Zone: Left (0..0.33), Center (0.33..0.66), Right (0.66..1.0)
  const activeLeft = isDoubles ? courtLeft : singlesLeft;
  const activeWidth = isDoubles ? COURT_W : (COURT_W - 2 * SINGLES_SIDE_OFFSET);
  const relXInCourt = (normX - activeLeft) / activeWidth;

  let widthCode = 'C';
  let widthNameTh = 'กลาง';
  let widthNameEn = 'Center';

  // Adjust left/right based on perspective (top half is facing us)
  const isLeft = isTopHalf ? relXInCourt > 0.66 : relXInCourt < 0.33;
  const isRight = isTopHalf ? relXInCourt < 0.33 : relXInCourt > 0.66;

  if (isLeft) {
    widthCode = 'L';
    widthNameTh = 'ซ้าย';
    widthNameEn = 'Left';
  } else if (isRight) {
    widthCode = 'R';
    widthNameTh = 'ขวา';
    widthNameEn = 'Right';
  }

  const zoneCode = `${depthCode}${widthCode}`;
  const sideLabel = effectiveCourtSide === 'teamA'
    ? (isThai ? 'ฝั่งเรา' : 'Our Side')
    : (isThai ? 'ฝั่งคู่แข่ง' : 'Opponent');

  const zoneLabelTh = `${zoneCode} - ${depthNameTh}${widthNameTh} (${sideLabel})`;
  const zoneLabelEn = `${zoneCode} - ${depthNameEn} ${widthNameEn} (${sideLabel})`;

  return {
    areaCode: zoneCode,
    courtSide: effectiveCourtSide,
    areaResolution: 'exact-point',
    areaMode: 'detailed',
    areaLabel: isThai ? zoneLabelTh : zoneLabelEn,
    pointX: normX,
    pointY: normY,
    isIn: true,
    detailLabel: isThai ? `${zoneCode} ลงในคอร์ท` : `${zoneCode} In Court`,
  };
}

export default function BadmintonTouchCourt({
  pointX,
  pointY,
  areaCode,
  courtSide,
  outZone,
  onSelectArea,
  isDoubles = true,
  compact = false,
  initialViewMode = 'full',
  flipCourtSide = false,
  onToggleFlip,
  uiLanguage = 'th',
  showControls = true,
  onExpand,
  teamAName = 'Team A',
  teamBName = 'Team B',
  onHoverPoint,
  hoverPoint,
  aiPlayers,
}: BadmintonTouchCourtProps) {
  const isThai = uiLanguage === 'th';
  const svgRef = useRef<SVGSVGElement>(null);

  const [viewMode, setViewMode] = useState<'full' | 'half'>(initialViewMode);
  const [focusedHalf, setFocusedHalf] = useState<'top' | 'bottom'>('top');
  const [matchDoubles, setMatchDoubles] = useState(isDoubles);
  const [isDragging, setIsDragging] = useState(false);
  const [activeHoverPoint, setActiveHoverPoint] = useState<{ x: number; y: number } | null>(null);

  // Effective point: hoverPoint (external aim/stick) > activeHoverPoint (internal dragging) > pointX/pointY (committed action)
  const effectivePointX = hoverPoint?.x ?? activeHoverPoint?.x ?? pointX;
  const effectivePointY = hoverPoint?.y ?? activeHoverPoint?.y ?? pointY;

  // Check if current action or live aim has coordinates
  const hasPoint = typeof effectivePointX === 'number' && typeof effectivePointY === 'number';

  // Resolved live metadata for effective point
  const currentSelectionMeta = useMemo(() => {
    if (!hasPoint) return null;
    return resolveBadmintonPointSelection({
      normX: effectivePointX!,
      normY: effectivePointY!,
      flipCourtSide,
      isDoubles: matchDoubles,
      uiLanguage,
      focusedHalf: viewMode === 'half' ? focusedHalf : 'both',
    });
  }, [hasPoint, effectivePointX, effectivePointY, flipCourtSide, matchDoubles, uiLanguage, viewMode, focusedHalf]);

  const resolvePointFromEvent = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const clickY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));

    let normX = clickX;
    let normY = clickY;

    // If in half court view, remap Y from half court space to full court space
    if (viewMode === 'half') {
      if (focusedHalf === 'top') {
        normY = clickY * 0.5; // Maps 0..1 to 0..0.5
      } else {
        normY = 0.5 + clickY * 0.5; // Maps 0..1 to 0.5..1.0
      }
    }

    const payload = resolveBadmintonPointSelection({
      normX,
      normY,
      flipCourtSide,
      isDoubles: matchDoubles,
      uiLanguage,
      focusedHalf: viewMode === 'half' ? focusedHalf : 'both',
    });

    return { normX, normY, payload };
  }, [viewMode, focusedHalf, flipCourtSide, matchDoubles, uiLanguage]);

  // Pointer Down: Start dragging & aim preview
  const handleCourtPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
    setIsDragging(true);
    const res = resolvePointFromEvent(e.clientX, e.clientY);
    if (res) {
      setActiveHoverPoint({ x: res.normX, y: res.normY });
      onHoverPoint?.({
        ...res.payload,
        courtViewMode: viewMode,
      });
    }
  }, [resolvePointFromEvent, onHoverPoint, viewMode]);

  // Pointer Move: Update aim continuously while dragging
  const handleCourtPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging) return;
    const res = resolvePointFromEvent(e.clientX, e.clientY);
    if (res) {
      setActiveHoverPoint({ x: res.normX, y: res.normY });
      onHoverPoint?.({
        ...res.payload,
        courtViewMode: viewMode,
      });
    }
  }, [isDragging, resolvePointFromEvent, onHoverPoint, viewMode]);

  // Pointer Up: Commit point on release
  const handleCourtPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      setIsDragging(false);
      const res = resolvePointFromEvent(e.clientX, e.clientY);
      if (res) {
        setActiveHoverPoint(null);
        onSelectArea?.({
          ...res.payload,
          courtViewMode: viewMode,
        });
      }
    }
  }, [isDragging, resolvePointFromEvent, onSelectArea, viewMode]);

  // SVG dimensions & viewbox
  const viewBox = viewMode === 'half'
    ? (focusedHalf === 'top' ? '0 0 100 55' : '0 45 100 55')
    : '0 0 100 100';

  // Map full-court (effectivePointX, effectivePointY) to current SVG rendering coordinates
  const displayPoint = useMemo(() => {
    if (!hasPoint) return null;
    const px = effectivePointX! * 100;
    const py = effectivePointY! * 100;
    return { x: px, y: py };
  }, [hasPoint, effectivePointX, effectivePointY]);

  // BWF Court Line Constants in Percentage (0..100)
  const cLeft = MARGIN_X * 100; // 8%
  const cRight = (1 - MARGIN_X) * 100; // 92%
  const cTop = MARGIN_Y * 100; // 6%
  const cBottom = (1 - MARGIN_Y) * 100; // 94%
  const cWidth = COURT_W * 100; // 84%
  const cHeight = COURT_H * 100; // 88%
  const netYPct = 50; // 50%

  const sLeft = (MARGIN_X + SINGLES_SIDE_OFFSET) * 100; // ~14.33%
  const sRight = (1 - MARGIN_X - SINGLES_SIDE_OFFSET) * 100; // ~85.67%
  const sWidth = (COURT_W - 2 * SINGLES_SIDE_OFFSET) * 100; // ~71.34%

  const topShortServiceY = (0.5 - SHORT_SERVICE_OFFSET) * 100; // ~36.99%
  const bottomShortServiceY = (0.5 + SHORT_SERVICE_OFFSET) * 100; // ~63.01%

  const topDoublesLongServiceY = (MARGIN_Y + DOUBLES_LONG_SERVICE_OFFSET) * 100; // ~10.99%
  const bottomDoublesLongServiceY = (1 - MARGIN_Y - DOUBLES_LONG_SERVICE_OFFSET) * 100; // ~89.01%

  const topCourtSideLabel = flipCourtSide ? teamAName : teamBName;
  const bottomCourtSideLabel = flipCourtSide ? teamBName : teamAName;

  return (
    <div className={`relative flex flex-col items-center select-none w-full ${compact ? 'max-w-xs' : 'max-w-xl'}`}>
      {/* Top Toolbar (Controls & Status) */}
      {showControls && (
        <div className="flex items-center justify-between w-full mb-1.5 px-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-gray-300 flex items-center gap-1">
              <Target size={14} className="text-emerald-400" />
              <span>{isThai ? 'สนามแบดมินตัน' : 'Badminton Court'}</span>
            </span>
            <button
              type="button"
              onClick={() => setMatchDoubles(!matchDoubles)}
              title={isThai ? 'สลับประเภท เดี่ยว/คู่' : 'Toggle Singles/Doubles'}
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                matchDoubles ? 'bg-sky-600/40 text-sky-300 border border-sky-500/40' : 'bg-emerald-600/40 text-emerald-300 border border-emerald-500/40'
              }`}
            >
              {matchDoubles ? (isThai ? 'ประเภทคู่ (Doubles)' : 'Doubles') : (isThai ? 'ประเภทเดี่ยว (Singles)' : 'Singles')}
            </button>
          </div>

          <div className="flex items-center gap-1">
            {/* Full / Half Court Toggle */}
            <button
              type="button"
              onClick={() => setViewMode(prev => prev === 'full' ? 'half' : 'full')}
              title={isThai ? 'สลับมุมมอง เต็มสนาม / ครึ่งสนาม' : 'Toggle Full/Half Court'}
              className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-bold border border-gray-700 flex items-center gap-1 cursor-pointer"
            >
              <Layers size={11} className="text-sky-400" />
              <span>{viewMode === 'full' ? (isThai ? 'เต็มสนาม' : 'Full') : (isThai ? 'ครึ่งสนาม' : 'Half')}</span>
            </button>

            {/* Half Court Switcher */}
            {viewMode === 'half' && (
              <button
                type="button"
                onClick={() => setFocusedHalf(prev => prev === 'top' ? 'bottom' : 'top')}
                title={isThai ? 'สลับฝั่งที่โฟกัส' : 'Switch focused side'}
                className="px-1.5 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-600/40 text-[10px] font-bold cursor-pointer"
              >
                {focusedHalf === 'top' ? (isThai ? 'แดนคู่แข่ง' : 'Opponent') : (isThai ? 'แดนเรา' : 'Our Side')}
              </button>
            )}

            {/* Flip Sides */}
            {onToggleFlip && (
              <button
                type="button"
                onClick={onToggleFlip}
                title={isThai ? 'สลับฝั่งสนาม' : 'Flip Court Sides'}
                className="p-1 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 cursor-pointer"
              >
                <ArrowUpDown size={12} />
              </button>
            )}

            {/* Expand Modal button for HUD / compact mode */}
            {onExpand && (
              <button
                type="button"
                onClick={onExpand}
                title={isThai ? 'ขยายหน้าต่างแตะขนาดใหญ่' : 'Expand Touch Pad'}
                className="p-1 rounded bg-sky-600 hover:bg-sky-500 text-white cursor-pointer"
              >
                <Maximize2 size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Main Interactive Touch Surface */}
      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-emerald-600/50 shadow-2xl bg-gradient-to-b from-[#0b4d38] via-[#083a2b] to-[#0b4d38] p-1.5">
        {/* Out of bounds surround border & label */}
        <div className="absolute top-1 left-2 text-[9px] font-bold text-emerald-300/40 uppercase tracking-widest pointer-events-none">
          BWF 13.40m × {matchDoubles ? '6.10m' : '5.18m'}
        </div>

        {/* Court Team Labels */}
        {viewMode === 'full' && (
          <>
            <div className="absolute top-2 right-2 text-[10px] font-black text-amber-400/80 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none">
              {topCourtSideLabel} (Opp)
            </div>
            <div className="absolute bottom-2 right-2 text-[10px] font-black text-sky-400/80 bg-black/40 px-1.5 py-0.5 rounded pointer-events-none">
              {bottomCourtSideLabel} (Us)
            </div>
          </>
        )}

        <svg
          ref={svgRef}
          viewBox={viewBox}
          onPointerDown={handleCourtPointerDown}
          onPointerMove={handleCourtPointerMove}
          onPointerUp={handleCourtPointerUp}
          onPointerCancel={handleCourtPointerUp}
          className="w-full h-auto max-h-[58vh] cursor-crosshair touch-none transition-transform"
          style={{ aspectRatio: viewMode === 'half' ? '100 / 55' : '100 / 100' }}
        >
          <defs>
            {/* Court Mat Texture & Gradients */}
            <linearGradient id="badmintonMatGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0c5a42" />
              <stop offset="50%" stopColor="#083e2e" />
              <stop offset="100%" stopColor="#0c5a42" />
            </linearGradient>

            {/* Outer Out Margin Pattern */}
            <pattern id="outPattern" width="10" height="10" patternUnits="userSpaceOnUse">
              <path d="M-1,1 l2,-2 M0,10 l10,-10 M9,11 l2,-2" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
            </pattern>

            {/* Glowing Pin Filter */}
            <filter id="glowPin" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#00f0ff" />
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#00f0ff" floodOpacity="0.8" />
            </filter>
          </defs>

          {/* Out-of-bounds Outer Zone Background */}
          <rect x="0" y="0" width="100" height="100" fill="url(#outPattern)" />

          {/* Main Court Inner Playing Area */}
          <rect
            x={cLeft}
            y={cTop}
            width={cWidth}
            height={cHeight}
            fill="url(#badmintonMatGrad)"
            stroke="#ffffff"
            strokeWidth="0.9"
          />

          {/* Singles Sidelines (Inner boundary lines) */}
          <line
            x1={sLeft}
            y1={cTop}
            x2={sLeft}
            y2={cBottom}
            stroke="#ffffff"
            strokeWidth={matchDoubles ? "0.6" : "0.9"}
            opacity={matchDoubles ? 0.75 : 1}
          />
          <line
            x1={sRight}
            y1={cTop}
            x2={sRight}
            y2={cBottom}
            stroke="#ffffff"
            strokeWidth={matchDoubles ? "0.6" : "0.9"}
            opacity={matchDoubles ? 0.75 : 1}
          />

          {/* Doubles Long Service Lines (Inner back lines for service) */}
          <line
            x1={cLeft}
            y1={topDoublesLongServiceY}
            x2={cRight}
            y2={topDoublesLongServiceY}
            stroke="#ffffff"
            strokeWidth="0.6"
            opacity="0.75"
          />
          <line
            x1={cLeft}
            y1={bottomDoublesLongServiceY}
            x2={cRight}
            y2={bottomDoublesLongServiceY}
            stroke="#ffffff"
            strokeWidth="0.6"
            opacity="0.75"
          />

          {/* Short Service Lines (Front service line near net) */}
          <line
            x1={cLeft}
            y1={topShortServiceY}
            x2={cRight}
            y2={topShortServiceY}
            stroke="#ffffff"
            strokeWidth="0.8"
          />
          <line
            x1={cLeft}
            y1={bottomShortServiceY}
            x2={cRight}
            y2={bottomShortServiceY}
            stroke="#ffffff"
            strokeWidth="0.8"
          />

          {/* Center Lines (From short service line to back boundary) */}
          <line
            x1="50"
            y1={cTop}
            x2="50"
            y2={topShortServiceY}
            stroke="#ffffff"
            strokeWidth="0.7"
          />
          <line
            x1="50"
            y1={bottomShortServiceY}
            x2="50"
            y2={cBottom}
            stroke="#ffffff"
            strokeWidth="0.7"
          />

          {/* Net (Center Line with 3D White Tape & Mesh) */}
          <g className="net-structure">
            {/* Net Shadow */}
            <rect x="0" y="49.5" width="100" height="1" fill="rgba(0,0,0,0.5)" />
            {/* Net Mesh band */}
            <rect x="2" y="49.2" width="96" height="1.6" fill="#1e293b" opacity="0.9" />
            {/* Net White Top Tape */}
            <line x1="2" y1="50" x2="98" y2="50" stroke="#ffffff" strokeWidth="1.2" />
            {/* Net Posts */}
            <circle cx="2" cy="50" r="1.4" fill="#cbd5e1" stroke="#0f172a" strokeWidth="0.5" />
            <circle cx="98" cy="50" r="1.4" fill="#cbd5e1" stroke="#0f172a" strokeWidth="0.5" />
            {/* NET Label */}
            <text
              x="50"
              y="50.6"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#38bdf8"
              fontSize="2.4"
              fontWeight="900"
              letterSpacing="1"
            >
              NET
            </text>
          </g>

          {/* AI Tracked Players (AlphaPose Skeleton & Live Telemetry Overlay) */}
          {aiPlayers && aiPlayers.length > 0 && (
            <g className="ai-players-layer pointer-events-none">
              {aiPlayers.map((player) => {
                if (!player.court_pos_pct) return null;
                let px = 8 + (player.court_pos_pct.x / 100) * 84;
                let py = 6 + (player.court_pos_pct.y / 100) * 88;
                if (flipCourtSide) {
                  px = 8 + ((100 - player.court_pos_pct.x) / 100) * 84;
                  py = 6 + ((100 - player.court_pos_pct.y) / 100) * 88;
                }
                const isTeam1 = player.team === 1;
                const teamColor = isTeam1 ? '#38bdf8' : '#f59e0b';
                const actionColor = player.pose_action === 'SMASH' ? '#ef4444' : player.pose_action === 'NET_SHOT' ? '#10b981' : '#38bdf8';

                // AlphaPose Skeleton Bones
                const kpts = player.keypoints;
                const toSvgCoord = (k: { x: number; y: number }) => {
                  let kx = 8 + (k.x / 100) * 84;
                  let ky = 6 + (k.y / 100) * 88;
                  if (flipCourtSide) {
                    kx = 8 + ((100 - k.x) / 100) * 84;
                    ky = 6 + ((100 - k.y) / 100) * 88;
                  }
                  return { x: kx, y: ky };
                };

                const bonePairs = [
                  [5, 6], [5, 7], [7, 9], [6, 8], [8, 10], // Arms
                  [5, 11], [6, 12], [11, 12],             // Torso
                  [11, 13], [13, 15], [12, 14], [14, 16], // Legs
                ];

                return (
                  <g key={player.id} className="transition-all duration-150 ease-out">
                    {/* AlphaPose Skeleton Lines */}
                    {kpts && kpts.length >= 17 && (
                      <g className="skeleton-bones opacity-70">
                        {bonePairs.map(([i1, i2], bIdx) => {
                          const p1 = toSvgCoord(kpts[i1]);
                          const p2 = toSvgCoord(kpts[i2]);
                          return (
                            <line
                              key={bIdx}
                              x1={p1.x}
                              y1={p1.y}
                              x2={p2.x}
                              y2={p2.y}
                              stroke={teamColor}
                              strokeWidth="0.5"
                              strokeLinecap="round"
                            />
                          );
                        })}
                        {/* Joints */}
                        {kpts.map((k, jIdx) => {
                          const pt = toSvgCoord(k);
                          return (
                            <circle
                              key={jIdx}
                              cx={pt.x}
                              cy={pt.y}
                              r="0.5"
                              fill="#ffffff"
                            />
                          );
                        })}
                      </g>
                    )}

                    {/* Pulse Ground Shadow */}
                    <circle cx={px} cy={py} r="3.2" fill={teamColor} opacity="0.25" />
                    {/* Player Ground Pin */}
                    <circle cx={px} cy={py} r="1.8" fill={teamColor} stroke="#ffffff" strokeWidth="0.5" />

                    {/* Player Label */}
                    <text
                      x={px}
                      y={py - 2.5}
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="2.2"
                      fontWeight="900"
                      stroke="#0f172a"
                      strokeWidth="0.4"
                      paintOrder="stroke"
                    >
                      {`P${player.id}`}
                    </text>

                    {/* AlphaPose Stroke Action Badge */}
                    {player.pose_action && player.pose_action !== 'READY' && (
                      <g>
                        <rect
                          x={px - 6}
                          y={py - 6.2}
                          width="12"
                          height="2.8"
                          rx="0.8"
                          fill={actionColor}
                          opacity="0.92"
                        />
                        <text
                          x={px}
                          y={py - 4.2}
                          textAnchor="middle"
                          fill="#ffffff"
                          fontSize="1.6"
                          fontWeight="900"
                          letterSpacing="0.2"
                        >
                          {player.pose_action}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          )}

          {/* Selected Point Marker (Compact Precision Pin) */}
          {displayPoint && (
            <g className="point-marker pointer-events-none">
              {/* Precision Crosshair Lines */}
              <line
                x1={displayPoint.x - 2.5}
                y1={displayPoint.y}
                x2={displayPoint.x + 2.5}
                y2={displayPoint.y}
                stroke="#ffffff"
                strokeWidth="0.4"
                opacity="0.6"
              />
              <line
                x1={displayPoint.x}
                y1={displayPoint.y - 2.5}
                x2={displayPoint.x}
                y2={displayPoint.y + 2.5}
                stroke="#ffffff"
                strokeWidth="0.4"
                opacity="0.6"
              />
              {/* Outer Precision Ring */}
              <circle
                cx={displayPoint.x}
                cy={displayPoint.y}
                r="1.8"
                fill={currentSelectionMeta?.isIn ? '#0284c7' : '#e11d48'}
                stroke="#ffffff"
                strokeWidth="0.6"
                filter="url(#glowPin)"
              />
              {/* Center Dot */}
              <circle
                cx={displayPoint.x}
                cy={displayPoint.y}
                r="0.6"
                fill="#ffffff"
              />
            </g>
          )}
        </svg>

        {/* Floating Real-time Information Banner */}
        {currentSelectionMeta ? (
          <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 z-20 bg-slate-950/90 backdrop-blur-md border border-sky-500/40 rounded-xl px-3 py-1.5 shadow-2xl flex items-center gap-2 max-w-[92%]">
            {currentSelectionMeta.isIn ? (
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle size={16} className="text-rose-400 shrink-0" />
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-[11px] font-black text-white truncate">
                {currentSelectionMeta.areaLabel}
              </span>
              <span className="text-[9px] font-mono text-gray-300 truncate">
                {currentSelectionMeta.isIn
                  ? (isThai ? 'ลูกลงในสนาม (IN)' : 'Ball In Court')
                  : (isThai ? 'ลูกออกนอกสนาม (OUT)' : 'Out of Bounds')} • X: {((effectivePointX || 0) * 100).toFixed(0)}%, Y: {((effectivePointY || 0) * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        ) : (
          <div className="absolute bottom-3 left-1/2 transform -translate-x-1/2 z-10 bg-slate-950/70 backdrop-blur-sm border border-white/10 rounded-full px-3 py-1 pointer-events-none">
            <span className="text-[10px] font-semibold text-gray-300 flex items-center gap-1.5">
              <Sparkles size={11} className="text-amber-400" />
              {isThai ? 'แตะจุดบนสนามเพื่อระบุตำแหน่งลูกตก' : 'Tap on court to place landing point'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

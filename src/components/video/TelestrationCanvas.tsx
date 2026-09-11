import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import {
  Pencil,
  ArrowUpRight,
  Circle,
  Square,
  Sun,
  Type,
  Ruler,
  RotateCcw,
  Trash2,
  X,
  Eye,
  EyeOff,
  Clock,
  Filter,
} from 'lucide-react';
import type { WorkstationLeftTool } from '../workstation/WorkstationChrome';
import type { TelestrationShape, TelestrationTool, TelestrationPoint } from '../../types';
import { formatPreciseTime } from '../../utils';

interface TelestrationCanvasProps {
  activeTool?: WorkstationLeftTool | null;
  onClose?: () => void;
  language?: 'th' | 'en';
  isCalibrated?: boolean;
  currentTime?: number;
  persistedShapes?: TelestrationShape[];
  onSaveAnnotations?: (shapes: TelestrationShape[]) => void;
  isReadOnly?: boolean;
  activeEventId?: string;
}

const COLORS = [
  { label: 'Cyan', value: '#00f0ff' },
  { label: 'Yellow', value: '#ffee00' },
  { label: 'Red', value: '#ff3344' },
  { label: 'White', value: '#ffffff' },
  { label: 'Green', value: '#00ff66' },
];

const DURATION_OPTIONS = [
  { label: '1s', value: 1.0 },
  { label: '2s', value: 2.0 },
  { label: '3s', value: 3.0 },
  { label: '5s', value: 5.0 },
  { label: '10s', value: 10.0 },
  { label: '∞', value: 0 },
];

export default function TelestrationCanvas({
  activeTool,
  onClose,
  language = 'th',
  isCalibrated = false,
  currentTime = 0,
  persistedShapes = [],
  onSaveAnnotations,
  isReadOnly = false,
  activeEventId,
}: TelestrationCanvasProps) {
  const isThai = language === 'th';
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const getInitialTool = (tool?: WorkstationLeftTool | null): TelestrationTool => {
    switch (tool) {
      case 'measure': return 'measure';
      case 'text': return 'text';
      case 'annotate':
      case 'draw':
      default: return 'arrow';
    }
  };

  const [currentTool, setCurrentTool] = useState<TelestrationTool>(() => getInitialTool(activeTool));
  const [selectedColor, setSelectedColor] = useState('#00f0ff');
  const [lineWidth, setLineWidth] = useState(3);
  const [selectedDuration, setSelectedDuration] = useState<number>(3.0);
  const [timeFilterMode, setTimeFilterMode] = useState<boolean>(true);

  const [shapes, setShapes] = useState<TelestrationShape[]>(persistedShapes);
  const [currentShape, setCurrentShape] = useState<TelestrationShape | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [textInputPos, setTextInputPos] = useState<TelestrationPoint | null>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (persistedShapes) {
      setShapes(persistedShapes);
    }
  }, [persistedShapes]);

  useEffect(() => {
    if (activeTool) {
      setCurrentTool(getInitialTool(activeTool));
    }
  }, [activeTool]);

  const updateCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
    }
  }, []);

  useEffect(() => {
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [updateCanvasSize]);

  const activeVisibleShapes = useMemo(() => {
    if (!timeFilterMode) return shapes;
    return shapes.filter(shape => {
      if (!shape.duration || shape.duration === 0) return true;
      const start = shape.timestamp || 0;
      const end = shape.endTime ?? (start + shape.duration);
      return currentTime >= start && currentTime <= end;
    });
  }, [shapes, timeFilterMode, currentTime]);

  const drawArrow = (ctx: CanvasRenderingContext2D, from: TelestrationPoint, to: TelestrationPoint, color: string, width: number) => {
    const headLength = 16;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const angle = Math.atan2(dy, dx);

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(
      to.x - headLength * Math.cos(angle - Math.PI / 6),
      to.y - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.lineTo(
      to.x - headLength * Math.cos(angle + Math.PI / 6),
      to.y - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isVisible) return;

    const shapesToRender = currentShape
      ? [...activeVisibleShapes, currentShape]
      : activeVisibleShapes;

    shapesToRender.forEach(shape => {
      ctx.save();
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const pts = shape.points;
      if (pts.length === 0) {
        ctx.restore();
        return;
      }

      switch (shape.type) {
        case 'pen': {
          if (pts.length < 2) break;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
          break;
        }

        case 'arrow': {
          if (pts.length >= 2) {
            drawArrow(ctx, pts[0], pts[pts.length - 1], shape.color, shape.lineWidth);
          }
          break;
        }

        case 'circle': {
          if (pts.length >= 2) {
            const center = pts[0];
            const edge = pts[pts.length - 1];
            const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
            ctx.beginPath();
            ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.fillStyle = `${shape.color}18`;
            ctx.fill();
          }
          break;
        }

        case 'box': {
          if (pts.length >= 2) {
            const start = pts[0];
            const end = pts[pts.length - 1];
            const x = Math.min(start.x, end.x);
            const y = Math.min(start.y, end.y);
            const w = Math.abs(end.x - start.x);
            const h = Math.abs(end.y - start.y);

            ctx.beginPath();
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = `${shape.color}15`;
            ctx.fillRect(x, y, w, h);
          }
          break;
        }

        case 'spotlight': {
          const center = pts[0];
          const radius = pts.length >= 2
            ? Math.hypot(pts[pts.length - 1].x - center.x, pts[pts.length - 1].y - center.y)
            : 60;

          ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';

          ctx.strokeStyle = shape.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(center.x, center.y, radius, 0, 2 * Math.PI);
          ctx.stroke();
          break;
        }

        case 'measure': {
          if (pts.length >= 2) {
            const from = pts[0];
            const to = pts[pts.length - 1];
            const pixelDist = Math.hypot(to.x - from.x, to.y - from.y);

            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.moveTo(from.x, from.y);
            ctx.lineTo(to.x, to.y);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.beginPath();
            ctx.arc(from.x, from.y, 4, 0, 2 * Math.PI);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(to.x, to.y, 4, 0, 2 * Math.PI);
            ctx.fill();

            const approxMeters = (pixelDist / (canvas.width * 0.08)).toFixed(1);
            const midX = (from.x + to.x) / 2;
            const midY = (from.y + to.y) / 2 - 10;

            ctx.font = 'bold 12px monospace';
            const labelText = `~${approxMeters}m (${Math.round(pixelDist)}px)`;
            const textWidth = ctx.measureText(labelText).width;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(midX - textWidth / 2 - 4, midY - 12, textWidth + 8, 16);
            ctx.fillStyle = shape.color;
            ctx.fillText(labelText, midX - textWidth / 2, midY);
          }
          break;
        }

        case 'text': {
          if (pts.length >= 1 && shape.text) {
            const pos = pts[0];
            ctx.font = 'bold 13px sans-serif';
            const textWidth = ctx.measureText(shape.text).width;

            ctx.fillStyle = 'rgba(9, 18, 26, 0.85)';
            ctx.strokeStyle = shape.color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.roundRect(pos.x - 6, pos.y - 18, textWidth + 12, 24, 6);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = shape.color;
            ctx.fillText(shape.text, pos.x, pos.y - 2);
          }
          break;
        }
      }

      ctx.restore();
    });
  }, [activeVisibleShapes, currentShape, isVisible]);

  useEffect(() => {
    redraw();
  }, [redraw]);

  const getPointerPos = (e: React.PointerEvent<HTMLCanvasElement>): TelestrationPoint => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isReadOnly || e.button !== 0) return;
    const pos = getPointerPos(e);

    if (currentTool === 'text') {
      setTextInputPos(pos);
      setTextInputValue('');
      return;
    }

    setIsDrawing(true);
    const newShape: TelestrationShape = {
      id: `shape-${Date.now()}`,
      type: currentTool,
      color: selectedColor,
      lineWidth,
      points: [pos],
      timestamp: currentTime,
      duration: selectedDuration,
      endTime: selectedDuration > 0 ? currentTime + selectedDuration : undefined,
      eventId: activeEventId,
      label: `${currentTool.toUpperCase()} @ ${formatPreciseTime(currentTime)}`,
    };
    setCurrentShape(newShape);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentShape || isReadOnly) return;
    const pos = getPointerPos(e);

    if (currentTool === 'pen') {
      setCurrentShape(prev => prev ? { ...prev, points: [...prev.points, pos] } : null);
    } else {
      setCurrentShape(prev => prev ? { ...prev, points: [prev.points[0], pos] } : null);
    }
  };

  const handlePointerUp = () => {
    if (isDrawing && currentShape && !isReadOnly) {
      if (currentShape.points.length > 1 || currentShape.type === 'spotlight') {
        const nextShapes = [...shapes, currentShape];
        setShapes(nextShapes);
        onSaveAnnotations?.(nextShapes);
      }
      setCurrentShape(null);
      setIsDrawing(false);
    }
  };

  const handleTextSubmit = () => {
    if (textInputPos && textInputValue.trim()) {
      const textShape: TelestrationShape = {
        id: `text-${Date.now()}`,
        type: 'text',
        color: selectedColor,
        lineWidth: 2,
        points: [textInputPos],
        text: textInputValue.trim(),
        timestamp: currentTime,
        duration: selectedDuration,
        endTime: selectedDuration > 0 ? currentTime + selectedDuration : undefined,
        eventId: activeEventId,
        label: `NOTE: "${textInputValue.trim()}" @ ${formatPreciseTime(currentTime)}`,
      };
      const nextShapes = [...shapes, textShape];
      setShapes(nextShapes);
      onSaveAnnotations?.(nextShapes);
    }
    setTextInputPos(null);
    setTextInputValue('');
  };

  const handleUndo = () => {
    const nextShapes = shapes.slice(0, -1);
    setShapes(nextShapes);
    onSaveAnnotations?.(nextShapes);
  };

  const handleClear = () => {
    setShapes([]);
    setCurrentShape(null);
    onSaveAnnotations?.([]);
  };

  if (isReadOnly) {
    return (
      <div
        ref={containerRef}
        className="absolute inset-0 z-20 pointer-events-none select-none overflow-hidden"
      >
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-30 pointer-events-auto select-none overflow-hidden"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-full h-full ${
          currentTool === 'text'
            ? 'cursor-text'
            : currentTool === 'measure'
            ? 'cursor-crosshair'
            : 'cursor-crosshair'
        }`}
      />

      {textInputPos && (
        <div
          className="absolute z-40 bg-[#09141d] border border-sky-500 rounded-lg p-1.5 shadow-2xl flex items-center gap-1.5"
          style={{
            left: Math.min(textInputPos.x, (canvasRef.current?.width || 300) - 220),
            top: Math.max(textInputPos.y - 40, 10),
          }}
        >
          <input
            type="text"
            autoFocus
            value={textInputValue}
            onChange={e => setTextInputValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleTextSubmit();
              if (e.key === 'Escape') setTextInputPos(null);
            }}
            placeholder={isThai ? 'พิมพ์ข้อความแท็กติก...' : 'Type tactical note...'}
            className="bg-[#111c26] text-white text-xs px-2 py-1 rounded border border-[#263642] focus:outline-none focus:border-sky-400 w-44"
          />
          <button
            type="button"
            onClick={handleTextSubmit}
            className="px-2 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded text-xs font-bold cursor-pointer"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => setTextInputPos(null)}
            className="p-1 text-gray-400 hover:text-white cursor-pointer"
          >
            <X size={13} />
          </button>
        </div>
      )}

      <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-40 bg-[#09141d]/90 backdrop-blur-md border border-[#263642] shadow-2xl rounded-2xl px-2.5 py-1.5 flex flex-wrap items-center justify-center gap-2 max-w-[95vw]">
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-300 font-mono text-[11px] font-bold"
          title={isThai ? `เวลาวิดีโอปัจจุบัน: ${formatPreciseTime(currentTime)}` : `Current Video Time: ${formatPreciseTime(currentTime)}`}
        >
          <Clock size={12} className="text-amber-400" />
          <span>{formatPreciseTime(currentTime)}</span>
        </div>

        <span className="w-px h-4 bg-white/20" />

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCurrentTool('arrow')}
            title={isThai ? 'ลูกศรแท็กติก (Arrow)' : 'Arrow'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              currentTool === 'arrow' ? 'bg-sky-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <ArrowUpRight size={15} />
          </button>

          <button
            type="button"
            onClick={() => setCurrentTool('circle')}
            title={isThai ? 'วงกลมเน้นตำแหน่ง (Circle)' : 'Circle'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              currentTool === 'circle' ? 'bg-sky-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Circle size={15} />
          </button>

          <button
            type="button"
            onClick={() => setCurrentTool('box')}
            title={isThai ? 'กรอบสี่เหลี่ยม (Box)' : 'Box'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              currentTool === 'box' ? 'bg-sky-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Square size={15} />
          </button>

          <button
            type="button"
            onClick={() => setCurrentTool('spotlight')}
            title={isThai ? 'สปอตไลต์ไฮไลต์ (Spotlight)' : 'Spotlight'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              currentTool === 'spotlight' ? 'bg-sky-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Sun size={15} />
          </button>

          <button
            type="button"
            onClick={() => setCurrentTool('pen')}
            title={isThai ? 'วาดอิสระ (Freehand Pen)' : 'Freehand Pen'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              currentTool === 'pen' ? 'bg-sky-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Pencil size={15} />
          </button>

          <button
            type="button"
            onClick={() => setCurrentTool('measure')}
            title={isThai ? 'ไม้วัดระยะทาง (Measure Ruler)' : 'Measure Ruler'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              currentTool === 'measure' ? 'bg-sky-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Ruler size={15} />
          </button>

          <button
            type="button"
            onClick={() => setCurrentTool('text')}
            title={isThai ? 'ป้ายข้อความ (Text Annotation)' : 'Text Annotation'}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              currentTool === 'text' ? 'bg-sky-500 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Type size={15} />
          </button>
        </div>

        <span className="w-px h-4 bg-white/20" />

        <div className="flex items-center gap-1 bg-[#111c26] border border-[#263642] rounded-lg p-0.5">
          <span className="text-[10px] text-gray-400 font-bold px-1 hidden sm:inline">
            {isThai ? 'แสดง:' : 'Duration:'}
          </span>
          {DURATION_OPTIONS.map(opt => (
            <button
              key={opt.label}
              type="button"
              onClick={() => setSelectedDuration(opt.value)}
              title={isThai ? `ระยะเวลาแสดงผล ${opt.label}` : `Show for ${opt.label}`}
              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold cursor-pointer transition-colors ${
                selectedDuration === opt.value
                  ? 'bg-sky-500 text-white'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <span className="w-px h-4 bg-white/20" />

        <div className="flex items-center gap-1">
          {COLORS.map(c => (
            <button
              key={c.value}
              type="button"
              onClick={() => setSelectedColor(c.value)}
              title={c.label}
              style={{ backgroundColor: c.value }}
              className={`w-4 h-4 rounded-full transition-transform cursor-pointer ${
                selectedColor === c.value ? 'ring-2 ring-white scale-125' : 'opacity-70 hover:opacity-100'
              }`}
            />
          ))}
        </div>

        <span className="w-px h-4 bg-white/20" />

        <button
          type="button"
          onClick={() => setTimeFilterMode(!timeFilterMode)}
          title={timeFilterMode
            ? (isThai ? 'แสดงเฉพาะช่วงเวลาปัจจุบัน (Time-Synced)' : 'Showing time-synced only')
            : (isThai ? 'แสดงภาพวาดทั้งหมด (Show All)' : 'Showing all drawings')}
          className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
            timeFilterMode
              ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
          }`}
        >
          <Filter size={11} />
          <span className="hidden sm:inline">{timeFilterMode ? (isThai ? 'ตามเวลา' : 'Time-Sync') : (isThai ? 'ทั้งหมด' : 'All')}</span>
        </button>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleUndo}
            disabled={shapes.length === 0}
            title={isThai ? 'ย้อนกลับเส้นวาด (Undo)' : 'Undo'}
            className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
          >
            <RotateCcw size={14} />
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={shapes.length === 0}
            title={isThai ? 'ล้างกระดานวาด (Clear All)' : 'Clear All'}
            className="p-1.5 text-rose-400 hover:text-rose-300 disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
          >
            <Trash2 size={14} />
          </button>

          <button
            type="button"
            onClick={() => setIsVisible(!isVisible)}
            title={isVisible ? (isThai ? 'ซ่อนภาพวาด' : 'Hide Drawings') : (isThai ? 'แสดงภาพวาด' : 'Show Drawings')}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title={isThai ? 'ปิดโหมดวาด (Close)' : 'Close'}
              className="p-1.5 text-gray-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

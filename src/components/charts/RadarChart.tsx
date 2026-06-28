import React from 'react';

interface RadarData {
  name: string;
  value: number; // 0-100
}

interface RadarChartProps {
  data: RadarData[];
  size?: number;
}

export default function RadarChart({ data, size = 300 }: RadarChartProps) {
  const center = size / 2;
  const radius = (size / 2) * 0.8; // 80% of half size to leave room for labels
  const angleStep = (Math.PI * 2) / data.length;

  const getPoint = (val: number, index: number) => {
    const r = (val / 100) * radius;
    const a = index * angleStep - Math.PI / 2; // start from top
    return {
      x: center + r * Math.cos(a),
      y: center + r * Math.sin(a)
    };
  };

  const points = data.map((d, i) => getPoint(d.value, i));
  const polygonPoints = points.map(p => `${p.x},${p.y}`).join(' ');

  // Grid levels (20, 40, 60, 80, 100)
  const levels = [20, 40, 60, 80, 100];

  if (data.length < 3) return null;

  return (
    <div className="relative flex justify-center items-center w-full" style={{ height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background grid */}
        {levels.map((level, i) => {
          const levelPoints = data.map((_, index) => getPoint(level, index));
          return (
            <polygon
              key={i}
              points={levelPoints.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-gray-300 dark:text-gray-700"
            />
          );
        })}

        {/* Axes */}
        {data.map((_, i) => {
          const end = getPoint(100, i);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={end.x}
              y2={end.y}
              stroke="currentColor"
              strokeWidth="0.5"
              className="text-gray-300 dark:text-gray-700"
            />
          );
        })}

        {/* Data polygon */}
        <polygon
          points={polygonPoints}
          fill="currentColor"
          fillOpacity="0.2"
          stroke="currentColor"
          strokeWidth="2"
          className="text-sky-500"
        />

        {/* Data points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="3"
            fill="currentColor"
            className="text-sky-600 dark:text-sky-400"
          />
        ))}

        {/* Labels */}
        {data.map((d, i) => {
          const labelPos = getPoint(120, i); // push labels further out
          return (
            <text
              key={i}
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              alignmentBaseline="middle"
              fontSize="10"
              className="fill-gray-600 dark:fill-gray-400 font-medium"
            >
              {d.name}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

'use client';

import React, { useId } from 'react';

interface MiniSparklineProps {
  rxHistory?: number[];
  txHistory?: number[];
  width?: number;
  height?: number;
  className?: string;
  showLabels?: boolean;
}

export function MiniSparkline({
  rxHistory,
  txHistory,
  width = 110,
  height = 24,
  className = '',
  showLabels = false,
}: MiniSparklineProps) {
  const gradId = useId().replace(/:/g, '');
  const rx =
    rxHistory && rxHistory.length > 1
      ? rxHistory
      : [0.2, 0.35, 0.28, 0.45, 0.38, 0.52, 0.41, 0.48];
  const tx =
    txHistory && txHistory.length > 1
      ? txHistory
      : rx.map((v) => Math.max(0.05, Number((v * 0.35).toFixed(2))));

  const allValues = [...rx, ...tx];
  const minVal = Math.min(...allValues, 0);
  const peakVal = Math.max(...allValues, 0.5);
  const span = Math.max(0.25, peakVal - minVal);

  const padX = 2;
  const padY = 3;
  const innerW = Math.max(10, width - padX * 2);
  const innerH = Math.max(8, height - padY * 2);

  const toCoords = (arr: number[]) =>
    arr.map((val, idx) => {
      const x = padX + (idx / Math.max(1, arr.length - 1)) * innerW;
      const norm = Math.min(1, Math.max(0, (val - minVal) / (span * 1.12)));
      const y = padY + innerH - norm * innerH;
      return { x, y, val };
    });

  const rxCoords = toCoords(rx);
  const txCoords = toCoords(tx);

  const rxPoints = rxCoords
    .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(' ');
  const txPoints = txCoords
    .map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
    .join(' ');

  const firstRx = rxCoords[0];
  const lastRx = rxCoords[rxCoords.length - 1];
  const areaPoints = `${firstRx.x.toFixed(1)},${(padY + innerH).toFixed(
    1
  )} ${rxPoints} ${lastRx.x.toFixed(1)},${(padY + innerH).toFixed(1)}`;

  const currentRx = rx[rx.length - 1] ?? 0;
  const maxRx = Math.max(...rx);

  return (
    <div className={`flex flex-col ${className}`}>
      <div
        className="relative bg-slate-950/85 border border-slate-800/90 rounded overflow-hidden"
        title={`Live Stream Activity • Current: ↓ ${currentRx} Mbps (Peak: ${maxRx} Mbps)`}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full block overflow-visible"
          style={{ height: `${height}px` }}
        >
          <defs>
            <linearGradient id={`rxGrad-${gradId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Subtle horizontal midline */}
          <line
            x1={padX}
            y1={height / 2}
            x2={width - padX}
            y2={height / 2}
            stroke="#1e293b"
            strokeWidth="0.75"
            strokeDasharray="2 2"
          />

          {/* Download (RX) shaded area */}
          <polygon points={areaPoints} fill={`url(#rxGrad-${gradId})`} />

          {/* Upload (TX) secondary line */}
          <polyline
            fill="none"
            stroke="#34d399"
            strokeOpacity="0.65"
            strokeWidth="1.1"
            points={txPoints}
          />

          {/* Download (RX) primary line */}
          <polyline
            fill="none"
            stroke="#38bdf8"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={rxPoints}
          />

          {/* Live pulsing endpoint dot */}
          {lastRx && (
            <circle
              cx={lastRx.x}
              cy={lastRx.y}
              r="2.1"
              fill="#38bdf8"
              stroke="#0f172a"
              strokeWidth="0.8"
            />
          )}
        </svg>
      </div>
      {showLabels && (
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 mt-1 px-0.5">
          <span>-45s Stream History</span>
          <span className="text-sky-300">Peak ↓ {maxRx} Mbps</span>
          <span className="text-emerald-300">Now ↓ {currentRx} Mbps</span>
        </div>
      )}
    </div>
  );
}

import React from 'react';

export function classNames(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function formatPreciseTime(seconds: number): string {
  if (!Number.isFinite(seconds) || isNaN(seconds)) return '00:00.00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  
  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');
  const msStr = ms.toString().padStart(2, '0');
  
  if (h > 0) return `${h}:${mStr}:${sStr}.${Math.floor(ms / 10)}`; // hh:mm:ss.S for long
  return `${mStr}:${sStr}.${msStr}`; // mm:ss.SS for short
}

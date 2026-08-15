import React from 'react';

export interface ProgressProps {
  value: number;
  max?: number;
  label?: string;
  sublabel?: string;
  showPercent?: boolean;
}

export function Progress({ value, max = 100, label, sublabel, showPercent = true }: ProgressProps) {
  const percentage = Math.min(100, Math.max(0, Math.round((value / max) * 100)));

  return (
    <div className="space-y-1.5 w-full">
      {(label || showPercent) && (
        <div className="flex justify-between text-xs font-mono font-semibold text-zinc-300">
          {label && <span>{label}</span>}
          {showPercent && <span className="text-orange-400 font-bold">{percentage}%</span>}
        </div>
      )}
      <div className="w-full bg-zinc-950 rounded-none h-3 overflow-hidden border border-zinc-800 p-0.5 relative flex">
        <div
          className="h-full bg-orange-500 transition-all duration-300 ease-out rounded-none"
          style={{
            width: `${percentage}%`,
          }}
        />
      </div>
      {sublabel && <p className="text-[11px] font-mono text-zinc-500">{sublabel}</p>}
    </div>
  );
}

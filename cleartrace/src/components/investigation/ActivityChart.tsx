import React, { useMemo, useState } from 'react';
import { InvestigationRecord } from '@/src/types/investigation';

export function ActivityChart({
  investigations,
}: {
  investigations: InvestigationRecord[];
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const series = useMemo(() => {
    const days: Array<{ key: string; label: string; scans: number }> = [];
    const now = new Date();

    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
      }).format(d);
      days.push({ key, label, scans: 0 });
    }

    investigations.forEach((inv) => {
      const dayKey = (inv.createdAt || '').slice(0, 10);
      const bucket = days.find((d) => d.key === dayKey);
      if (bucket) {
        bucket.scans += 1;
      }
    });

    return days;
  }, [investigations]);

  const maxVal = Math.max(...series.map((d) => d.scans), 4);
  const totalInWindow = series.reduce((sum, d) => sum + d.scans, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>14-Day Authorized Scan Volume ({totalInWindow} total)</span>
        <span className="font-mono tabular-nums text-slate-700">
          {hoveredIdx !== null
            ? `${series[hoveredIdx].label}: ${series[hoveredIdx].scans} ${
                series[hoveredIdx].scans === 1 ? 'scan' : 'scans'
              }`
            : 'Hover a day bar to inspect'}
        </span>
      </div>

      <div className="relative h-36 pt-3 pb-6 border-b border-slate-200 flex items-end gap-1.5 sm:gap-2.5">
        {series.map((point, idx) => {
          const heightPct =
            point.scans === 0 ? 8 : Math.round((point.scans / maxVal) * 100);
          const isHovered = hoveredIdx === idx;
          return (
            <div
              key={point.key}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              className="flex-1 h-full flex flex-col justify-end items-center group cursor-pointer"
            >
              <div
                className={`w-full rounded-t transition-colors duration-150 ${
                  point.scans === 0
                    ? 'bg-slate-100'
                    : isHovered
                    ? 'bg-[#991B1B]'
                    : 'bg-gradient-to-t from-[#DC2626] to-rose-400'
                }`}
                style={{ height: `${heightPct}%` }}
                aria-label={`${point.label}: ${point.scans} investigations`}
              />
              <span className="mt-1.5 text-[10px] font-mono text-slate-400 tabular-nums hidden sm:block">
                {idx % 3 === 0 ? point.label.split(' ')[1] : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

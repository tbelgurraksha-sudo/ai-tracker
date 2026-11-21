import React, { useState } from 'react';
import {
  formatDuration,
  formatShortDate,
  getDayName,
} from '../lib/discipline.ts';
import type { ActivityCategory, DailyRecord } from '../types/discipline.ts';

export interface DailyChartDatum {
  date: string;
  totalMinutes: number;
  status: 'PASS' | 'FAIL' | 'NOT_RECORDED';
}

interface DailyHoursChartProps {
  data: DailyChartDatum[];
  targetMinutes: number;
  onSelectDate?: (date: string) => void;
}

export const DailyHoursChart: React.FC<DailyHoursChartProps> = ({
  data,
  targetMinutes,
  onSelectDate,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const width = 720;
  const height = 240;
  const padLeft = 42;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxMinutes = Math.max(
    targetMinutes + 120,
    ...data.map((d) => d.totalMinutes),
    480
  );
  const maxHours = Math.ceil(maxMinutes / 60);
  const scaleMax = maxHours * 60;

  const yForMin = (m: number) => padTop + plotH - (m / scaleMax) * plotH;
  const targetY = yForMin(targetMinutes);

  const count = Math.max(1, data.length);
  const slotW = plotW / count;
  const barW = Math.max(4, Math.min(28, slotW * 0.62));

  const gridHours: number[] = [];
  const step = maxHours <= 8 ? 2 : 3;
  for (let h = 0; h <= maxHours; h += step) {
    gridHours.push(h);
  }

  const labelInterval = count <= 10 ? 1 : count <= 20 ? 3 : Math.ceil(count / 8);

  const hovered = hoveredIdx !== null ? data[hoveredIdx] : null;

  return (
    <div className="relative w-full">
      {hovered && (
        <div className="mb-2 flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
          <span className="font-mono">
            {hovered.date} ({getDayName(hovered.date)})
          </span>
          <span className="font-mono font-semibold tabular-nums">
            {formatDuration(hovered.totalMinutes)} ·{' '}
            <span
              className={
                hovered.status === 'PASS'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : hovered.status === 'FAIL'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-500 dark:text-slate-400'
              }
            >
              {hovered.status === 'NOT_RECORDED' ? 'NOT RECORDED' : hovered.status}
            </span>
          </span>
        </div>
      )}

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible select-none"
        role="img"
        aria-label="Daily productive hours chart with target reference line"
      >
        {gridHours.map((h) => {
          const y = yForMin(h * 60);
          return (
            <g key={h}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                className="stroke-slate-200 dark:stroke-slate-800"
                strokeWidth={1}
              />
              <text
                x={padLeft - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
              >
                {h}h
              </text>
            </g>
          );
        })}

        {/* Target reference line */}
        <line
          x1={padLeft}
          x2={width - padRight}
          y1={targetY}
          y2={targetY}
          className="stroke-emerald-500"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        <text
          x={width - padRight}
          y={targetY - 6}
          textAnchor="end"
          className="fill-emerald-600 dark:fill-emerald-400 text-[10px] font-mono font-semibold"
        >
          Target {(targetMinutes / 60).toFixed(1)}h
        </text>

        {data.map((d, idx) => {
          const cx = padLeft + idx * slotW + slotW / 2;
          const x = cx - barW / 2;
          const barH = d.totalMinutes > 0 ? Math.max(3, (d.totalMinutes / scaleMax) * plotH) : 2;
          const y = padTop + plotH - barH;
          const isHovered = hoveredIdx === idx;

          const fillClass =
            d.status === 'PASS'
              ? isHovered
                ? 'fill-emerald-400'
                : 'fill-emerald-500'
              : d.status === 'FAIL'
                ? isHovered
                  ? 'fill-red-400'
                  : 'fill-red-500'
                : 'fill-slate-300 dark:fill-slate-700';

          return (
            <g
              key={d.date}
              className={onSelectDate ? 'cursor-pointer' : undefined}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => onSelectDate?.(d.date)}
            >
              <rect
                x={padLeft + idx * slotW}
                y={padTop}
                width={slotW}
                height={plotH}
                fill="transparent"
              />
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                rx={Math.min(4, barW / 2)}
                className={`${fillClass} transition-opacity`}
              />
              {idx % labelInterval === 0 && (
                <text
                  x={cx}
                  y={height - 10}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
                >
                  {count <= 7 ? getDayName(d.date) : formatShortDate(d.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

interface PeriodBarDatum {
  label: string;
  totalMinutes: number;
  secondaryLabel: string;
}

export const PeriodBarChart: React.FC<{
  data: PeriodBarDatum[];
  accentColor?: 'emerald' | 'sky';
}> = ({ data, accentColor = 'emerald' }) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const width = 560;
  const height = 200;
  const padLeft = 42;
  const padRight = 14;
  const padTop = 18;
  const padBottom = 32;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxMinutes = Math.max(360, ...data.map((d) => d.totalMinutes));
  const count = Math.max(1, data.length);
  const slotW = plotW / count;
  const barW = Math.max(10, Math.min(36, slotW * 0.56));

  const yForMin = (m: number) => padTop + plotH - (m / maxMinutes) * plotH;
  const hoveredItem = hovered !== null ? data[hovered] : null;

  return (
    <div className="w-full">
      {hoveredItem && (
        <div className="mb-2 flex items-center justify-between text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200">
          <span>{hoveredItem.label}</span>
          <span className="font-mono font-semibold tabular-nums">
            {formatDuration(hoveredItem.totalMinutes)} · {hoveredItem.secondaryLabel}
          </span>
        </div>
      )}
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
        {[0, 0.5, 1].map((ratio) => {
          const mins = Math.round(maxMinutes * ratio);
          const y = yForMin(mins);
          return (
            <g key={ratio}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                className="stroke-slate-200 dark:stroke-slate-800"
              />
              <text
                x={padLeft - 6}
                y={y + 4}
                textAnchor="end"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
              >
                {Math.round(mins / 60)}h
              </text>
            </g>
          );
        })}

        {data.map((d, idx) => {
          const cx = padLeft + idx * slotW + slotW / 2;
          const x = cx - barW / 2;
          const barH = d.totalMinutes > 0 ? Math.max(4, (d.totalMinutes / maxMinutes) * plotH) : 2;
          const y = padTop + plotH - barH;
          const fillClass =
            d.totalMinutes === 0
              ? 'fill-slate-300 dark:fill-slate-700'
              : accentColor === 'sky'
                ? hovered === idx
                  ? 'fill-sky-400'
                  : 'fill-sky-500'
                : hovered === idx
                  ? 'fill-emerald-400'
                  : 'fill-emerald-500';

          return (
            <g
              key={d.label}
              onMouseEnter={() => setHovered(idx)}
              onMouseLeave={() => setHovered(null)}
            >
              <rect
                x={padLeft + idx * slotW}
                y={padTop}
                width={slotW}
                height={plotH}
                fill="transparent"
              />
              <rect x={x} y={y} width={barW} height={barH} rx={4} className={fillClass} />
              <text
                x={cx}
                y={height - 10}
                textAnchor="middle"
                className="fill-slate-500 dark:fill-slate-400 text-[10px] font-mono"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export const CategoryDistributionList: React.FC<{
  items: Array<{ category: ActivityCategory; minutes: number; count: number }>;
}> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
        No categorized activities logged in this range.
      </div>
    );
  }
  const total = items.reduce((sum, item) => sum + item.minutes, 0) || 1;

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const pct = Math.round((item.minutes / total) * 100);
        return (
          <div key={item.category} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                {item.category}
              </span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                {formatDuration(item.minutes)} · {pct}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.max(2, pct)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const DisciplineHeatmap: React.FC<{
  dates: string[];
  recordsByDate: Map<string, DailyRecord>;
  onSelectDate?: (date: string) => void;
}> = ({ dates, recordsByDate, onSelectDate }) => {
  return (
    <div>
      <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-14 lg:grid-cols-15 gap-1.5">
        {dates.map((dateStr) => {
          const rec = recordsByDate.get(dateStr);
          const status = rec ? rec.status : 'NOT_RECORDED';
          const bgClass =
            status === 'PASS'
              ? 'bg-emerald-500/85 hover:bg-emerald-400 text-white'
              : status === 'FAIL'
                ? 'bg-red-500/85 hover:bg-red-400 text-white'
                : 'bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400';
          const titleText = rec
            ? `${dateStr}: ${formatDuration(rec.totalMinutes)} (${rec.status})`
            : `${dateStr}: NOT RECORDED`;

          return (
            <button
              key={dateStr}
              type="button"
              title={titleText}
              onClick={() => onSelectDate?.(dateStr)}
              className={`h-8 rounded-md text-[10px] font-mono tabular-nums flex items-center justify-center transition-colors cursor-pointer ${bgClass}`}
            >
              {dateStr.slice(8, 10)}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-5 text-xs text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
          <span>PASS (target met)</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-red-500 inline-block" />
          <span>FAIL (below target)</span>
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="w-3 h-3 rounded-xs bg-slate-300 dark:bg-slate-700 inline-block" />
          <span>NOT RECORDED</span>
        </span>
      </div>
    </div>
  );
};

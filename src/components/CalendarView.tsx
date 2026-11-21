import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Edit3 } from 'lucide-react';
import {
  evaluateDayFromActivities,
  formatDuration,
  formatHumanDate,
  getLocalTodayStr,
  isFutureDate,
  pad2,
} from '../lib/discipline.ts';
import type { BootstrapPayload, DailyRecord } from '../types/discipline.ts';

interface CalendarViewProps {
  data: BootstrapPayload;
  onOpenDateInTracker: (dateStr: string) => void;
}

const WEEKDAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const CalendarView: React.FC<CalendarViewProps> = ({
  data,
  onOpenDateInTracker,
}) => {
  const todayStr = getLocalTodayStr();
  const [cursorYear, setCursorYear] = useState(() => Number(todayStr.slice(0, 4)));
  const [cursorMonth, setCursorMonth] = useState(
    () => Number(todayStr.slice(5, 7)) - 1
  );
  const [inspectedDate, setInspectedDate] = useState(todayStr);

  const recordsByDate = useMemo(() => {
    const map = new Map<string, DailyRecord>();
    for (const r of data.dailyRecords) {
      map.set(r.recordDate, r);
    }
    return map;
  }, [data.dailyRecords]);

  const calendarCells = useMemo(() => {
    const firstOfMonth = new Date(cursorYear, cursorMonth, 1);
    const startWeekday = (firstOfMonth.getDay() + 6) % 7; // Monday = 0
    const daysInMonth = new Date(cursorYear, cursorMonth + 1, 0).getDate();

    const cells: Array<{ dateStr: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ dateStr: null, dayNum: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateStr: `${cursorYear}-${pad2(cursorMonth + 1)}-${pad2(d)}`,
        dayNum: d,
      });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ dateStr: null, dayNum: null });
    }
    return cells;
  }, [cursorYear, cursorMonth]);

  const monthLabel = new Date(cursorYear, cursorMonth, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const shiftMonth = (delta: number) => {
    const dt = new Date(cursorYear, cursorMonth + delta, 1);
    setCursorYear(dt.getFullYear());
    setCursorMonth(dt.getMonth());
  };

  const inspectedActivities = useMemo(
    () =>
      data.activities
        .filter((a) => a.recordDate === inspectedDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [data.activities, inspectedDate]
  );

  const inspectedEval = useMemo(
    () =>
      evaluateDayFromActivities(
        inspectedDate,
        data.activities,
        data.user.dailyTargetMinutes
      ),
    [inspectedDate, data.activities, data.user.dailyTargetMinutes]
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Monthly Grid */}
      <section className="xl:col-span-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
              {monthLabel}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Select any recorded or past date to inspect daily activities
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setCursorYear(Number(todayStr.slice(0, 4)));
                setCursorMonth(Number(todayStr.slice(5, 7)) - 1);
                setInspectedDate(todayStr);
              }}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {WEEKDAY_HEADERS.map((wd) => (
            <div
              key={wd}
              className="text-center text-xs font-medium text-slate-500 dark:text-slate-400 py-1"
            >
              {wd}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {calendarCells.map((cell, idx) => {
            if (!cell.dateStr || cell.dayNum === null) {
              return <div key={`empty-${idx}`} className="h-20 rounded-lg" />;
            }
            const dateStr = cell.dateStr;
            const future = isFutureDate(dateStr, todayStr);
            const rec = recordsByDate.get(dateStr);
            const isSelected = dateStr === inspectedDate;
            const isToday = dateStr === todayStr;

            let toneClass =
              'bg-slate-100 dark:bg-slate-800/70 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300';
            let statusWord = 'NO LOG';

            if (future) {
              toneClass =
                'bg-slate-50 dark:bg-[#0B0F17] border-slate-100 dark:border-slate-800/50 text-slate-400 dark:text-slate-600 opacity-60 cursor-not-allowed';
              statusWord = 'UPCOMING';
            } else if (rec?.status === 'PASS') {
              toneClass =
                'bg-emerald-500/15 dark:bg-emerald-500/20 border-emerald-500/40 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/25';
              statusWord = 'PASS';
            } else if (rec?.status === 'FAIL') {
              toneClass =
                'bg-red-500/15 dark:bg-red-500/20 border-red-500/40 text-red-800 dark:text-red-200 hover:bg-red-500/25';
              statusWord = 'FAIL';
            } else {
              toneClass += ' hover:bg-slate-200/70 dark:hover:bg-slate-800';
            }

            return (
              <button
                key={dateStr}
                type="button"
                disabled={future}
                onClick={() => setInspectedDate(dateStr)}
                className={`h-20 rounded-lg border p-2 flex flex-col justify-between text-left transition-colors ${toneClass} ${
                  isSelected ? 'ring-2 ring-emerald-500' : ''
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-mono font-semibold tabular-nums">
                    {cell.dayNum}
                  </span>
                  {isToday && (
                    <span className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                      TODAY
                    </span>
                  )}
                </div>

                <div>
                  <div className="text-[11px] font-mono font-semibold tabular-nums truncate">
                    {rec ? `${(rec.totalMinutes / 60).toFixed(1)}h` : '—'}
                  </div>
                  <div className="text-[10px] font-medium truncate opacity-85">
                    {statusWord}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-5 text-xs text-slate-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-emerald-500/40 border border-emerald-500 inline-block" />
            <span>PASS (target met)</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-red-500/40 border border-red-500 inline-block" />
            <span>FAIL (below target)</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="w-3 h-3 rounded-xs bg-slate-200 dark:bg-slate-800 border border-slate-400 dark:border-slate-600 inline-block" />
            <span>NOT RECORDED</span>
          </span>
        </div>
      </section>

      {/* Date Details Drawer / Panel */}
      <section className="xl:col-span-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-5">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Date Inspection
          </div>
          <h3 className="mt-1 text-base font-display font-semibold text-slate-900 dark:text-white">
            {formatHumanDate(inspectedDate)}
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-3 p-4 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Logged Time
            </div>
            <div className="mt-1 text-lg font-mono font-bold tabular-nums text-slate-900 dark:text-white">
              {formatDuration(inspectedEval.netMinutes)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Status</div>
            <div
              className={`mt-1 text-lg font-display font-bold ${
                inspectedEval.status === 'PASS'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : inspectedEval.status === 'FAIL'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {inspectedEval.status === 'NOT_RECORDED'
                ? 'NOT RECORDED'
                : inspectedEval.status}
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Activities ({inspectedActivities.length})
            </h4>
            <button
              type="button"
              onClick={() => onOpenDateInTracker(inspectedDate)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Day</span>
            </button>
          </div>

          {inspectedActivities.length === 0 ? (
            <div className="py-6 text-center rounded-lg border border-dashed border-slate-200 dark:border-slate-800 px-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No activities recorded on this date.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {inspectedActivities.map((act) => (
                <div key={act.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {act.title}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                      {formatDuration(act.durationMinutes)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {act.category} ·{' '}
                    <span className="font-mono">
                      {act.startTime}–{act.endTime}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

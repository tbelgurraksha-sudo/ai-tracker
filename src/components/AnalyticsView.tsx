import React, { useMemo, useState } from 'react';
import {
  addDays,
  computeRangeMetrics,
  computeStreaks,
  formatDuration,
  getCategoryBreakdown,
  getDateRange,
  getLocalTodayStr,
  getMonthDates,
  getWeekBoundsMondayToSunday,
} from '../lib/discipline.ts';
import type { BootstrapPayload, DailyRecord } from '../types/discipline.ts';
import {
  CategoryDistributionList,
  DailyHoursChart,
  DisciplineHeatmap,
  PeriodBarChart,
} from './Charts.tsx';

interface AnalyticsViewProps {
  data: BootstrapPayload;
  onInspectDate: (dateStr: string) => void;
}

type RangeMode = 'weekly' | 'monthly' | 'custom';

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  data,
  onInspectDate,
}) => {
  const todayStr = getLocalTodayStr();
  const [rangeMode, setRangeMode] = useState<RangeMode>('monthly');
  const [customStart, setCustomStart] = useState(() => addDays(todayStr, -13));
  const [customEnd, setCustomEnd] = useState(todayStr);

  const recordsByDate = useMemo(() => {
    const map = new Map<string, DailyRecord>();
    for (const r of data.dailyRecords) {
      map.set(r.recordDate, r);
    }
    return map;
  }, [data.dailyRecords]);

  const activeDates = useMemo(() => {
    if (rangeMode === 'weekly') {
      return getWeekBoundsMondayToSunday(todayStr).dates;
    }
    if (rangeMode === 'monthly') {
      const y = Number(todayStr.slice(0, 4));
      const m = Number(todayStr.slice(5, 7)) - 1;
      return getMonthDates(y, m);
    }
    const safeEnd = customEnd > todayStr ? todayStr : customEnd;
    const safeStart = customStart > safeEnd ? safeEnd : customStart;
    return getDateRange(safeStart, safeEnd);
  }, [rangeMode, todayStr, customStart, customEnd]);

  const rangeMetrics = useMemo(
    () => computeRangeMetrics(activeDates, recordsByDate),
    [activeDates, recordsByDate]
  );

  const streaks = useMemo(
    () => computeStreaks(data.dailyRecords, todayStr),
    [data.dailyRecords, todayStr]
  );

  const currentWeekMetrics = useMemo(() => {
    const wk = getWeekBoundsMondayToSunday(todayStr);
    return computeRangeMetrics(wk.dates, recordsByDate);
  }, [todayStr, recordsByDate]);

  const currentMonthMetrics = useMemo(() => {
    const y = Number(todayStr.slice(0, 4));
    const m = Number(todayStr.slice(5, 7)) - 1;
    return computeRangeMetrics(getMonthDates(y, m), recordsByDate);
  }, [todayStr, recordsByDate]);

  const dailyChartData = useMemo(
    () =>
      activeDates.map((d) => {
        const rec = recordsByDate.get(d);
        return {
          date: d,
          totalMinutes: rec ? rec.totalMinutes : 0,
          status: rec ? rec.status : ('NOT_RECORDED' as const),
        };
      }),
    [activeDates, recordsByDate]
  );

  // Last 6 Mondays-Sundays weekly comparison
  const weeklySeries = useMemo(() => {
    const series = [];
    for (let i = 5; i >= 0; i--) {
      const ref = addDays(todayStr, -i * 7);
      const wk = getWeekBoundsMondayToSunday(ref);
      const m = computeRangeMetrics(wk.dates, recordsByDate);
      series.push({
        label: wk.start.slice(5),
        totalMinutes: m.totalMinutes,
        secondaryLabel: `${m.successRatePercent}% pass (${m.passedDays}/${m.recordedDays})`,
      });
    }
    return series;
  }, [todayStr, recordsByDate]);

  // Last 6 calendar months comparison
  const monthlySeries = useMemo(() => {
    const baseYear = Number(todayStr.slice(0, 4));
    const baseMonth = Number(todayStr.slice(5, 7)) - 1;
    const series = [];
    for (let i = 5; i >= 0; i--) {
      const dt = new Date(baseYear, baseMonth - i, 1);
      const dates = getMonthDates(dt.getFullYear(), dt.getMonth());
      const m = computeRangeMetrics(dates, recordsByDate);
      series.push({
        label: dt.toLocaleDateString('en-US', { month: 'short' }),
        totalMinutes: m.totalMinutes,
        secondaryLabel: `${m.successRatePercent}% pass (${m.passedDays}/${m.recordedDays})`,
      });
    }
    return series;
  }, [todayStr, recordsByDate]);

  const categoryBreakdown = useMemo(
    () => getCategoryBreakdown(data.activities, new Set(activeDates)),
    [data.activities, activeDates]
  );

  const heatmapDates = useMemo(() => {
    const start = addDays(todayStr, -89);
    return getDateRange(start, todayStr);
  }, [todayStr]);

  const passTotal = rangeMetrics.passedDays + rangeMetrics.failedDays;
  const passRatioPct =
    passTotal > 0 ? Math.round((rangeMetrics.passedDays / passTotal) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Range Selector Toolbar */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 w-fit">
          {(['weekly', 'monthly', 'custom'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setRangeMode(mode)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors whitespace-nowrap cursor-pointer ${
                rangeMode === mode
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {mode === 'weekly'
                ? 'This Week'
                : mode === 'monthly'
                  ? 'This Month'
                  : 'Custom Range'}
            </button>
          ))}
        </div>

        {rangeMode === 'custom' ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="text-slate-500 dark:text-slate-400">From</label>
            <input
              type="date"
              max={todayStr}
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] font-mono text-slate-900 dark:text-slate-100"
            />
            <label className="text-slate-500 dark:text-slate-400">To</label>
            <input
              type="date"
              max={todayStr}
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] font-mono text-slate-900 dark:text-slate-100"
            />
          </div>
        ) : (
          <div className="text-xs font-mono text-slate-500 dark:text-slate-400">
            {activeDates[0]} to {activeDates[activeDates.length - 1]} ({activeDates.length} days)
          </div>
        )}
      </section>

      {/* KPI Metrics Row */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Total Productive Hours
          </div>
          <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
            {formatDuration(rangeMetrics.totalMinutes)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Selected range
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Average Per Recorded Day
          </div>
          <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
            {formatDuration(rangeMetrics.averageMinutesPerRecordedDay)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
            Across {rangeMetrics.recordedDays} recorded day
            {rangeMetrics.recordedDays === 1 ? '' : 's'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Weekly / Monthly Success
          </div>
          <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {currentWeekMetrics.successRatePercent}% / {currentMonthMetrics.successRatePercent}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Week vs Month PASS rate
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            PASS vs FAIL Days
          </div>
          <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
            <span className="text-emerald-600 dark:text-emerald-400">
              {rangeMetrics.passedDays}
            </span>{' '}
            /{' '}
            <span className="text-red-600 dark:text-red-400">
              {rangeMetrics.failedDays}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {rangeMetrics.notRecordedDays} not recorded
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Current / Longest Streak
          </div>
          <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
            {streaks.currentStreak}d / {streaks.longestStreak}d
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Consecutive PASS days
          </div>
        </div>
      </section>

      {/* Daily Productive Hours with 6h Target Reference Line */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              Daily Productive Hours
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Target reference line fixed at {(data.user.dailyTargetMinutes / 60).toFixed(1)} hours · Click any bar to open day
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
              PASS
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-500 inline-block" />
              FAIL
            </span>
          </div>
        </div>

        <DailyHoursChart
          data={dailyChartData}
          targetMinutes={data.user.dailyTargetMinutes}
          onSelectDate={(d) => {
            if (d <= todayStr) onInspectDate(d);
          }}
        />
      </section>

      {/* Weekly & Monthly Productivity Graphs */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            Weekly Productivity (Last 6 Weeks)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Monday–Sunday totals · Hover bars for success percentage
          </p>
          <PeriodBarChart data={weeklySeries} accentColor="emerald" />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            Monthly Productivity (Last 6 Months)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Total logged hours per month
          </p>
          <PeriodBarChart data={monthlySeries} accentColor="sky" />
        </div>
      </section>

      {/* Successful vs Failed Ratio + Category Breakdown */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-5">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              Successful vs Failed Days
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Recorded days only (unrecorded days excluded from failures)
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                PASS Days
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                {rangeMetrics.passedDays} ({passRatioPct}%)
              </span>
            </div>
            <div className="h-3 w-full rounded-full bg-red-500/20 overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${passTotal > 0 ? passRatioPct : 0}%` }}
              />
              <div
                className="h-full bg-red-500 transition-all"
                style={{ width: `${passTotal > 0 ? 100 - passRatioPct : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-red-600 dark:text-red-400">
                FAIL Days
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                {rangeMetrics.failedDays} ({passTotal > 0 ? 100 - passRatioPct : 0}%)
              </span>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
            Days with zero logged entries ({rangeMetrics.notRecordedDays} in this range) are tracked as NOT RECORDED and never penalized as failures.
          </div>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white mb-1">
            Category Focus Breakdown
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Distribution across your selected date range
          </p>
          <CategoryDistributionList items={categoryBreakdown} />
        </div>
      </section>

      {/* 90-Day Discipline Heatmap */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
        <div className="mb-4">
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            90-Day Consistency Heatmap
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any cell to open that day&apos;s activity log
          </p>
        </div>
        <DisciplineHeatmap
          dates={heatmapDates}
          recordsByDate={recordsByDate}
          onSelectDate={onInspectDate}
        />
      </section>
    </div>
  );
};

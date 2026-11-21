import React from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock,
  Flame,
  Plus,
  ShieldAlert,
  Target,
  TrendingUp,
} from 'lucide-react';
import {
  computeRangeMetrics,
  computeStreaks,
  evaluateDayFromActivities,
  formatDuration,
  formatHumanDate,
  getDayName,
  getLocalTodayStr,
  getMotivationalMessage,
  getWeekBoundsMondayToSunday,
  isWeekendDate,
} from '../lib/discipline.ts';
import type {
  BootstrapPayload,
  DailyRecord,
  NavSection,
} from '../types/discipline.ts';
import { DailyHoursChart } from './Charts.tsx';

interface DashboardViewProps {
  data: BootstrapPayload;
  onNavigate: (section: NavSection, dateStr?: string) => void;
  onQuickLogToday: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  data,
  onNavigate,
  onQuickLogToday,
}) => {
  const todayStr = getLocalTodayStr();
  const isWeekend = isWeekendDate(todayStr);
  const targetMinutes = data.user.dailyTargetMinutes;

  const todayEval = evaluateDayFromActivities(todayStr, data.activities, targetMinutes);
  const streaks = computeStreaks(data.dailyRecords, todayStr);

  const recordsByDate = new Map<string, DailyRecord>();
  for (const r of data.dailyRecords) {
    recordsByDate.set(r.recordDate, r);
  }

  const week = getWeekBoundsMondayToSunday(todayStr);
  const weekMetrics = computeRangeMetrics(week.dates, recordsByDate);

  const pendingRecovery = data.recoveryTasks.filter((t) => t.status === 'PENDING');
  const pendingRecoveryMinutes = pendingRecovery.reduce(
    (sum, t) => sum + t.recoveryMinutes,
    0
  );

  const message = getMotivationalMessage({
    todayEval,
    currentStreak: streaks.currentStreak,
    pendingRecoveryCount: pendingRecovery.length,
    isWeekend,
  });

  const progressPct = Math.min(
    100,
    Math.round((todayEval.netMinutes / Math.max(1, targetMinutes)) * 100)
  );

  const todayActivities = data.activities
    .filter((a) => a.recordDate === todayStr)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const weekChartData = week.dates.map((d) => {
    const rec = recordsByDate.get(d);
    return {
      date: d,
      totalMinutes: rec ? rec.totalMinutes : 0,
      status: rec ? rec.status : ('NOT_RECORDED' as const),
    };
  });

  return (
    <div className="space-y-6">
      {/* Primary Hero Performance Card */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">{formatHumanDate(todayStr)}</span>
              <span aria-hidden="true">·</span>
              <span>Daily Target {formatDuration(targetMinutes)}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  todayEval.status === 'PASS'
                    ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                    : todayEval.status === 'FAIL'
                      ? 'font-semibold text-red-600 dark:text-red-400'
                      : 'font-semibold text-slate-600 dark:text-slate-300'
                }
              >
                {todayEval.status === 'NOT_RECORDED' ? 'NOT RECORDED' : todayEval.status}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-slate-900 dark:text-white text-balance">
              {message.headline}
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {message.subtext}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-4 shrink-0">
            <div className="text-left lg:text-right">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Today&apos;s Productive Total
              </div>
              <div className="mt-1 flex items-baseline gap-2.5">
                <span className="text-3xl sm:text-4xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                  {formatDuration(todayEval.netMinutes)}
                </span>
                <span className="text-sm font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  / {formatDuration(targetMinutes)}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onQuickLogToday}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Log Activity</span>
            </button>
          </div>
        </div>

        {/* Target Progress Bar */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs mb-2">
            <span className="text-slate-600 dark:text-slate-400 font-medium">
              {todayEval.status === 'PASS'
                ? 'Target completed'
                : `${formatDuration(todayEval.remainingMinutes)} remaining to reach PASS`}
            </span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-300 font-semibold">
              {progressPct}%
              {todayEval.overlapMinutes > 0 && (
                <span className="text-amber-600 dark:text-amber-400 font-normal ml-2">
                  ({formatDuration(todayEval.overlapMinutes)} overlapping interval excluded)
                </span>
              )}
            </span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                todayEval.status === 'PASS'
                  ? 'bg-emerald-500'
                  : todayEval.status === 'FAIL'
                    ? 'bg-red-500'
                    : 'bg-slate-400'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Weekend Accountability Banner */}
      {(isWeekend || pendingRecovery.length > 0) && (
        <section
          className={`rounded-xl border p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
            isWeekend && pendingRecovery.length > 0
              ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]'
          }`}
        >
          <div className="flex items-start gap-3">
            <ShieldAlert
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                pendingRecovery.length > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                {isWeekend
                  ? 'Weekend Accountability Mode Active'
                  : 'Pending Weekend Recovery Queue'}
              </h3>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                {pendingRecovery.length > 0
                  ? `${pendingRecovery.length} pending recovery session${pendingRecovery.length === 1 ? '' : 's'} totaling ${formatDuration(pendingRecoveryMinutes)} from earlier missed targets.`
                  : 'Zero pending catch-up sessions. Enjoy your weekend cleanly.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('accountability')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Open Accountability</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </section>
      )}

      {/* 4-Column KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Current Streak</span>
            <Flame className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
            {streaks.currentStreak} {streaks.currentStreak === 1 ? 'day' : 'days'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Consecutive PASS days
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Longest Streak</span>
            <Target className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
            {streaks.longestStreak} {streaks.longestStreak === 1 ? 'day' : 'days'}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            All-time personal record
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Weekly Success Rate</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
            {weekMetrics.successRatePercent}%
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {weekMetrics.passedDays} PASS / {weekMetrics.recordedDays} recorded (Mon–Sun)
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Total Weekly Hours</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 text-2xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
            {formatDuration(weekMetrics.totalMinutes)}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
            {week.start} to {week.end}
          </div>
        </div>
      </section>

      {/* Main Split: This Week Chart + Today's Activity Log */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                This Week (Monday – Sunday)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click any day bar to inspect or log activities
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Full Analytics
            </button>
          </div>

          <DailyHoursChart
            data={weekChartData}
            targetMinutes={targetMinutes}
            onSelectDate={(d) => {
              if (d <= todayStr) onNavigate('tracker', d);
            }}
          />
        </div>

        <div className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 flex flex-col">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Today&apos;s Activity Log
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {getDayName(todayStr)} · {todayActivities.length} session
                {todayActivities.length === 1 ? '' : 's'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('tracker', todayStr)}
              className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Manage Day
            </button>
          </div>

          {todayActivities.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center py-8 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg px-4">
              <CalendarDays className="w-6 h-6 text-slate-400 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No sessions logged today
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                Unrecorded days stay marked NOT RECORDED until you log your first activity.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('tracker', todayStr)}
                className="mt-4 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Log First Session</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {todayActivities.map((act) => (
                <div
                  key={act.id}
                  className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {act.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{act.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {act.startTime}–{act.endTime}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                      {formatDuration(act.durationMinutes)}
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
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

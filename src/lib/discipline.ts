import type {
  Activity,
  ActivityCategory,
  DailyRecord,
  DayStatus,
} from '../types/discipline.ts';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatLocalDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function getLocalTodayStr(now: Date = new Date()): string {
  return formatLocalDate(now);
}

export function addDays(dateStr: string, deltaDays: number): string {
  const dt = parseLocalDate(dateStr);
  dt.setDate(dt.getDate() + deltaDays);
  return formatLocalDate(dt);
}

export function isFutureDate(dateStr: string, todayStr: string = getLocalTodayStr()): boolean {
  return dateStr > todayStr;
}

export function isWeekendDate(dateStr: string): boolean {
  const day = parseLocalDate(dateStr).getDay();
  return day === 0 || day === 6;
}

export function formatHumanDate(dateStr: string): string {
  const dt = parseLocalDate(dateStr);
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatShortDate(dateStr: string): string {
  const dt = parseLocalDate(dateStr);
  return dt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function getDayName(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
}

export function timeToMinutes(timeStr: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(timeStr);
  if (!match) return -1;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh === 24 && mm === 0) return 1440;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return -1;
  return hh * 60 + mm;
}

export function minutesToHoursDecimal(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${pad2(m)}m`;
}

export function formatHoursCompact(minutes: number): string {
  const hrs = minutes / 60;
  return `${hrs.toFixed(1)}h`;
}

export interface IntervalOverlapResult {
  netMinutes: number;
  grossMinutes: number;
  overlapMinutes: number;
  mergedIntervals: Array<{ start: number; end: number }>;
  overlappingActivityIds: Set<string>;
}

/**
 * Computes exact non-overlapping productive minutes for a list of activities
 * by merging overlapping [startTime, endTime] intervals.
 */
export function calculateIntervalMetrics(
  activities: Array<Pick<Activity, 'id' | 'startTime' | 'endTime'>>
): IntervalOverlapResult {
  const validIntervals: Array<{ id: string; start: number; end: number }> = [];
  let grossMinutes = 0;

  for (const act of activities) {
    const start = timeToMinutes(act.startTime);
    const end = timeToMinutes(act.endTime);
    if (start >= 0 && end > start) {
      validIntervals.push({ id: act.id, start, end });
      grossMinutes += end - start;
    }
  }

  if (validIntervals.length === 0) {
    return {
      netMinutes: 0,
      grossMinutes: 0,
      overlapMinutes: 0,
      mergedIntervals: [],
      overlappingActivityIds: new Set(),
    };
  }

  validIntervals.sort((a, b) => a.start - b.start || a.end - b.end);

  const overlappingActivityIds = new Set<string>();
  for (let i = 0; i < validIntervals.length; i++) {
    for (let j = i + 1; j < validIntervals.length; j++) {
      if (validIntervals[j].start < validIntervals[i].end) {
        overlappingActivityIds.add(validIntervals[i].id);
        overlappingActivityIds.add(validIntervals[j].id);
      } else {
        break;
      }
    }
  }

  const merged: Array<{ start: number; end: number }> = [];
  let current = { start: validIntervals[0].start, end: validIntervals[0].end };

  for (let i = 1; i < validIntervals.length; i++) {
    const next = validIntervals[i];
    if (next.start <= current.end) {
      current.end = Math.max(current.end, next.end);
    } else {
      merged.push(current);
      current = { start: next.start, end: next.end };
    }
  }
  merged.push(current);

  const netMinutes = merged.reduce((sum, iv) => sum + (iv.end - iv.start), 0);
  const overlapMinutes = Math.max(0, grossMinutes - netMinutes);

  return {
    netMinutes,
    grossMinutes,
    overlapMinutes,
    mergedIntervals: merged,
    overlappingActivityIds,
  };
}

export interface DayEvaluation {
  date: string;
  status: DayStatus;
  netMinutes: number;
  grossMinutes: number;
  overlapMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
  activityCount: number;
}

export function evaluateDayFromActivities(
  dateStr: string,
  activities: Activity[],
  targetMinutes: number
): DayEvaluation {
  const dayActs = activities.filter((a) => a.recordDate === dateStr);
  if (dayActs.length === 0) {
    return {
      date: dateStr,
      status: 'NOT_RECORDED',
      netMinutes: 0,
      grossMinutes: 0,
      overlapMinutes: 0,
      targetMinutes,
      remainingMinutes: targetMinutes,
      activityCount: 0,
    };
  }

  const metrics = calculateIntervalMetrics(dayActs);
  const status: DayStatus = metrics.netMinutes >= targetMinutes ? 'PASS' : 'FAIL';
  return {
    date: dateStr,
    status,
    netMinutes: metrics.netMinutes,
    grossMinutes: metrics.grossMinutes,
    overlapMinutes: metrics.overlapMinutes,
    targetMinutes,
    remainingMinutes: Math.max(0, targetMinutes - metrics.netMinutes),
    activityCount: dayActs.length,
  };
}

export interface StreakStats {
  currentStreak: number;
  longestStreak: number;
}

export function computeStreaks(
  dailyRecords: DailyRecord[],
  todayStr: string = getLocalTodayStr()
): StreakStats {
  const statusByDate = new Map<string, 'PASS' | 'FAIL'>();
  for (const rec of dailyRecords) {
    statusByDate.set(rec.recordDate, rec.status);
  }

  // Current streak: start from today if PASS, else from yesterday if today is NOT_RECORDED.
  // If today is FAIL, current streak is 0.
  let currentStreak = 0;
  const todayStatus = statusByDate.get(todayStr);

  if (todayStatus !== 'FAIL') {
    let cursor = todayStatus === 'PASS' ? todayStr : addDays(todayStr, -1);
    while (statusByDate.get(cursor) === 'PASS') {
      currentStreak += 1;
      cursor = addDays(cursor, -1);
    }
  }

  // Longest streak across all recorded PASS dates
  const passDates = Array.from(statusByDate.entries())
    .filter(([, st]) => st === 'PASS')
    .map(([d]) => d)
    .sort();

  let longestStreak = 0;
  let running = 0;
  let prevDate: string | null = null;

  for (const d of passDates) {
    if (prevDate && addDays(prevDate, 1) === d) {
      running += 1;
    } else {
      running = 1;
    }
    if (running > longestStreak) longestStreak = running;
    prevDate = d;
  }

  return { currentStreak, longestStreak };
}

/**
 * Returns Monday..Sunday bounds containing the given dateStr.
 */
export function getWeekBoundsMondayToSunday(dateStr: string): {
  start: string;
  end: string;
  dates: string[];
} {
  const dt = parseLocalDate(dateStr);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(dt);
  monday.setDate(dt.getDate() + diffToMonday);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    dates.push(formatLocalDate(cur));
  }

  return {
    start: dates[0],
    end: dates[6],
    dates,
  };
}

export function getMonthDates(year: number, monthZeroIndexed: number): string[] {
  const daysInMonth = new Date(year, monthZeroIndexed + 1, 0).getDate();
  const result: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    result.push(`${year}-${pad2(monthZeroIndexed + 1)}-${pad2(d)}`);
  }
  return result;
}

export function getDateRange(startStr: string, endStr: string): string[] {
  if (startStr > endStr) return [];
  const dates: string[] = [];
  let cursor = startStr;
  let guard = 0;
  while (cursor <= endStr && guard < 400) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return dates;
}

export interface RangeMetrics {
  totalMinutes: number;
  recordedDays: number;
  passedDays: number;
  failedDays: number;
  notRecordedDays: number;
  averageMinutesPerRecordedDay: number;
  successRatePercent: number;
}

export function computeRangeMetrics(
  dates: string[],
  recordsByDate: Map<string, DailyRecord>
): RangeMetrics {
  let totalMinutes = 0;
  let recordedDays = 0;
  let passedDays = 0;
  let failedDays = 0;
  let notRecordedDays = 0;

  for (const d of dates) {
    const rec = recordsByDate.get(d);
    if (!rec) {
      notRecordedDays += 1;
    } else {
      recordedDays += 1;
      totalMinutes += rec.totalMinutes;
      if (rec.status === 'PASS') passedDays += 1;
      else failedDays += 1;
    }
  }

  const averageMinutesPerRecordedDay =
    recordedDays > 0 ? Math.round(totalMinutes / recordedDays) : 0;
  const successRatePercent =
    recordedDays > 0 ? Math.round((passedDays / recordedDays) * 100) : 0;

  return {
    totalMinutes,
    recordedDays,
    passedDays,
    failedDays,
    notRecordedDays,
    averageMinutesPerRecordedDay,
    successRatePercent,
  };
}

export function getCategoryBreakdown(
  activities: Activity[],
  dateFilter?: Set<string>
): Array<{ category: ActivityCategory; minutes: number; count: number }> {
  const map = new Map<ActivityCategory, { minutes: number; count: number }>();
  for (const act of activities) {
    if (dateFilter && !dateFilter.has(act.recordDate)) continue;
    const prev = map.get(act.category) ?? { minutes: 0, count: 0 };
    map.set(act.category, {
      minutes: prev.minutes + act.durationMinutes,
      count: prev.count + 1,
    });
  }

  return Array.from(map.entries())
    .map(([category, val]) => ({ category, ...val }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function getMotivationalMessage(params: {
  todayEval: DayEvaluation;
  currentStreak: number;
  pendingRecoveryCount: number;
  isWeekend: boolean;
}): { headline: string; subtext: string } {
  const { todayEval, currentStreak, pendingRecoveryCount, isWeekend } = params;

  if (todayEval.status === 'PASS') {
    if (currentStreak >= 7) {
      return {
        headline: `${currentStreak}-day discipline streak locked in.`,
        subtext: `You crossed today's ${formatDuration(todayEval.targetMinutes)} target with ${formatDuration(todayEval.netMinutes)} logged. Consistency compounds.`,
      };
    }
    return {
      headline: 'Daily target cleared. Standard maintained.',
      subtext: `You completed ${formatDuration(todayEval.netMinutes)} of focused work today. Keep the momentum steady into tomorrow.`,
    };
  }

  if (todayEval.status === 'FAIL') {
    if (isWeekend && pendingRecoveryCount > 0) {
      return {
        headline: 'Weekend catch-up window is active.',
        subtext: `${formatDuration(todayEval.remainingMinutes)} left to reach today's goal, plus ${pendingRecoveryCount} pending recovery session${pendingRecoveryCount === 1 ? '' : 's'} ready to clear.`,
      };
    }
    return {
      headline: `${formatDuration(todayEval.remainingMinutes)} remaining to hit today's target.`,
      subtext:
        'A focused 60–90 minute deep-work block now converts today from FAIL to PASS and cancels any pending penalty.',
    };
  }

  if (isWeekend && pendingRecoveryCount > 0) {
    return {
      headline: `Weekend Accountability: ${pendingRecoveryCount} recovery session${pendingRecoveryCount === 1 ? '' : 's'} queued.`,
      subtext:
        'Clear your scheduled catch-up sessions today and log your daily focus block to stay aligned.',
    };
  }

  return {
    headline: 'Fresh slate today. Start your first focus block.',
    subtext: `Log ${formatDuration(todayEval.targetMinutes)} of non-overlapping productive work before midnight to earn a PASS.`,
  };
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

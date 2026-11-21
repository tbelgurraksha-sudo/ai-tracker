import React, { useMemo, useState } from 'react';
import { Download, Eye, Mail, Send, X } from 'lucide-react';
import { apiPreviewWeeklyEmail, apiSendWeeklyEmail } from '../lib/api.ts';
import {
  addDays,
  computeRangeMetrics,
  downloadTextFile,
  escapeCsvCell,
  evaluateDayFromActivities,
  formatDuration,
  getLocalTodayStr,
  getMonthDates,
  getWeekBoundsMondayToSunday,
} from '../lib/discipline.ts';
import type { BootstrapPayload, DailyRecord } from '../types/discipline.ts';

interface ReportsViewProps {
  data: BootstrapPayload;
  onDataUpdated: (next: BootstrapPayload) => void;
}

type ReportTab = 'daily' | 'weekly' | 'monthly';

export const ReportsView: React.FC<ReportsViewProps> = ({
  data,
  onDataUpdated,
}) => {
  const todayStr = getLocalTodayStr();
  const [tab, setTab] = useState<ReportTab>('weekly');
  const [dailyReportDate, setDailyReportDate] = useState(todayStr);

  const [emailPreviewHtml, setEmailPreviewHtml] = useState<string | null>(null);
  const [emailPreviewSubject, setEmailPreviewSubject] = useState<string>('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  const recordsByDate = useMemo(() => {
    const map = new Map<string, DailyRecord>();
    for (const r of data.dailyRecords) map.set(r.recordDate, r);
    return map;
  }, [data.dailyRecords]);

  // Daily report data
  const dailyEval = useMemo(
    () =>
      evaluateDayFromActivities(
        dailyReportDate,
        data.activities,
        data.user.dailyTargetMinutes
      ),
    [dailyReportDate, data.activities, data.user.dailyTargetMinutes]
  );
  const dailyActivities = useMemo(
    () =>
      data.activities
        .filter((a) => a.recordDate === dailyReportDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [data.activities, dailyReportDate]
  );

  // Weekly summaries (last 8 Monday–Sunday weeks)
  const weeklySummaries = useMemo(() => {
    const rows = [];
    for (let i = 0; i < 8; i++) {
      const ref = addDays(todayStr, -i * 7);
      const wk = getWeekBoundsMondayToSunday(ref);
      const m = computeRangeMetrics(wk.dates, recordsByDate);
      const missedTargetMinutes = wk.dates.reduce((sum, d) => {
        const rec = recordsByDate.get(d);
        if (rec && rec.status === 'FAIL') {
          return sum + Math.max(0, rec.targetMinutes - rec.totalMinutes);
        }
        return sum;
      }, 0);
      rows.push({
        weekStart: wk.start,
        weekEnd: wk.end,
        ...m,
        missedTargetMinutes,
      });
    }
    return rows;
  }, [todayStr, recordsByDate]);

  // Monthly summaries (last 6 months)
  const monthlySummaries = useMemo(() => {
    const baseY = Number(todayStr.slice(0, 4));
    const baseM = Number(todayStr.slice(5, 7)) - 1;
    const rows = [];
    for (let i = 0; i < 6; i++) {
      const dt = new Date(baseY, baseM - i, 1);
      const dates = getMonthDates(dt.getFullYear(), dt.getMonth());
      const m = computeRangeMetrics(dates, recordsByDate);
      rows.push({
        monthKey: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`,
        monthLabel: dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        ...m,
      });
    }
    return rows;
  }, [todayStr, recordsByDate]);

  const exportDailyCsv = () => {
    const header = [
      'Date',
      'Activity',
      'Category',
      'Start Time',
      'End Time',
      'Duration (min)',
      'Description',
    ].join(',');
    const lines = dailyActivities.map((a) =>
      [
        a.recordDate,
        a.title,
        a.category,
        a.startTime,
        a.endTime,
        a.durationMinutes,
        a.description,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    downloadTextFile(
      `discipline90-daily-${dailyReportDate}.csv`,
      [header, ...lines].join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  const exportWeeklyCsv = () => {
    const header = [
      'Week Start (Mon)',
      'Week End (Sun)',
      'Total Minutes',
      'Total Hours',
      'Recorded Days',
      'Passed Days',
      'Failed Days',
      'Average Minutes / Recorded Day',
      'Success Rate %',
      'Missed Target Minutes',
    ].join(',');
    const lines = weeklySummaries.map((w) =>
      [
        w.weekStart,
        w.weekEnd,
        w.totalMinutes,
        formatDuration(w.totalMinutes),
        w.recordedDays,
        w.passedDays,
        w.failedDays,
        w.averageMinutesPerRecordedDay,
        w.successRatePercent,
        w.missedTargetMinutes,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    downloadTextFile(
      `discipline90-weekly-summary-${todayStr}.csv`,
      [header, ...lines].join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  const exportMonthlyCsv = () => {
    const header = [
      'Month',
      'Total Minutes',
      'Total Hours',
      'Recorded Days',
      'Passed Days',
      'Failed Days',
      'Average Minutes / Recorded Day',
      'Success Rate %',
    ].join(',');
    const lines = monthlySummaries.map((m) =>
      [
        m.monthLabel,
        m.totalMinutes,
        formatDuration(m.totalMinutes),
        m.recordedDays,
        m.passedDays,
        m.failedDays,
        m.averageMinutesPerRecordedDay,
        m.successRatePercent,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
    downloadTextFile(
      `discipline90-monthly-summary-${todayStr}.csv`,
      [header, ...lines].join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  const exportAllActivitiesCsv = () => {
    const header = [
      'Date',
      'Activity',
      'Category',
      'Start Time',
      'End Time',
      'Duration (min)',
      'Day Net Status',
      'Description',
    ].join(',');
    const lines = data.activities.map((a) => {
      const rec = recordsByDate.get(a.recordDate);
      return [
        a.recordDate,
        a.title,
        a.category,
        a.startTime,
        a.endTime,
        a.durationMinutes,
        rec ? rec.status : 'NOT RECORDED',
        a.description,
      ]
        .map(escapeCsvCell)
        .join(',');
    });
    downloadTextFile(
      `discipline90-all-activities-${todayStr}.csv`,
      [header, ...lines].join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  const handlePreviewDigest = async () => {
    setEmailError(null);
    setEmailBusy(true);
    try {
      const res = await apiPreviewWeeklyEmail(todayStr);
      setEmailPreviewSubject(res.subject);
      setEmailPreviewHtml(res.html);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Preview failed.');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleSendDigest = async () => {
    setEmailError(null);
    setEmailMessage(null);
    setEmailBusy(true);
    try {
      const res = await apiSendWeeklyEmail(todayStr);
      onDataUpdated(res.bootstrap);
      const status = res.log.deliveryStatus;
      setEmailMessage(
        status.startsWith('SENT')
          ? `Weekly summary email sent to ${res.log.recipientEmail}.`
          : `Weekly digest generated and logged for ${res.log.recipientEmail}. Configure SMTP or Resend environment variables to enable live inbox delivery.`
      );
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Failed to dispatch digest.');
    } finally {
      setEmailBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Export Toolbar */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80 w-fit">
          {(['daily', 'weekly', 'monthly'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md capitalize transition-colors cursor-pointer ${
                tab === t
                  ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t} Report
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={
              tab === 'daily'
                ? exportDailyCsv
                : tab === 'weekly'
                  ? exportWeeklyCsv
                  : exportMonthlyCsv
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export {tab.charAt(0).toUpperCase() + tab.slice(1)} CSV</span>
          </button>
          <button
            type="button"
            onClick={exportAllActivitiesCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Full Log CSV</span>
          </button>
        </div>
      </section>

      {/* Daily Report */}
      {tab === 'daily' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Daily Activity Report
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Net productive hours: {formatDuration(dailyEval.netMinutes)} · Status:{' '}
                <span className="font-semibold">
                  {dailyEval.status === 'NOT_RECORDED' ? 'NOT RECORDED' : dailyEval.status}
                </span>
              </p>
            </div>
            <input
              type="date"
              max={todayStr}
              value={dailyReportDate}
              onChange={(e) => setDailyReportDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100"
            />
          </div>

          {dailyActivities.length === 0 ? (
            <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
              No activities logged on {dailyReportDate}.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                    <th className="py-2.5 pr-4 font-medium">Activity</th>
                    <th className="py-2.5 pr-4 font-medium">Category</th>
                    <th className="py-2.5 pr-4 font-medium">Window</th>
                    <th className="py-2.5 text-right font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {dailyActivities.map((act) => (
                    <tr key={act.id}>
                      <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                        {act.title}
                      </td>
                      <td className="py-3 pr-4 text-slate-600 dark:text-slate-400">
                        {act.category}
                      </td>
                      <td className="py-3 pr-4 font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {act.startTime} – {act.endTime}
                      </td>
                      <td className="py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                        {formatDuration(act.durationMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Weekly Monday–Sunday Report */}
      {tab === 'weekly' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              Weekly Summaries (Monday – Sunday)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Total hours, successful vs failed days, average hours, and missed target deficits
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Week (Mon – Sun)</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Total Hours</th>
                  <th className="py-2.5 pr-4 text-right font-medium">PASS</th>
                  <th className="py-2.5 pr-4 text-right font-medium">FAIL</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Avg / Day</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Success Rate</th>
                  <th className="py-2.5 text-right font-medium">Missed Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {weeklySummaries.map((w) => (
                  <tr key={w.weekStart}>
                    <td className="py-3 pr-4 font-mono text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {w.weekStart} to {w.weekEnd}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatDuration(w.totalMinutes)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {w.passedDays}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                      {w.failedDays}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatDuration(w.averageMinutesPerRecordedDay)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                      {w.successRatePercent}%
                    </td>
                    <td className="py-3 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {formatDuration(w.missedTargetMinutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Monthly Report */}
      {tab === 'monthly' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              Monthly Performance Summaries
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Aggregated monthly totals across recorded days
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Month</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Total Hours</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Recorded Days</th>
                  <th className="py-2.5 pr-4 text-right font-medium">PASS</th>
                  <th className="py-2.5 pr-4 text-right font-medium">FAIL</th>
                  <th className="py-2.5 pr-4 text-right font-medium">Avg / Day</th>
                  <th className="py-2.5 text-right font-medium">Success Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {monthlySummaries.map((m) => (
                  <tr key={m.monthKey}>
                    <td className="py-3 pr-4 font-medium text-slate-900 dark:text-slate-100">
                      {m.monthLabel}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                      {formatDuration(m.totalMinutes)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-600 dark:text-slate-400">
                      {m.recordedDays}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                      {m.passedDays}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-red-600 dark:text-red-400">
                      {m.failedDays}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {formatDuration(m.averageMinutesPerRecordedDay)}
                    </td>
                    <td className="py-3 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                      {m.successRatePercent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Automated Weekly Email Reports */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-500" />
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Automated Weekly Email Reports
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Recipient: <span className="font-mono text-slate-700 dark:text-slate-300">{data.user.email}</span> · Auto-dispatch{' '}
              {data.user.weeklyEmailEnabled ? 'Enabled (Sundays)' : 'Paused'} ·{' '}
              {data.meta.emailTransportConfigured
                ? 'Live email transport active'
                : 'Preview mode (set SMTP or RESEND_API_KEY env vars for live inbox delivery)'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={emailBusy}
              onClick={handlePreviewDigest}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview Digest</span>
            </button>
            <button
              type="button"
              disabled={emailBusy}
              onClick={handleSendDigest}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{emailBusy ? 'Processing...' : 'Send Weekly Summary Now'}</span>
            </button>
          </div>
        </div>

        {emailMessage && (
          <div className="rounded-lg border border-emerald-300 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            {emailMessage}
          </div>
        )}
        {emailError && (
          <div className="rounded-lg border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
            {emailError}
          </div>
        )}

        {emailPreviewHtml && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-100 dark:bg-[#0B0F17] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
                Subject: {emailPreviewSubject}
              </span>
              <button
                type="button"
                onClick={() => setEmailPreviewHtml(null)}
                className="p-1 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <iframe
              title="Weekly email digest preview"
              sandbox=""
              srcDoc={emailPreviewHtml}
              className="w-full h-96 bg-[#0b0f17]"
            />
          </div>
        )}

        {data.weeklyEmailLogs.length > 0 && (
          <div className="pt-2">
            <h4 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
              Recent Weekly Report Dispatches
            </h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-xs">
              {data.weeklyEmailLogs.slice(0, 5).map((log) => (
                <div
                  key={log.id}
                  className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-medium text-slate-800 dark:text-slate-200">
                      {log.weekStart} to {log.weekEnd}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 ml-2">
                      · {log.recipientEmail}
                    </span>
                  </div>
                  <div className="font-mono text-slate-500 dark:text-slate-400">
                    {log.deliveryStatus} · {log.sentAt.slice(0, 10)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};

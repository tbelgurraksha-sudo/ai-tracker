import React, { useState } from 'react';
import { Copy, Database, Download, Moon, Save, Sun, Check } from 'lucide-react';
import { apiGetSupabaseSchema, apiUpdateSettings } from '../lib/api.ts';
import {
  downloadTextFile,
  escapeCsvCell,
  getLocalTodayStr,
} from '../lib/discipline.ts';
import type { BootstrapPayload, ThemeMode } from '../types/discipline.ts';

interface SettingsViewProps {
  data: BootstrapPayload;
  onDataUpdated: (next: BootstrapPayload) => void;
}

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export const SettingsView: React.FC<SettingsViewProps> = ({
  data,
  onDataUpdated,
}) => {
  const [fullName, setFullName] = useState(data.user.fullName);
  const [targetHours, setTargetHours] = useState(
    String(data.user.dailyTargetMinutes / 60)
  );
  const [recoveryMinutes, setRecoveryMinutes] = useState(
    String(data.user.recoverySessionMinutes)
  );
  const [theme, setTheme] = useState<ThemeMode>(data.user.theme);
  const [weeklyEmailEnabled, setWeeklyEmailEnabled] = useState(
    data.user.weeklyEmailEnabled
  );
  const [weeklyEmailDay, setWeeklyEmailDay] = useState(data.user.weeklyEmailDay);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [schemaSql, setSchemaSql] = useState<string | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const parsedHours = Number(targetHours);
    const parsedRecovery = Number(recoveryMinutes);

    if (Number.isNaN(parsedHours) || parsedHours < 1 || parsedHours > 16) {
      setError('Daily productive target must be between 1 and 16 hours.');
      return;
    }
    if (Number.isNaN(parsedRecovery) || parsedRecovery < 15 || parsedRecovery > 180) {
      setError('Catch-up session duration must be between 15 and 180 minutes.');
      return;
    }

    setSaving(true);
    try {
      const next = await apiUpdateSettings({
        fullName,
        dailyTargetMinutes: Math.round(parsedHours * 60),
        recoverySessionMinutes: Math.round(parsedRecovery),
        theme,
        weeklyEmailEnabled,
        weeklyEmailDay,
      });
      onDataUpdated(next);
      setMessage('Settings saved and historical statistics synchronized.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadJson = () => {
    const todayStr = getLocalTodayStr();
    const exportPayload = {
      exportedAt: new Date().toISOString(),
      profile: data.user,
      dailyRecords: data.dailyRecords,
      activities: data.activities,
      recoveryTasks: data.recoveryTasks,
    };
    downloadTextFile(
      `discipline90-personal-data-${todayStr}.json`,
      JSON.stringify(exportPayload, null, 2),
      'application/json'
    );
  };

  const handleDownloadCsv = () => {
    const todayStr = getLocalTodayStr();
    const header = [
      'Date',
      'Title',
      'Category',
      'Start Time',
      'End Time',
      'Duration Minutes',
      'Description',
    ].join(',');
    const rows = data.activities.map((a) =>
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
      `discipline90-activities-${todayStr}.csv`,
      [header, ...rows].join('\n'),
      'text/csv;charset=utf-8'
    );
  };

  const loadSchema = async () => {
    if (schemaSql) {
      setSchemaSql(null);
      return;
    }
    try {
      const res = await apiGetSupabaseSchema();
      setSchemaSql(res.sql);
    } catch {
      setError('Could not load Supabase SQL schema.');
    }
  };

  const copySchema = async () => {
    if (!schemaSql) return;
    await navigator.clipboard.writeText(schemaSql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <form
        onSubmit={handleSave}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-6"
      >
        <div>
          <h2 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
            Discipline Targets & Preferences
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Adjust your daily minimum goal, weekend recovery block length, theme, and weekly digest schedule
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Display Name
            </label>
            <input
              type="text"
              maxLength={80}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Account Email
            </label>
            <input
              type="email"
              disabled
              value={data.user.email}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-[#0B0F17]/60 text-slate-500 dark:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Daily Productive Target (Hours)
            </label>
            <input
              type="number"
              min={1}
              max={16}
              step={0.5}
              value={targetHours}
              onChange={(e) => setTargetHours(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Default is 6 hours. Days meeting or exceeding this target earn PASS.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Catch-Up Session Duration (Minutes)
            </label>
            <input
              type="number"
              min={15}
              max={180}
              step={5}
              value={recoveryMinutes}
              onChange={(e) => setRecoveryMinutes(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Default is 30 minutes per missed day.
            </p>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Interface Theme
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  theme === 'dark'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Moon className="w-4 h-4" />
                <span>Dark Mode</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`flex-1 inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer ${
                  theme === 'light'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                    : 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                <Sun className="w-4 h-4" />
                <span>Light Mode</span>
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Automated Weekly Email Report
            </label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={weeklyEmailEnabled}
                  onChange={(e) => setWeeklyEmailEnabled(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Enable weekly summary</span>
              </label>
              <select
                disabled={!weeklyEmailEnabled}
                value={weeklyEmailDay}
                onChange={(e) => setWeeklyEmailDay(Number(e.target.value))}
                className="px-2.5 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 disabled:opacity-50"
              >
                {WEEKDAYS.map((wd) => (
                  <option key={wd.value} value={wd.value}>
                    {wd.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-2.5 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}
        {message && (
          <div className="rounded-lg border border-emerald-300 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
            {message}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Settings'}</span>
          </button>
        </div>
      </form>

      {/* Export Personal Data */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
            Download Personal Activity Data
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Export your complete activity logs, daily evaluations, and accountability history
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDownloadCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download CSV</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadJson}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download JSON</span>
          </button>
        </div>
      </section>

      {/* Supabase Schema & Integration Reference */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-500" />
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Supabase PostgreSQL & RLS Schema
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Active storage driver:{' '}
              <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                {data.meta.storageMode === 'supabase'
                  ? 'Supabase PostgreSQL (RLS Active)'
                  : 'Server SQLite (Ready for Supabase via SUPABASE_URL & SUPABASE_ANON_KEY env vars)'}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={loadSchema}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap cursor-pointer"
          >
            {schemaSql ? 'Hide SQL Schema' : 'View Supabase Schema SQL'}
          </button>
        </div>

        {schemaSql && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-950 text-slate-200 overflow-hidden">
            <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-400">supabase/schema.sql</span>
              <button
                type="button"
                onClick={copySchema}
                className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 cursor-pointer"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Copied' : 'Copy SQL'}</span>
              </button>
            </div>
            <pre className="p-4 text-[11px] font-mono overflow-x-auto max-h-80 leading-relaxed">
              {schemaSql}
            </pre>
          </div>
        )}
      </section>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import {
  apiCreateActivity,
  apiDeleteActivity,
  apiUpdateActivity,
} from '../lib/api.ts';
import {
  addDays,
  calculateIntervalMetrics,
  evaluateDayFromActivities,
  formatDuration,
  formatHumanDate,
  getLocalTodayStr,
  isFutureDate,
  timeToMinutes,
} from '../lib/discipline.ts';
import {
  ACTIVITY_CATEGORIES,
  type Activity,
  type ActivityCategory,
  type BootstrapPayload,
} from '../types/discipline.ts';

interface TrackerViewProps {
  data: BootstrapPayload;
  selectedDate: string;
  onChangeDate: (dateStr: string) => void;
  onDataUpdated: (next: BootstrapPayload) => void;
}

export const TrackerView: React.FC<TrackerViewProps> = ({
  data,
  selectedDate,
  onChangeDate,
  onDataUpdated,
}) => {
  const todayStr = getLocalTodayStr();
  const safeDate = isFutureDate(selectedDate, todayStr) ? todayStr : selectedDate;

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ActivityCategory>('Coding');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('11:00');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const dayActivities = useMemo(
    () =>
      data.activities
        .filter((a) => a.recordDate === safeDate)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [data.activities, safeDate]
  );

  const dayEval = useMemo(
    () =>
      evaluateDayFromActivities(
        safeDate,
        data.activities,
        data.user.dailyTargetMinutes
      ),
    [safeDate, data.activities, data.user.dailyTargetMinutes]
  );

  const intervalMetrics = useMemo(
    () => calculateIntervalMetrics(dayActivities),
    [dayActivities]
  );

  const liveDurationMinutes = useMemo(() => {
    const s = timeToMinutes(startTime);
    const e = timeToMinutes(endTime);
    return s >= 0 && e > s ? e - s : 0;
  }, [startTime, endTime]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setCategory('Coding');
    setStartTime('09:00');
    setEndTime('11:00');
    setDescription('');
    setError(null);
  };

  const startEdit = (act: Activity) => {
    setEditingId(act.id);
    setTitle(act.title);
    setCategory(act.category);
    setStartTime(act.startTime);
    setEndTime(act.endTime);
    setDescription(act.description);
    setError(null);
    setFeedback(null);
  };

  const handleDateChange = (nextDate: string) => {
    if (!nextDate) return;
    if (isFutureDate(nextDate, todayStr)) {
      setError('Future dates cannot be recorded.');
      return;
    }
    setError(null);
    setFeedback(null);
    resetForm();
    onChangeDate(nextDate);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (isFutureDate(safeDate, todayStr)) {
      setError('Future dates cannot be recorded.');
      return;
    }
    if (!title.trim()) {
      setError('Please enter an activity name.');
      return;
    }
    if (liveDurationMinutes <= 0) {
      setError('End time must be later than start time.');
      return;
    }

    setSubmitting(true);
    try {
      const nextPayload = editingId
        ? await apiUpdateActivity(editingId, {
            recordDate: safeDate,
            title: title.trim(),
            category,
            startTime,
            endTime,
            description: description.trim(),
          })
        : await apiCreateActivity({
            recordDate: safeDate,
            title: title.trim(),
            category,
            startTime,
            endTime,
            description: description.trim(),
          });

      onDataUpdated(nextPayload);
      setFeedback(
        editingId
          ? 'Activity updated and daily record recalculated.'
          : 'Activity saved automatically.'
      );
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save activity.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    setFeedback(null);
    setDeletingId(id);
    try {
      const nextPayload = await apiDeleteActivity(id);
      onDataUpdated(nextPayload);
      if (editingId === id) resetForm();
      setFeedback('Activity deleted and statistics updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete activity.');
    } finally {
      setDeletingId(null);
    }
  };

  const targetMinutes = data.user.dailyTargetMinutes;
  const progressPct = Math.min(
    100,
    Math.round((dayEval.netMinutes / Math.max(1, targetMinutes)) * 100)
  );

  return (
    <div className="space-y-6">
      {/* Date Navigation & Daily Evaluation Header */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Selected Date
            </div>
            <h2 className="mt-1 text-xl font-display font-semibold text-slate-900 dark:text-white">
              {formatHumanDate(safeDate)}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleDateChange(addDays(safeDate, -1))}
              aria-label="Previous day"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <input
              type="date"
              max={todayStr}
              value={safeDate}
              onChange={(e) => handleDateChange(e.target.value)}
              aria-label="Select tracking date"
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <button
              type="button"
              disabled={safeDate >= todayStr}
              onClick={() => handleDateChange(addDays(safeDate, 1))}
              aria-label="Next day"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => handleDateChange(todayStr)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap cursor-pointer"
            >
              Jump to Today
            </button>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Net Productive Time
            </div>
            <div className="mt-1 text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
              {formatDuration(dayEval.netMinutes)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Remaining to Target
            </div>
            <div className="mt-1 text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
              {dayEval.status === 'PASS'
                ? '0h 00m'
                : formatDuration(dayEval.remainingMinutes)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Daily Status
            </div>
            <div
              className={`mt-1 text-xl font-display font-bold ${
                dayEval.status === 'PASS'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : dayEval.status === 'FAIL'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {dayEval.status === 'NOT_RECORDED' ? 'NOT RECORDED' : dayEval.status}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Overlap Deduplicated
            </div>
            <div className="mt-1 text-xl font-mono font-bold tabular-nums text-slate-700 dark:text-slate-300">
              {formatDuration(dayEval.overlapMinutes)}
            </div>
          </div>
        </div>

        <div className="mt-4 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              dayEval.status === 'PASS'
                ? 'bg-emerald-500'
                : dayEval.status === 'FAIL'
                  ? 'bg-red-500'
                  : 'bg-slate-400'
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Add / Edit Activity Form */}
        <section className="xl:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              {editingId ? 'Edit Activity Entry' : 'Add Activity Entry'}
            </h3>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Activity Name
              </label>
              <input
                type="text"
                required
                maxLength={140}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Graph Algorithms & LeetCode Mediums"
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ActivityCategory)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
              >
                {ACTIVITY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Start Time
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  End Time
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2.5 text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-500 dark:text-slate-400">
                Calculated Duration
              </span>
              <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                {liveDurationMinutes > 0
                  ? formatDuration(liveDurationMinutes)
                  : 'Invalid time range'}
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Description (optional)
              </label>
              <textarea
                rows={3}
                maxLength={600}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Key milestones, chapters completed, or blockers..."
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300"
              >
                {error}
              </div>
            )}

            {feedback && (
              <div className="rounded-lg border border-emerald-300 dark:border-emerald-900/70 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300">
                {feedback}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || liveDurationMinutes <= 0}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {editingId ? <Save className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>
                {submitting
                  ? 'Saving...'
                  : editingId
                    ? 'Save Changes'
                    : 'Save Activity'}
              </span>
            </button>
          </form>
        </section>

        {/* Recorded Activities List */}
        <section className="xl:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
                Activities on {safeDate}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {dayActivities.length} logged · Gross {formatDuration(dayEval.grossMinutes)} · Net {formatDuration(dayEval.netMinutes)}
              </p>
            </div>
          </div>

          {dayEval.overlapMinutes > 0 && (
            <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50/70 dark:bg-amber-950/20 px-4 py-3 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Overlapping time intervals detected ({formatDuration(dayEval.overlapMinutes)} overlap). Net productive hours merge overlapping spans so time is never counted twice.
              </span>
            </div>
          )}

          {dayActivities.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg px-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No activities recorded for {safeDate}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Use the form on the left to record your first focused work session.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {dayActivities.map((act) => {
                const hasOverlap = intervalMetrics.overlappingActivityIds.has(act.id);
                return (
                  <div
                    key={act.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {act.title}
                        </span>
                        {hasOverlap && (
                          <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                            · Overlaps another entry
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{act.category}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {act.startTime} – {act.endTime}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono font-semibold tabular-nums text-slate-700 dark:text-slate-300">
                          {formatDuration(act.durationMinutes)}
                        </span>
                      </div>
                      {act.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed pt-1">
                          {act.description}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEdit(act)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === act.id}
                        onClick={() => handleDelete(act.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-200 dark:border-red-900/60 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-medium text-red-600 dark:text-red-400 disabled:opacity-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{deletingId === act.id ? 'Removing...' : 'Delete'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

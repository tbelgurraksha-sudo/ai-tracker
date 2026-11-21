import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  RotateCcw,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';
import { apiUpdateRecoveryTask } from '../lib/api.ts';
import {
  formatDuration,
  formatHumanDate,
  getLocalTodayStr,
  isWeekendDate,
} from '../lib/discipline.ts';
import type { BootstrapPayload, RecoveryTask } from '../types/discipline.ts';

interface AccountabilityViewProps {
  data: BootstrapPayload;
  onDataUpdated: (next: BootstrapPayload) => void;
}

type StatusFilter = 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';

export const AccountabilityView: React.FC<AccountabilityViewProps> = ({
  data,
  onDataUpdated,
}) => {
  const todayStr = getLocalTodayStr();
  const isWeekend = isWeekendDate(todayStr);

  const [filter, setFilter] = useState<StatusFilter>('ALL');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pendingTasks = useMemo(
    () => data.recoveryTasks.filter((t) => t.status === 'PENDING'),
    [data.recoveryTasks]
  );
  const completedTasks = useMemo(
    () => data.recoveryTasks.filter((t) => t.status === 'COMPLETED'),
    [data.recoveryTasks]
  );

  const totalPendingMinutes = useMemo(
    () => pendingTasks.reduce((sum, t) => sum + t.recoveryMinutes, 0),
    [pendingTasks]
  );

  const filteredTasks = useMemo(() => {
    if (filter === 'ALL') return data.recoveryTasks;
    return data.recoveryTasks.filter((t) => t.status === filter);
  }, [data.recoveryTasks, filter]);

  const handleToggleStatus = async (task: RecoveryTask, nextStatus: 'COMPLETED' | 'PENDING') => {
    setError(null);
    setBusyId(task.id);
    try {
      const next = await apiUpdateRecoveryTask(task.id, { status: nextStatus });
      onDataUpdated(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update recovery task.');
    } finally {
      setBusyId(null);
    }
  };

  const startEditingPlan = (task: RecoveryTask) => {
    setEditingNotesId(task.id);
    setDraftTitle(task.taskTitle);
    setDraftNotes(task.taskNotes);
  };

  const savePlan = async (taskId: string) => {
    setError(null);
    setBusyId(taskId);
    try {
      const next = await apiUpdateRecoveryTask(taskId, {
        taskTitle: draftTitle,
        taskNotes: draftNotes,
      });
      onDataUpdated(next);
      setEditingNotesId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save recovery notes.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Weekend Dedicated Mode Header */}
      <section
        className={`rounded-xl border p-6 ${
          isWeekend
            ? 'border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20'
            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
              {pendingTasks.length > 0 ? (
                <ShieldAlert className="w-4 h-4 text-amber-500" />
              ) : (
                <ShieldCheck className="w-4 h-4 text-emerald-500" />
              )}
              <span>
                {isWeekend
                  ? `Weekend Recovery Window (${formatHumanDate(todayStr)})`
                  : 'Weekday Accountability Tracker (Recovery sessions scheduled for Sat & Sun)'}
              </span>
            </div>
            <h2 className="text-2xl font-display font-bold text-slate-900 dark:text-white">
              {pendingTasks.length > 0
                ? `${pendingTasks.length} Pending Catch-Up Session${pendingTasks.length === 1 ? '' : 's'}`
                : 'All Recovery Sessions Cleared'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Every recorded day below {formatDuration(data.user.dailyTargetMinutes)} generates one {data.user.recoverySessionMinutes}-minute constructive catch-up session. Correcting a failed day to meet your target automatically cancels its pending penalty, and unrecorded days never generate penalties.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 shrink-0">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] px-4 py-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Pending
              </div>
              <div className="mt-1 text-xl font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
                {pendingTasks.length}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] px-4 py-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Recovery Time
              </div>
              <div className="mt-1 text-xl font-mono font-bold tabular-nums text-slate-900 dark:text-white">
                {formatDuration(totalPendingMinutes)}
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] px-4 py-3">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Completed
              </div>
              <div className="mt-1 text-xl font-mono font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {completedTasks.length}
              </div>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 dark:border-red-900/70 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300"
        >
          {error}
        </div>
      )}

      {/* Filter & Sessions Table / List */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-base font-display font-semibold text-slate-900 dark:text-white">
              Accountability Queue & History
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Complete unfinished tasks, extra study sessions, or focused project work
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/80">
            {(['ALL', 'PENDING', 'COMPLETED', 'CANCELLED'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  filter === tab
                    ? 'bg-white dark:bg-[#111827] text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {tab === 'ALL'
                  ? 'All'
                  : tab === 'PENDING'
                    ? 'Pending'
                    : tab === 'COMPLETED'
                      ? 'Completed'
                      : 'Cancelled'}
              </button>
            ))}
          </div>
        </div>

        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg px-4">
            <Clock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No recovery sessions in this view
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              When a recorded day finishes below your daily target, one catch-up session is added here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {filteredTasks.map((task) => {
              const isEditing = editingNotesId === task.id;
              return (
                <div key={task.id} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                          Failed Date: {task.failedDate}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-red-600 dark:text-red-400">
                          Missed by {formatDuration(task.missedMinutes)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          Recovery: {task.recoveryMinutes}m
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            task.status === 'COMPLETED'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : task.status === 'PENDING'
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {task.status}
                        </span>
                      </div>

                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        {task.taskTitle}
                      </div>
                      {task.taskNotes && (
                        <p className="text-xs text-slate-600 dark:text-slate-400">
                          {task.taskNotes}
                        </p>
                      )}
                      {task.completedAt && (
                        <div className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                          Completed on {task.completedAt.slice(0, 10)}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {task.status === 'PENDING' && (
                        <>
                          <button
                            type="button"
                            onClick={() => startEditingPlan(task)}
                            className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                          >
                            Edit Task Plan
                          </button>
                          <button
                            type="button"
                            disabled={busyId === task.id}
                            onClick={() => handleToggleStatus(task, 'COMPLETED')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Completed</span>
                          </button>
                        </>
                      )}

                      {task.status === 'COMPLETED' && (
                        <button
                          type="button"
                          disabled={busyId === task.id}
                          onClick={() => handleToggleStatus(task, 'PENDING')}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reopen</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Catch-up Activity Title
                        </label>
                        <input
                          type="text"
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Catch-up Notes
                        </label>
                        <input
                          type="text"
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#111827] text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busyId === task.id}
                          onClick={() => savePlan(task.id)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                        >
                          Save Plan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingNotesId(null)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

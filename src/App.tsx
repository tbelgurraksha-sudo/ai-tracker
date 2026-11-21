import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Calendar,
  Clock,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldAlert,
  X,
} from 'lucide-react';
import { AccountabilityView } from './components/AccountabilityView.tsx';
import { AnalyticsView } from './components/AnalyticsView.tsx';
import { AuthScreen } from './components/AuthScreen.tsx';
import { CalendarView } from './components/CalendarView.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { ReportsView } from './components/ReportsView.tsx';
import { SettingsView } from './components/SettingsView.tsx';
import { TrackerView } from './components/TrackerView.tsx';
import { apiGetBootstrap, apiGetSession, apiLogout } from './lib/api.ts';
import { formatDuration, getLocalTodayStr } from './lib/discipline.ts';
import type { BootstrapPayload, NavSection } from './types/discipline.ts';

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'tracker', label: 'Daily Activity Tracker', icon: Clock },
  { id: 'calendar', label: 'Calendar', icon: Calendar },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'accountability', label: 'Weekend Accountability', icon: ShieldAlert },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [trackerDate, setTrackerDate] = useState(() => getLocalTodayStr());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadSession = async () => {
    setBootLoading(true);
    setBootError(null);
    try {
      await apiGetSession();
      const boot = await apiGetBootstrap();
      setData(boot);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (
        msg.toLowerCase().includes('authentication') ||
        msg.toLowerCase().includes('session') ||
        msg.toLowerCase().includes('401')
      ) {
        setData(null);
      } else {
        setData(null);
      }
    } finally {
      setBootLoading(false);
    }
  };

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    const theme = data?.user.theme ?? 'dark';
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [data?.user.theme]);

  const handleNavigate = (section: NavSection, dateStr?: string) => {
    if (dateStr) {
      setTrackerDate(dateStr);
    }
    setActiveNav(section);
    setMobileMenuOpen(false);
  };

  const handleQuickLogToday = () => {
    setTrackerDate(getLocalTodayStr());
    setActiveNav('tracker');
    setMobileMenuOpen(false);
  };

  const handleLogout = async () => {
    await apiLogout();
    setData(null);
    setActiveNav('dashboard');
  };

  if (bootLoading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4">
          <div className="h-6 w-36 rounded bg-slate-200 dark:bg-slate-800 animate-pulse mx-auto" />
          <div className="h-32 rounded-xl bg-slate-200 dark:bg-slate-800/70 animate-pulse" />
          <div className="h-10 rounded-lg bg-slate-200 dark:bg-slate-800/70 animate-pulse" />
        </div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-xl border border-red-300 dark:border-red-900 bg-white dark:bg-[#111827] p-6 text-center space-y-3">
          <h1 className="text-lg font-display font-semibold text-slate-900 dark:text-white">
            Unable to connect
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400">{bootError}</p>
          <button
            type="button"
            onClick={() => void loadSession()}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <AuthScreen
        onAuthenticated={(authData) => {
          setData(authData);
          setActiveNav('dashboard');
        }}
      />
    );
  }

  const pendingRecoveryCount = data.recoveryTasks.filter(
    (t) => t.status === 'PENDING'
  ).length;

  const activeItem = NAV_ITEMS.find((item) => item.id === activeNav) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-[#111827] border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 lg:translate-x-0 lg:static lg:shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-lg font-display font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
              DISCIPLINE 90
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="lg:hidden p-1.5 rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="p-3 space-y-1" aria-label="Main Navigation">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavigate(item.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                    isActive
                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'accountability' && pendingRecoveryCount > 0 && (
                    <span className="font-mono text-[11px] font-semibold tabular-nums text-amber-600 dark:text-amber-400 shrink-0">
                      {pendingRecoveryCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
              {data.user.fullName || 'Member'}
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {data.user.email}
            </div>
            <div className="mt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              Target {formatDuration(data.user.dailyTargetMinutes)}/day
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 px-4 sm:px-6 lg:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="text-base sm:text-lg font-display font-semibold text-slate-900 dark:text-white truncate">
              {activeItem.label}
            </h1>
          </div>

          <button
            type="button"
            onClick={handleQuickLogToday}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Log Activity</span>
          </button>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeNav === 'dashboard' && (
            <DashboardView
              data={data}
              onNavigate={handleNavigate}
              onQuickLogToday={handleQuickLogToday}
            />
          )}

          {activeNav === 'tracker' && (
            <TrackerView
              data={data}
              selectedDate={trackerDate}
              onChangeDate={setTrackerDate}
              onDataUpdated={setData}
            />
          )}

          {activeNav === 'calendar' && (
            <CalendarView
              data={data}
              onOpenDateInTracker={(d) => handleNavigate('tracker', d)}
            />
          )}

          {activeNav === 'analytics' && (
            <AnalyticsView
              data={data}
              onInspectDate={(d) => handleNavigate('tracker', d)}
            />
          )}

          {activeNav === 'accountability' && (
            <AccountabilityView data={data} onDataUpdated={setData} />
          )}

          {activeNav === 'reports' && (
            <ReportsView data={data} onDataUpdated={setData} />
          )}

          {activeNav === 'settings' && (
            <SettingsView data={data} onDataUpdated={setData} />
          )}
        </main>
      </div>
    </div>
  );
}

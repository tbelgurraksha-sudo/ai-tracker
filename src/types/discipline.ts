export const ACTIVITY_CATEGORIES = [
  'Coding',
  'DSA',
  'College Studies',
  'Agentic AI',
  'Projects',
  'Government Exam Preparation',
  'Communication Skills',
  'Other',
] as const;

export type ActivityCategory = (typeof ACTIVITY_CATEGORIES)[number];

export type DayStatus = 'PASS' | 'FAIL' | 'NOT_RECORDED';

export type RecoveryStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export type ThemeMode = 'dark' | 'light';

export type NavSection =
  | 'dashboard'
  | 'tracker'
  | 'calendar'
  | 'analytics'
  | 'accountability'
  | 'reports'
  | 'settings';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  dailyTargetMinutes: number;
  recoverySessionMinutes: number;
  theme: ThemeMode;
  weeklyEmailEnabled: boolean;
  weeklyEmailDay: number; // 0 = Sunday ... 6 = Saturday
  createdAt: string;
}

export interface Activity {
  id: string;
  userId: string;
  dailyRecordId?: string | null;
  recordDate: string; // YYYY-MM-DD
  title: string;
  category: ActivityCategory;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  durationMinutes: number;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyRecord {
  id: string;
  userId: string;
  recordDate: string; // YYYY-MM-DD
  totalMinutes: number; // Net non-overlapping minutes
  targetMinutes: number;
  status: 'PASS' | 'FAIL';
  updatedAt: string;
}

export interface RecoveryTask {
  id: string;
  userId: string;
  failedDate: string; // YYYY-MM-DD
  missedMinutes: number;
  recoveryMinutes: number;
  status: RecoveryStatus;
  taskTitle: string;
  taskNotes: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyEmailLog {
  id: string;
  userId: string;
  weekStart: string;
  weekEnd: string;
  recipientEmail: string;
  subject: string;
  deliveryStatus: string;
  summary: {
    totalMinutes: number;
    passedDays: number;
    failedDays: number;
    recordedDays: number;
    successRate: number;
    pendingRecoveryCount: number;
    pendingRecoveryMinutes: number;
    currentStreak: number;
  };
  htmlPreview?: string;
  sentAt: string;
}

export interface BackendMeta {
  storageMode: 'supabase' | 'sqlite';
  emailTransportConfigured: boolean;
}

export interface BootstrapPayload {
  user: UserProfile;
  activities: Activity[];
  dailyRecords: DailyRecord[];
  recoveryTasks: RecoveryTask[];
  weeklyEmailLogs: WeeklyEmailLog[];
  meta: BackendMeta;
}

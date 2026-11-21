import { getLocalTodayStr } from './discipline.ts';
import type {
  ActivityCategory,
  BootstrapPayload,
  ThemeMode,
  WeeklyEmailLog,
} from '../types/discipline.ts';

let memoryAccessToken = '';

export function setMemoryAccessToken(token: string): void {
  memoryAccessToken = token;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'discipline90',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (memoryAccessToken) {
    headers['Authorization'] = `Bearer ${memoryAccessToken}`;
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data && data.error) || `Request failed (${res.status})`);
  }
  return data as T;
}

export interface AuthResponse extends BootstrapPayload {
  accessToken: string;
}

export async function apiRegister(params: {
  email: string;
  password: string;
  fullName: string;
}): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  setMemoryAccessToken(res.accessToken);
  return res;
}

export async function apiLogin(params: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(params),
  });
  setMemoryAccessToken(res.accessToken);
  return res;
}

export async function apiLogout(): Promise<void> {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } finally {
    setMemoryAccessToken('');
  }
}

export async function apiGetSession(): Promise<AuthResponse> {
  const res = await request<AuthResponse>('/api/auth/me');
  if (res.accessToken) setMemoryAccessToken(res.accessToken);
  return res;
}

export async function apiGetBootstrap(): Promise<BootstrapPayload> {
  const today = encodeURIComponent(getLocalTodayStr());
  return request<BootstrapPayload>(`/api/bootstrap?today=${today}`);
}

export async function apiCreateActivity(input: {
  recordDate: string;
  title: string;
  category: ActivityCategory;
  startTime: string;
  endTime: string;
  description: string;
}): Promise<BootstrapPayload> {
  return request<BootstrapPayload>('/api/activities', {
    method: 'POST',
    body: JSON.stringify({ ...input, clientToday: getLocalTodayStr() }),
  });
}

export async function apiUpdateActivity(
  id: string,
  input: {
    recordDate: string;
    title: string;
    category: ActivityCategory;
    startTime: string;
    endTime: string;
    description: string;
  }
): Promise<BootstrapPayload> {
  return request<BootstrapPayload>(`/api/activities/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ ...input, clientToday: getLocalTodayStr() }),
  });
}

export async function apiDeleteActivity(id: string): Promise<BootstrapPayload> {
  return request<BootstrapPayload>(`/api/activities/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function apiUpdateRecoveryTask(
  id: string,
  updates: { status?: 'PENDING' | 'COMPLETED'; taskTitle?: string; taskNotes?: string }
): Promise<BootstrapPayload> {
  return request<BootstrapPayload>(`/api/recovery/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function apiUpdateSettings(updates: {
  fullName?: string;
  dailyTargetMinutes?: number;
  recoverySessionMinutes?: number;
  theme?: ThemeMode;
  weeklyEmailEnabled?: boolean;
  weeklyEmailDay?: number;
}): Promise<BootstrapPayload> {
  return request<BootstrapPayload>('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export async function apiPreviewWeeklyEmail(dateStr: string): Promise<{
  weekStart: string;
  weekEnd: string;
  subject: string;
  html: string;
  text: string;
  summary: WeeklyEmailLog['summary'];
}> {
  return request(`/api/reports/weekly-email/preview?date=${encodeURIComponent(dateStr)}`);
}

export async function apiSendWeeklyEmail(dateStr: string): Promise<{
  log: WeeklyEmailLog;
  bootstrap: BootstrapPayload;
}> {
  return request('/api/reports/weekly-email/send', {
    method: 'POST',
    body: JSON.stringify({ date: dateStr }),
  });
}

export async function apiGetSupabaseSchema(): Promise<{ sql: string }> {
  return request('/api/supabase/schema');
}

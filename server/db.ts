import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  calculateIntervalMetrics,
  timeToMinutes,
} from '../src/lib/discipline.ts';
import {
  ACTIVITY_CATEGORIES,
  type Activity,
  type ActivityCategory,
  type BackendMeta,
  type BootstrapPayload,
  type DailyRecord,
  type RecoveryTask,
  type ThemeMode,
  type UserProfile,
  type WeeklyEmailLog,
} from '../src/types/discipline.ts';

const SUPABASE_URL = (process.env.SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = (process.env.SUPABASE_ANON_KEY ?? '').trim();
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

export const isSupabaseConfigured = Boolean(
  SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    SUPABASE_URL.startsWith('https://') &&
    !SUPABASE_URL.includes('YOUR_')
);

const SESSION_SECRET =
  (process.env.SESSION_SECRET ?? '').trim() || crypto.randomBytes(32).toString('hex');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'discipline90.db');

let sqliteDb: DatabaseSync | null = null;

function getSqlite(): DatabaseSync {
  if (!sqliteDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    sqliteDb = new DatabaseSync(DB_PATH);
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL DEFAULT '',
        daily_target_minutes INTEGER NOT NULL DEFAULT 360,
        recovery_session_minutes INTEGER NOT NULL DEFAULT 30,
        theme TEXT NOT NULL DEFAULT 'dark',
        weekly_email_enabled INTEGER NOT NULL DEFAULT 1,
        weekly_email_day INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS daily_records (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        record_date TEXT NOT NULL,
        total_minutes INTEGER NOT NULL DEFAULT 0,
        target_minutes INTEGER NOT NULL DEFAULT 360,
        status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL')),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, record_date)
      );

      CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        daily_record_id TEXT REFERENCES daily_records(id) ON DELETE CASCADE,
        record_date TEXT NOT NULL,
        title TEXT NOT NULL,
        category TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_minutes INTEGER NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS recovery_tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        failed_date TEXT NOT NULL,
        missed_minutes INTEGER NOT NULL,
        recovery_minutes INTEGER NOT NULL DEFAULT 30,
        status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
        task_title TEXT NOT NULL,
        task_notes TEXT NOT NULL DEFAULT '',
        completed_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, failed_date)
      );

      CREATE TABLE IF NOT EXISTS weekly_email_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        recipient_email TEXT NOT NULL,
        subject TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        html_preview TEXT NOT NULL DEFAULT '',
        delivery_status TEXT NOT NULL DEFAULT 'GENERATED_PREVIEW',
        sent_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_daily_records_user_date ON daily_records(user_id, record_date DESC);
      CREATE INDEX IF NOT EXISTS idx_activities_user_date ON activities(user_id, record_date DESC);
      CREATE INDEX IF NOT EXISTS idx_recovery_tasks_user_status ON recovery_tasks(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_weekly_email_user_week ON weekly_email_logs(user_id, week_start);
    `);
  }
  return sqliteDb;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const expected = Buffer.from(keyHex, 'hex');
  const derived = crypto.scryptSync(password, salt, 64);
  if (expected.length !== derived.length) return false;
  return crypto.timingSafeEqual(expected, derived);
}

interface TokenPayload {
  sub: string;
  email: string;
  exp: number;
}

export function signSessionToken(userId: string, email: string): string {
  const payload: TokenPayload = {
    sub: userId,
    email,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 14, // 14 days
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): TokenPayload | null {
  try {
    const [encoded, sig] = token.split('.');
    if (!encoded || !sig) return null;
    const expectedSig = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(encoded)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!parsed.sub || !parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

function createSupabaseAnon(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createSupabaseAuthed(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}

export function getBackendMeta(): BackendMeta {
  const hasResend = Boolean((process.env.RESEND_API_KEY ?? '').trim());
  const hasSmtp = Boolean(
    (process.env.SMTP_HOST ?? '').trim() &&
      (process.env.SMTP_USER ?? '').trim() &&
      (process.env.SMTP_PASS ?? '').trim()
  );
  return {
    storageMode: isSupabaseConfigured ? 'supabase' : 'sqlite',
    emailTransportConfigured: hasResend || hasSmtp,
  };
}

export interface AuthSession {
  user: UserProfile;
  accessToken: string;
}

function mapSqliteUser(row: Record<string, unknown>): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email),
    fullName: String(row.full_name ?? ''),
    dailyTargetMinutes: Number(row.daily_target_minutes ?? 360),
    recoverySessionMinutes: Number(row.recovery_session_minutes ?? 30),
    theme: row.theme === 'light' ? 'light' : 'dark',
    weeklyEmailEnabled: Boolean(row.weekly_email_enabled),
    weeklyEmailDay: Number(row.weekly_email_day ?? 0),
    createdAt: String(row.created_at),
  };
}

function mapSupabaseProfile(row: Record<string, unknown>, fallbackEmail = ''): UserProfile {
  return {
    id: String(row.id),
    email: String(row.email ?? fallbackEmail),
    fullName: String(row.full_name ?? ''),
    dailyTargetMinutes: Number(row.daily_target_minutes ?? 360),
    recoverySessionMinutes: Number(row.recovery_session_minutes ?? 30),
    theme: row.theme === 'light' ? 'light' : 'dark',
    weeklyEmailEnabled: row.weekly_email_enabled !== false,
    weeklyEmailDay: Number(row.weekly_email_day ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapActivityRow(row: Record<string, unknown>): Activity {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    dailyRecordId: row.daily_record_id ? String(row.daily_record_id) : null,
    recordDate: String(row.record_date).slice(0, 10),
    title: String(row.title),
    category: (ACTIVITY_CATEGORIES.includes(row.category as ActivityCategory)
      ? row.category
      : 'Other') as ActivityCategory,
    startTime: String(row.start_time),
    endTime: String(row.end_time),
    durationMinutes: Number(row.duration_minutes),
    description: String(row.description ?? ''),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapDailyRecordRow(row: Record<string, unknown>): DailyRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    recordDate: String(row.record_date).slice(0, 10),
    totalMinutes: Number(row.total_minutes),
    targetMinutes: Number(row.target_minutes),
    status: row.status === 'PASS' ? 'PASS' : 'FAIL',
    updatedAt: String(row.updated_at),
  };
}

function mapRecoveryRow(row: Record<string, unknown>): RecoveryTask {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    failedDate: String(row.failed_date).slice(0, 10),
    missedMinutes: Number(row.missed_minutes),
    recoveryMinutes: Number(row.recovery_minutes),
    status:
      row.status === 'COMPLETED'
        ? 'COMPLETED'
        : row.status === 'CANCELLED'
          ? 'CANCELLED'
          : 'PENDING',
    taskTitle: String(row.task_title),
    taskNotes: String(row.task_notes ?? ''),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function registerUser(params: {
  email: string;
  password: string;
  fullName: string;
}): Promise<AuthSession> {
  const email = params.email.trim().toLowerCase();
  const fullName = params.fullName.trim().slice(0, 80);

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAnon();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: params.password,
      options: { data: { full_name: fullName } },
    });
    if (error) {
      throw new Error(error.message);
    }
    if (!data.user || !data.session) {
      throw new Error(
        'Account created. Please verify your email in Supabase or disable email confirmation in Supabase Auth settings.'
      );
    }
    const authed = createSupabaseAuthed(data.session.access_token);
    const { data: profileRow } = await authed
      .from('profiles')
      .upsert({
        id: data.user.id,
        email,
        full_name: fullName,
      })
      .select()
      .single();

    return {
      user: mapSupabaseProfile(profileRow ?? { id: data.user.id, email, full_name: fullName }, email),
      accessToken: data.session.access_token,
    };
  }

  const db = getSqlite();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    throw new Error('An account with this email already exists.');
  }

  const id = crypto.randomUUID();
  const passwordHash = hashPassword(params.password);
  db.prepare(
    `INSERT INTO users (id, email, password_hash, full_name)
     VALUES (?, ?, ?, ?)`
  ).run(id, email, passwordHash, fullName);

  const created = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown>;
  return {
    user: mapSqliteUser(created),
    accessToken: signSessionToken(id, email),
  };
}

export async function loginUser(params: {
  email: string;
  password: string;
}): Promise<AuthSession> {
  const email = params.email.trim().toLowerCase();

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAnon();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: params.password,
    });
    if (error || !data.user || !data.session) {
      throw new Error(error?.message || 'Invalid email or password.');
    }
    const authed = createSupabaseAuthed(data.session.access_token);
    const { data: profileRow } = await authed
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();

    const profile = profileRow
      ? mapSupabaseProfile(profileRow, email)
      : mapSupabaseProfile({ id: data.user.id, email }, email);

    return {
      user: profile,
      accessToken: data.session.access_token,
    };
  }

  const db = getSqlite();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as
    | Record<string, unknown>
    | undefined;
  if (!row || !verifyPassword(params.password, String(row.password_hash))) {
    throw new Error('Invalid email or password.');
  }

  return {
    user: mapSqliteUser(row),
    accessToken: signSessionToken(String(row.id), email),
  };
}

export async function resolveUserFromToken(token: string): Promise<UserProfile | null> {
  if (!token) return null;

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAuthed(token);
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .maybeSingle();
    return mapSupabaseProfile(
      profileRow ?? { id: data.user.id, email: data.user.email ?? '' },
      data.user.email ?? ''
    );
  }

  const payload = verifySessionToken(token);
  if (!payload) return null;
  const db = getSqlite();
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub) as
    | Record<string, unknown>
    | undefined;
  return row ? mapSqliteUser(row) : null;
}

export async function getBootstrapData(
  user: UserProfile,
  accessToken: string
): Promise<BootstrapPayload> {
  if (isSupabaseConfigured) {
    const supabase = createSupabaseAuthed(accessToken);
    const [actsRes, dailyRes, recRes, logsRes] = await Promise.all([
      supabase
        .from('activities')
        .select('*')
        .eq('user_id', user.id)
        .order('record_date', { ascending: false })
        .order('start_time', { ascending: true }),
      supabase
        .from('daily_records')
        .select('*')
        .eq('user_id', user.id)
        .order('record_date', { ascending: false }),
      supabase
        .from('recovery_tasks')
        .select('*')
        .eq('user_id', user.id)
        .order('failed_date', { ascending: false }),
      supabase
        .from('weekly_email_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('sent_at', { ascending: false })
        .limit(20),
    ]);

    if (actsRes.error) throw new Error(actsRes.error.message);
    if (dailyRes.error) throw new Error(dailyRes.error.message);
    if (recRes.error) throw new Error(recRes.error.message);

    return {
      user,
      activities: (actsRes.data ?? []).map(mapActivityRow),
      dailyRecords: (dailyRes.data ?? []).map(mapDailyRecordRow),
      recoveryTasks: (recRes.data ?? []).map(mapRecoveryRow),
      weeklyEmailLogs: (logsRes.data ?? []).map((row) => ({
        id: String(row.id),
        userId: String(row.user_id),
        weekStart: String(row.week_start),
        weekEnd: String(row.week_end),
        recipientEmail: String(row.recipient_email),
        subject: String(row.subject),
        deliveryStatus: String(row.delivery_status),
        summary: (row.summary_json ?? {}) as WeeklyEmailLog['summary'],
        sentAt: String(row.sent_at),
      })),
      meta: getBackendMeta(),
    };
  }

  const db = getSqlite();
  const actRows = db
    .prepare(
      'SELECT * FROM activities WHERE user_id = ? ORDER BY record_date DESC, start_time ASC'
    )
    .all(user.id) as Record<string, unknown>[];
  const dailyRows = db
    .prepare('SELECT * FROM daily_records WHERE user_id = ? ORDER BY record_date DESC')
    .all(user.id) as Record<string, unknown>[];
  const recRows = db
    .prepare('SELECT * FROM recovery_tasks WHERE user_id = ? ORDER BY failed_date DESC')
    .all(user.id) as Record<string, unknown>[];
  const emailRows = db
    .prepare(
      'SELECT * FROM weekly_email_logs WHERE user_id = ? ORDER BY sent_at DESC LIMIT 20'
    )
    .all(user.id) as Record<string, unknown>[];

  return {
    user,
    activities: actRows.map(mapActivityRow),
    dailyRecords: dailyRows.map(mapDailyRecordRow),
    recoveryTasks: recRows.map(mapRecoveryRow),
    weeklyEmailLogs: emailRows.map((row) => ({
      id: String(row.id),
      userId: String(row.user_id),
      weekStart: String(row.week_start),
      weekEnd: String(row.week_end),
      recipientEmail: String(row.recipient_email),
      subject: String(row.subject),
      deliveryStatus: String(row.delivery_status),
      summary: JSON.parse(String(row.summary_json || '{}')),
      htmlPreview: String(row.html_preview ?? ''),
      sentAt: String(row.sent_at),
    })),
    meta: getBackendMeta(),
  };
}

async function recalculateDayAndAccountability(
  user: UserProfile,
  accessToken: string,
  recordDate: string
): Promise<void> {
  if (isSupabaseConfigured) {
    const supabase = createSupabaseAuthed(accessToken);
    const { data: dayActs, error: actsErr } = await supabase
      .from('activities')
      .select('*')
      .eq('user_id', user.id)
      .eq('record_date', recordDate);

    if (actsErr) throw new Error(actsErr.message);

    const mapped = (dayActs ?? []).map(mapActivityRow);

    if (mapped.length === 0) {
      await supabase
        .from('daily_records')
        .delete()
        .eq('user_id', user.id)
        .eq('record_date', recordDate);
      await supabase
        .from('recovery_tasks')
        .delete()
        .eq('user_id', user.id)
        .eq('failed_date', recordDate)
        .eq('status', 'PENDING');
      return;
    }

    const metrics = calculateIntervalMetrics(mapped);
    const status: 'PASS' | 'FAIL' =
      metrics.netMinutes >= user.dailyTargetMinutes ? 'PASS' : 'FAIL';

    const { data: upsertedRecord, error: recErr } = await supabase
      .from('daily_records')
      .upsert(
        {
          user_id: user.id,
          record_date: recordDate,
          total_minutes: metrics.netMinutes,
          target_minutes: user.dailyTargetMinutes,
          status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,record_date' }
      )
      .select()
      .single();

    if (recErr) throw new Error(recErr.message);

    if (upsertedRecord?.id) {
      await supabase
        .from('activities')
        .update({ daily_record_id: upsertedRecord.id })
        .eq('user_id', user.id)
        .eq('record_date', recordDate);
    }

    const { data: existingTask } = await supabase
      .from('recovery_tasks')
      .select('*')
      .eq('user_id', user.id)
      .eq('failed_date', recordDate)
      .maybeSingle();

    if (status === 'PASS') {
      if (existingTask && existingTask.status === 'PENDING') {
        await supabase
          .from('recovery_tasks')
          .update({
            status: 'CANCELLED',
            task_notes: 'Automatically cancelled after reaching daily productive target.',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingTask.id)
          .eq('user_id', user.id);
      }
    } else {
      const missedMinutes = Math.max(1, user.dailyTargetMinutes - metrics.netMinutes);
      if (!existingTask) {
        await supabase.from('recovery_tasks').insert({
          user_id: user.id,
          failed_date: recordDate,
          missed_minutes: missedMinutes,
          recovery_minutes: user.recoverySessionMinutes,
          status: 'PENDING',
          task_title: `Weekend catch-up session (${user.recoverySessionMinutes}m) for ${recordDate}`,
          task_notes: 'Complete unfinished tasks, extra study session, or project work.',
        });
      } else if (existingTask.status !== 'COMPLETED') {
        await supabase
          .from('recovery_tasks')
          .update({
            status: 'PENDING',
            missed_minutes: missedMinutes,
            recovery_minutes: user.recoverySessionMinutes,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingTask.id)
          .eq('user_id', user.id);
      }
    }
    return;
  }

  const db = getSqlite();
  const dayActs = db
    .prepare('SELECT * FROM activities WHERE user_id = ? AND record_date = ?')
    .all(user.id, recordDate) as Record<string, unknown>[];

  if (dayActs.length === 0) {
    db.prepare('DELETE FROM daily_records WHERE user_id = ? AND record_date = ?').run(
      user.id,
      recordDate
    );
    db.prepare(
      `DELETE FROM recovery_tasks WHERE user_id = ? AND failed_date = ? AND status = 'PENDING'`
    ).run(user.id, recordDate);
    return;
  }

  const mapped = dayActs.map(mapActivityRow);
  const metrics = calculateIntervalMetrics(mapped);
  const status: 'PASS' | 'FAIL' =
    metrics.netMinutes >= user.dailyTargetMinutes ? 'PASS' : 'FAIL';

  const existingDaily = db
    .prepare('SELECT id FROM daily_records WHERE user_id = ? AND record_date = ?')
    .get(user.id, recordDate) as { id: string } | undefined;

  const dailyId = existingDaily?.id ?? crypto.randomUUID();
  const nowIso = new Date().toISOString();

  if (existingDaily) {
    db.prepare(
      `UPDATE daily_records
       SET total_minutes = ?, target_minutes = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(metrics.netMinutes, user.dailyTargetMinutes, status, nowIso, dailyId, user.id);
  } else {
    db.prepare(
      `INSERT INTO daily_records (id, user_id, record_date, total_minutes, target_minutes, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      dailyId,
      user.id,
      recordDate,
      metrics.netMinutes,
      user.dailyTargetMinutes,
      status,
      nowIso,
      nowIso
    );
  }

  db.prepare(
    'UPDATE activities SET daily_record_id = ? WHERE user_id = ? AND record_date = ?'
  ).run(dailyId, user.id, recordDate);

  const existingRecovery = db
    .prepare('SELECT * FROM recovery_tasks WHERE user_id = ? AND failed_date = ?')
    .get(user.id, recordDate) as Record<string, unknown> | undefined;

  if (status === 'PASS') {
    if (existingRecovery && existingRecovery.status === 'PENDING') {
      db.prepare(
        `UPDATE recovery_tasks
         SET status = 'CANCELLED',
             task_notes = 'Automatically cancelled after reaching daily productive target.',
             updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(nowIso, String(existingRecovery.id), user.id);
    }
  } else {
    const missedMinutes = Math.max(1, user.dailyTargetMinutes - metrics.netMinutes);
    if (!existingRecovery) {
      db.prepare(
        `INSERT INTO recovery_tasks (
          id, user_id, failed_date, missed_minutes, recovery_minutes,
          status, task_title, task_notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?)`
      ).run(
        crypto.randomUUID(),
        user.id,
        recordDate,
        missedMinutes,
        user.recoverySessionMinutes,
        `Weekend catch-up session (${user.recoverySessionMinutes}m) for ${recordDate}`,
        'Complete unfinished tasks, additional study session, or project work.',
        nowIso,
        nowIso
      );
    } else if (existingRecovery.status !== 'COMPLETED') {
      db.prepare(
        `UPDATE recovery_tasks
         SET status = 'PENDING',
             missed_minutes = ?,
             recovery_minutes = ?,
             updated_at = ?
         WHERE id = ? AND user_id = ?`
      ).run(
        missedMinutes,
        user.recoverySessionMinutes,
        nowIso,
        String(existingRecovery.id),
        user.id
      );
    }
  }
}

export interface ActivityInput {
  recordDate: string;
  title: string;
  category: ActivityCategory;
  startTime: string;
  endTime: string;
  description?: string;
}

export async function createActivity(
  user: UserProfile,
  accessToken: string,
  input: ActivityInput
): Promise<BootstrapPayload> {
  const startMin = timeToMinutes(input.startTime);
  const endMin = timeToMinutes(input.endTime);
  if (startMin < 0 || endMin <= startMin) {
    throw new Error('End time must be after start time.');
  }
  const durationMinutes = endMin - startMin;

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAuthed(accessToken);
    const { error } = await supabase.from('activities').insert({
      user_id: user.id,
      record_date: input.recordDate,
      title: input.title.trim().slice(0, 140),
      category: input.category,
      start_time: input.startTime,
      end_time: input.endTime,
      duration_minutes: durationMinutes,
      description: (input.description ?? '').trim().slice(0, 600),
    });
    if (error) throw new Error(error.message);
  } else {
    const db = getSqlite();
    const nowIso = new Date().toISOString();
    db.prepare(
      `INSERT INTO activities (
        id, user_id, record_date, title, category, start_time, end_time,
        duration_minutes, description, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      crypto.randomUUID(),
      user.id,
      input.recordDate,
      input.title.trim().slice(0, 140),
      input.category,
      input.startTime,
      input.endTime,
      durationMinutes,
      (input.description ?? '').trim().slice(0, 600),
      nowIso,
      nowIso
    );
  }

  await recalculateDayAndAccountability(user, accessToken, input.recordDate);
  return getBootstrapData(user, accessToken);
}

export async function updateActivity(
  user: UserProfile,
  accessToken: string,
  activityId: string,
  input: ActivityInput
): Promise<BootstrapPayload> {
  const startMin = timeToMinutes(input.startTime);
  const endMin = timeToMinutes(input.endTime);
  if (startMin < 0 || endMin <= startMin) {
    throw new Error('End time must be after start time.');
  }
  const durationMinutes = endMin - startMin;

  let previousDate = input.recordDate;

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAuthed(accessToken);
    const { data: existing } = await supabase
      .from('activities')
      .select('record_date')
      .eq('id', activityId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!existing) throw new Error('Activity not found.');
    previousDate = String(existing.record_date).slice(0, 10);

    const { error } = await supabase
      .from('activities')
      .update({
        record_date: input.recordDate,
        title: input.title.trim().slice(0, 140),
        category: input.category,
        start_time: input.startTime,
        end_time: input.endTime,
        duration_minutes: durationMinutes,
        description: (input.description ?? '').trim().slice(0, 600),
        updated_at: new Date().toISOString(),
      })
      .eq('id', activityId)
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
  } else {
    const db = getSqlite();
    const existing = db
      .prepare('SELECT record_date FROM activities WHERE id = ? AND user_id = ?')
      .get(activityId, user.id) as { record_date: string } | undefined;
    if (!existing) throw new Error('Activity not found.');
    previousDate = existing.record_date;

    db.prepare(
      `UPDATE activities
       SET record_date = ?, title = ?, category = ?, start_time = ?, end_time = ?,
           duration_minutes = ?, description = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(
      input.recordDate,
      input.title.trim().slice(0, 140),
      input.category,
      input.startTime,
      input.endTime,
      durationMinutes,
      (input.description ?? '').trim().slice(0, 600),
      new Date().toISOString(),
      activityId,
      user.id
    );
  }

  await recalculateDayAndAccountability(user, accessToken, input.recordDate);
  if (previousDate !== input.recordDate) {
    await recalculateDayAndAccountability(user, accessToken, previousDate);
  }
  return getBootstrapData(user, accessToken);
}

export async function deleteActivity(
  user: UserProfile,
  accessToken: string,
  activityId: string
): Promise<BootstrapPayload> {
  let targetDate = '';

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAuthed(accessToken);
    const { data: existing } = await supabase
      .from('activities')
      .select('record_date')
      .eq('id', activityId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!existing) throw new Error('Activity not found.');
    targetDate = String(existing.record_date).slice(0, 10);

    const { error } = await supabase
      .from('activities')
      .delete()
      .eq('id', activityId)
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
  } else {
    const db = getSqlite();
    const existing = db
      .prepare('SELECT record_date FROM activities WHERE id = ? AND user_id = ?')
      .get(activityId, user.id) as { record_date: string } | undefined;
    if (!existing) throw new Error('Activity not found.');
    targetDate = existing.record_date;

    db.prepare('DELETE FROM activities WHERE id = ? AND user_id = ?').run(
      activityId,
      user.id
    );
  }

  await recalculateDayAndAccountability(user, accessToken, targetDate);
  return getBootstrapData(user, accessToken);
}

export async function updateRecoveryTask(
  user: UserProfile,
  accessToken: string,
  taskId: string,
  updates: { status?: 'PENDING' | 'COMPLETED'; taskTitle?: string; taskNotes?: string }
): Promise<BootstrapPayload> {
  const nowIso = new Date().toISOString();

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAuthed(accessToken);
    const patch: Record<string, unknown> = { updated_at: nowIso };
    if (updates.status) {
      patch.status = updates.status;
      patch.completed_at = updates.status === 'COMPLETED' ? nowIso : null;
    }
    if (typeof updates.taskTitle === 'string') {
      patch.task_title = updates.taskTitle.trim().slice(0, 160);
    }
    if (typeof updates.taskNotes === 'string') {
      patch.task_notes = updates.taskNotes.trim().slice(0, 600);
    }

    const { error } = await supabase
      .from('recovery_tasks')
      .update(patch)
      .eq('id', taskId)
      .eq('user_id', user.id);
    if (error) throw new Error(error.message);
  } else {
    const db = getSqlite();
    const existing = db
      .prepare('SELECT * FROM recovery_tasks WHERE id = ? AND user_id = ?')
      .get(taskId, user.id) as Record<string, unknown> | undefined;
    if (!existing) throw new Error('Recovery task not found.');

    const nextStatus = updates.status ?? String(existing.status);
    const nextCompletedAt =
      updates.status === 'COMPLETED'
        ? nowIso
        : updates.status === 'PENDING'
          ? null
          : (existing.completed_at as string | null);
    const nextTitle =
      typeof updates.taskTitle === 'string'
        ? updates.taskTitle.trim().slice(0, 160)
        : String(existing.task_title);
    const nextNotes =
      typeof updates.taskNotes === 'string'
        ? updates.taskNotes.trim().slice(0, 600)
        : String(existing.task_notes ?? '');

    db.prepare(
      `UPDATE recovery_tasks
       SET status = ?, completed_at = ?, task_title = ?, task_notes = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`
    ).run(nextStatus, nextCompletedAt, nextTitle, nextNotes, nowIso, taskId, user.id);
  }

  return getBootstrapData(user, accessToken);
}

export async function updateUserSettings(
  user: UserProfile,
  accessToken: string,
  updates: {
    fullName?: string;
    dailyTargetMinutes?: number;
    recoverySessionMinutes?: number;
    theme?: ThemeMode;
    weeklyEmailEnabled?: boolean;
    weeklyEmailDay?: number;
  }
): Promise<BootstrapPayload> {
  const nextProfile: UserProfile = {
    ...user,
    fullName:
      typeof updates.fullName === 'string'
        ? updates.fullName.trim().slice(0, 80)
        : user.fullName,
    dailyTargetMinutes:
      typeof updates.dailyTargetMinutes === 'number'
        ? Math.min(960, Math.max(60, Math.round(updates.dailyTargetMinutes)))
        : user.dailyTargetMinutes,
    recoverySessionMinutes:
      typeof updates.recoverySessionMinutes === 'number'
        ? Math.min(180, Math.max(15, Math.round(updates.recoverySessionMinutes)))
        : user.recoverySessionMinutes,
    theme: updates.theme === 'light' ? 'light' : updates.theme === 'dark' ? 'dark' : user.theme,
    weeklyEmailEnabled:
      typeof updates.weeklyEmailEnabled === 'boolean'
        ? updates.weeklyEmailEnabled
        : user.weeklyEmailEnabled,
    weeklyEmailDay:
      typeof updates.weeklyEmailDay === 'number'
        ? Math.min(6, Math.max(0, Math.round(updates.weeklyEmailDay)))
        : user.weeklyEmailDay,
  };

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAuthed(accessToken);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: nextProfile.fullName,
        daily_target_minutes: nextProfile.dailyTargetMinutes,
        recovery_session_minutes: nextProfile.recoverySessionMinutes,
        theme: nextProfile.theme,
        weekly_email_enabled: nextProfile.weeklyEmailEnabled,
        weekly_email_day: nextProfile.weeklyEmailDay,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    if (error) throw new Error(error.message);
  } else {
    const db = getSqlite();
    db.prepare(
      `UPDATE users
       SET full_name = ?, daily_target_minutes = ?, recovery_session_minutes = ?,
           theme = ?, weekly_email_enabled = ?, weekly_email_day = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      nextProfile.fullName,
      nextProfile.dailyTargetMinutes,
      nextProfile.recoverySessionMinutes,
      nextProfile.theme,
      nextProfile.weeklyEmailEnabled ? 1 : 0,
      nextProfile.weeklyEmailDay,
      new Date().toISOString(),
      user.id
    );
  }

  // If daily target or recovery session length changed, resync recorded days cleanly
  if (
    nextProfile.dailyTargetMinutes !== user.dailyTargetMinutes ||
    nextProfile.recoverySessionMinutes !== user.recoverySessionMinutes
  ) {
    const boot = await getBootstrapData(nextProfile, accessToken);
    const uniqueDates = Array.from(new Set(boot.activities.map((a) => a.recordDate)));
    for (const dateStr of uniqueDates) {
      await recalculateDayAndAccountability(nextProfile, accessToken, dateStr);
    }
  }

  return getBootstrapData(nextProfile, accessToken);
}

export async function recordWeeklyEmailLog(
  user: UserProfile,
  accessToken: string,
  entry: Omit<WeeklyEmailLog, 'id' | 'userId' | 'sentAt'>
): Promise<WeeklyEmailLog> {
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();

  if (isSupabaseConfigured) {
    const supabase = createSupabaseAuthed(accessToken);
    const { data, error } = await supabase
      .from('weekly_email_logs')
      .insert({
        user_id: user.id,
        week_start: entry.weekStart,
        week_end: entry.weekEnd,
        recipient_email: entry.recipientEmail,
        subject: entry.subject,
        summary_json: entry.summary,
        delivery_status: entry.deliveryStatus,
        sent_at: nowIso,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return {
      id: String(data.id),
      userId: user.id,
      weekStart: entry.weekStart,
      weekEnd: entry.weekEnd,
      recipientEmail: entry.recipientEmail,
      subject: entry.subject,
      deliveryStatus: entry.deliveryStatus,
      summary: entry.summary,
      htmlPreview: entry.htmlPreview,
      sentAt: String(data.sent_at ?? nowIso),
    };
  }

  const db = getSqlite();
  db.prepare(
    `INSERT INTO weekly_email_logs (
      id, user_id, week_start, week_end, recipient_email, subject,
      summary_json, html_preview, delivery_status, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    user.id,
    entry.weekStart,
    entry.weekEnd,
    entry.recipientEmail,
    entry.subject,
    JSON.stringify(entry.summary),
    entry.htmlPreview ?? '',
    entry.deliveryStatus,
    nowIso
  );

  return {
    id,
    userId: user.id,
    weekStart: entry.weekStart,
    weekEnd: entry.weekEnd,
    recipientEmail: entry.recipientEmail,
    subject: entry.subject,
    deliveryStatus: entry.deliveryStatus,
    summary: entry.summary,
    htmlPreview: entry.htmlPreview,
    sentAt: nowIso,
  };
}

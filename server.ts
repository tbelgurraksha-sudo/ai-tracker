import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import {
  createActivity,
  deleteActivity,
  getBootstrapData,
  loginUser,
  registerUser,
  resolveUserFromToken,
  updateActivity,
  updateRecoveryTask,
  updateUserSettings,
} from './server/db.ts';
import {
  buildWeeklyDigestEmail,
  dispatchWeeklyEmailReport,
} from './server/email.ts';
import {
  formatLocalDate,
  getWeekBoundsMondayToSunday,
} from './src/lib/discipline.ts';
import {
  ACTIVITY_CATEGORIES,
  type ActivityCategory,
  type UserProfile,
} from './src/types/discipline.ts';

interface AuthedRequest extends Request {
  user?: UserProfile;
  accessToken?: string;
}

const COOKIE_NAME = 'd90_session';
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${60 * 60 * 24 * 14}`,
  ];

  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'Max-Age=0'];
  if (isHttps) {
    parts.push('SameSite=None', 'Secure', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function verifyMutationCsrf(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (req.headers.authorization?.startsWith('Bearer ')) return true;
  if (req.headers['x-requested-with'] === 'discipline90') return true;
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!verifyMutationCsrf(req)) {
    res.status(403).json({ error: 'Forbidden: Missing request verification header.' });
    return;
  }

  let token = '';
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    token = cookies[COOKIE_NAME] || '';
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  const user = await resolveUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
    return;
  }

  req.user = user;
  req.accessToken = token;
  next();
}

function getMaxAllowedDateStr(): string {
  // Server UTC + 14h allows any valid local user timezone today without permitting future dates
  const maxLocal = new Date(Date.now() + 14 * 60 * 60 * 1000);
  return maxLocal.toISOString().slice(0, 10);
}

function validateRecordDate(recordDate: unknown, clientToday?: unknown): string {
  if (typeof recordDate !== 'string' || !DATE_REGEX.test(recordDate)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.');
  }
  const parsed = new Date(`${recordDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== recordDate) {
    throw new Error('Invalid calendar date.');
  }
  if (typeof clientToday === 'string' && DATE_REGEX.test(clientToday)) {
    if (recordDate > clientToday) {
      throw new Error('Future dates cannot be recorded.');
    }
  }
  if (recordDate > getMaxAllowedDateStr()) {
    throw new Error('Future dates cannot be recorded.');
  }
  return recordDate;
}

async function startServer(): Promise<void> {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Auth routes
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { email, password, fullName } = req.body ?? {};
      if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        res.status(400).json({ error: 'Please enter a valid email address.' });
        return;
      }
      if (typeof password !== 'string' || password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters long.' });
        return;
      }

      const session = await registerUser({
        email,
        password,
        fullName: typeof fullName === 'string' ? fullName : '',
      });

      setSessionCookie(req, res, session.accessToken);
      const payload = await getBootstrapData(session.user, session.accessToken);
      res.status(201).json({ ...payload, accessToken: session.accessToken });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Registration failed.';
      res.status(400).json({ error: message });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const session = await loginUser({ email, password });
      setSessionCookie(req, res, session.accessToken);
      const payload = await getBootstrapData(session.user, session.accessToken);
      res.json({ ...payload, accessToken: session.accessToken });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed.';
      res.status(401).json({ error: message });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const payload = await getBootstrapData(req.user!, req.accessToken!);
      res.json({ ...payload, accessToken: req.accessToken });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load profile.';
      res.status(500).json({ error: message });
    }
  });

  // Bootstrap + optional automated weekly email check
  app.get('/api/bootstrap', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const clientToday =
        typeof req.query.today === 'string' && DATE_REGEX.test(req.query.today)
          ? req.query.today
          : formatLocalDate(new Date());

      let payload = await getBootstrapData(req.user!, req.accessToken!);

      // Automated weekly email trigger on user's scheduled day (default Sunday = 0)
      if (payload.user.weeklyEmailEnabled) {
        const dt = new Date(`${clientToday}T12:00:00`);
        if (dt.getDay() === payload.user.weeklyEmailDay) {
          const { start } = getWeekBoundsMondayToSunday(clientToday);
          const alreadyLogged = payload.weeklyEmailLogs.some(
            (log) => log.weekStart === start
          );
          if (!alreadyLogged) {
            try {
              await dispatchWeeklyEmailReport(payload, req.accessToken!, clientToday);
              payload = await getBootstrapData(req.user!, req.accessToken!);
            } catch (emailErr) {
              console.error('Automated weekly report check failed:', emailErr);
            }
          }
        }
      }

      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load data.';
      res.status(500).json({ error: message });
    }
  });

  // Activities CRUD
  app.post('/api/activities', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const {
        recordDate,
        title,
        category,
        startTime,
        endTime,
        description,
        clientToday,
      } = req.body ?? {};

      const validDate = validateRecordDate(recordDate, clientToday);
      if (typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Activity name is required.' });
        return;
      }
      if (!ACTIVITY_CATEGORIES.includes(category as ActivityCategory)) {
        res.status(400).json({ error: 'Invalid activity category.' });
        return;
      }
      if (typeof startTime !== 'string' || !TIME_REGEX.test(startTime)) {
        res.status(400).json({ error: 'Invalid start time.' });
        return;
      }
      if (typeof endTime !== 'string' || !TIME_REGEX.test(endTime)) {
        res.status(400).json({ error: 'Invalid end time.' });
        return;
      }

      const payload = await createActivity(req.user!, req.accessToken!, {
        recordDate: validDate,
        title,
        category: category as ActivityCategory,
        startTime,
        endTime,
        description: typeof description === 'string' ? description : '',
      });
      res.status(201).json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create activity.';
      res.status(400).json({ error: message });
    }
  });

  app.put('/api/activities/:id', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const {
        recordDate,
        title,
        category,
        startTime,
        endTime,
        description,
        clientToday,
      } = req.body ?? {};

      const validDate = validateRecordDate(recordDate, clientToday);
      if (typeof title !== 'string' || !title.trim()) {
        res.status(400).json({ error: 'Activity name is required.' });
        return;
      }
      if (!ACTIVITY_CATEGORIES.includes(category as ActivityCategory)) {
        res.status(400).json({ error: 'Invalid activity category.' });
        return;
      }
      if (typeof startTime !== 'string' || !TIME_REGEX.test(startTime)) {
        res.status(400).json({ error: 'Invalid start time.' });
        return;
      }
      if (typeof endTime !== 'string' || !TIME_REGEX.test(endTime)) {
        res.status(400).json({ error: 'Invalid end time.' });
        return;
      }

      const payload = await updateActivity(
        req.user!,
        req.accessToken!,
        String(req.params.id),
        {
          recordDate: validDate,
          title,
          category: category as ActivityCategory,
          startTime,
          endTime,
          description: typeof description === 'string' ? description : '',
        }
      );
      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update activity.';
      res.status(400).json({ error: message });
    }
  });

  app.delete('/api/activities/:id', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const payload = await deleteActivity(
        req.user!,
        req.accessToken!,
        String(req.params.id)
      );
      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete activity.';
      res.status(400).json({ error: message });
    }
  });

  // Weekend Accountability Recovery Tasks
  app.patch('/api/recovery/:id', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const { status, taskTitle, taskNotes } = req.body ?? {};
      if (status !== undefined && status !== 'PENDING' && status !== 'COMPLETED') {
        res.status(400).json({ error: 'Invalid recovery status.' });
        return;
      }

      const payload = await updateRecoveryTask(
        req.user!,
        req.accessToken!,
        String(req.params.id),
        {
          status,
          taskTitle: typeof taskTitle === 'string' ? taskTitle : undefined,
          taskNotes: typeof taskNotes === 'string' ? taskNotes : undefined,
        }
      );
      res.json(payload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update recovery task.';
      res.status(400).json({ error: message });
    }
  });

  // User Settings
  app.patch('/api/settings', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const {
        fullName,
        dailyTargetMinutes,
        recoverySessionMinutes,
        theme,
        weeklyEmailEnabled,
        weeklyEmailDay,
      } = req.body ?? {};

      const payload = await updateUserSettings(req.user!, req.accessToken!, {
        fullName: typeof fullName === 'string' ? fullName : undefined,
        dailyTargetMinutes:
          typeof dailyTargetMinutes === 'number' ? dailyTargetMinutes : undefined,
        recoverySessionMinutes:
          typeof recoverySessionMinutes === 'number' ? recoverySessionMinutes : undefined,
        theme: theme === 'light' || theme === 'dark' ? theme : undefined,
        weeklyEmailEnabled:
          typeof weeklyEmailEnabled === 'boolean' ? weeklyEmailEnabled : undefined,
        weeklyEmailDay:
          typeof weeklyEmailDay === 'number' ? weeklyEmailDay : undefined,
      });
      res.json(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save settings.';
      res.status(400).json({ error: message });
    }
  });

  // Weekly Email Digest Preview & Dispatch
  app.get('/api/reports/weekly-email/preview', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const refDate =
        typeof req.query.date === 'string' && DATE_REGEX.test(req.query.date)
          ? req.query.date
          : formatLocalDate(new Date());
      const payload = await getBootstrapData(req.user!, req.accessToken!);
      const digest = buildWeeklyDigestEmail(payload, refDate);
      res.json(digest);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to preview weekly report.';
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/reports/weekly-email/send', requireAuth, async (req: AuthedRequest, res) => {
    try {
      const refDate =
        typeof req.body?.date === 'string' && DATE_REGEX.test(req.body.date)
          ? req.body.date
          : formatLocalDate(new Date());
      const payload = await getBootstrapData(req.user!, req.accessToken!);
      const log = await dispatchWeeklyEmailReport(payload, req.accessToken!, refDate);
      const updated = await getBootstrapData(req.user!, req.accessToken!);
      res.json({ log, bootstrap: updated });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to send weekly report.';
      res.status(500).json({ error: message });
    }
  });

  // Read-only Supabase SQL schema reference
  app.get('/api/supabase/schema', requireAuth, (_req, res) => {
    try {
      const schemaPath = path.resolve(process.cwd(), 'supabase', 'schema.sql');
      const sql = fs.readFileSync(schemaPath, 'utf8');
      res.json({ sql });
    } catch {
      res.status(404).json({ error: 'Schema file not found.' });
    }
  });

  // Vite dev middleware or production static build
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  app.listen(port, '0.0.0.0', () => {
    console.log(`DISCIPLINE 90 server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});

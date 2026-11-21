-- DISCIPLINE 90 — Supabase PostgreSQL Schema & Row Level Security (RLS)
-- Run this SQL in your Supabase Project -> SQL Editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. User Profiles & Settings
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  daily_target_minutes INTEGER NOT NULL DEFAULT 360 CHECK (daily_target_minutes BETWEEN 60 AND 960),
  recovery_session_minutes INTEGER NOT NULL DEFAULT 30 CHECK (recovery_session_minutes BETWEEN 15 AND 180),
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light')),
  weekly_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  weekly_email_day INTEGER NOT NULL DEFAULT 0 CHECK (weekly_email_day BETWEEN 0 AND 6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Daily Summary Records (PASS / FAIL per recorded date)
CREATE TABLE IF NOT EXISTS public.daily_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  total_minutes INTEGER NOT NULL DEFAULT 0 CHECK (total_minutes >= 0 AND total_minutes <= 1440),
  target_minutes INTEGER NOT NULL DEFAULT 360 CHECK (target_minutes >= 60),
  status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, record_date)
);

-- 3. Individual Productive Activities
CREATE TABLE IF NOT EXISTS public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_record_id UUID REFERENCES public.daily_records(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN (
      'Coding',
      'DSA',
      'College Studies',
      'Agentic AI',
      'Projects',
      'Government Exam Preparation',
      'Communication Skills',
      'Other'
    )
  ),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Weekend Accountability / Catch-Up Recovery Tasks (1 per failed day, never duplicated)
CREATE TABLE IF NOT EXISTS public.recovery_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_date DATE NOT NULL,
  missed_minutes INTEGER NOT NULL CHECK (missed_minutes > 0),
  recovery_minutes INTEGER NOT NULL DEFAULT 30 CHECK (recovery_minutes >= 15),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),
  task_title TEXT NOT NULL,
  task_notes TEXT NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, failed_date)
);

-- 5. Automated Weekly Email Report Dispatch Logs
CREATE TABLE IF NOT EXISTS public.weekly_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_status TEXT NOT NULL DEFAULT 'GENERATED',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast calendar, analytics, and recovery queries
CREATE INDEX IF NOT EXISTS idx_daily_records_user_date ON public.daily_records(user_id, record_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_user_date ON public.activities(user_id, record_date DESC);
CREATE INDEX IF NOT EXISTS idx_recovery_tasks_user_status ON public.recovery_tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_weekly_email_logs_user_sent ON public.weekly_email_logs(user_id, sent_at DESC);

-- Enable Row Level Security (RLS) on every table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recovery_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weekly_email_logs ENABLE ROW LEVEL SECURITY;

-- Strict Per-User Policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users manage own daily records" ON public.daily_records
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own activities" ON public.activities
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own recovery tasks" ON public.recovery_tasks
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users manage own weekly email logs" ON public.weekly_email_logs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-create profile when a new Supabase Auth user registers
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

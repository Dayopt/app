-- ============================================================
-- Dayopt ベースラインマイグレーション
-- ============================================================
-- 117マイグレーションを圧縮した現在のスキーマ定義
-- 生成日: 2026-03-17
--
-- 既存の本番/stagingデータベースには `supabase migration repair --status applied` でマーク
-- 新規環境では `supabase db reset` でこのファイルからスキーマを構築
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- ============================================================
-- Trigger Functions
-- ============================================================

-- 汎用 updated_at トリガー関数
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- auth.users 作成時にプロフィールを自動生成
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_username TEXT;
  final_username TEXT;
  suffix INT := 0;
BEGIN
  -- メールアドレスの@前をベースに
  base_username := split_part(NEW.email, '@', 1);
  -- 英数字とアンダースコアのみ残す
  base_username := regexp_replace(base_username, '[^a-zA-Z0-9_]', '', 'g');
  IF base_username = '' THEN
    base_username := 'user';
  END IF;

  final_username := base_username;
  -- 重複チェック
  LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE username = final_username);
    suffix := suffix + 1;
    final_username := base_username || suffix::TEXT;
  END LOOP;

  INSERT INTO public.profiles (id, email, full_name, avatar_url, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'avatar_url', ''),
    final_username
  );
  RETURN NEW;
END;
$$;

-- auth.users 作成時に通知設定をデフォルト作成
CREATE OR REPLACE FUNCTION public.create_default_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_preferences (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- entries の reminder_at を自動計算
CREATE OR REPLACE FUNCTION public.compute_reminder_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reminder_minutes IS NOT NULL AND NEW.start_time IS NOT NULL THEN
    NEW.reminder_at := NEW.start_time - (NEW.reminder_minutes || ' minutes')::interval;
    NEW.reminder_sent := false;
  ELSE
    NEW.reminder_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================
-- Tables
-- ============================================================

-- プロフィール
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  onboarding_completed_at TIMESTAMPTZ,
  CONSTRAINT email_unique UNIQUE (email),
  CONSTRAINT username_unique UNIQUE (username)
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- エントリ（プラン + 記録 統合テーブル）
CREATE TABLE public.entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  recurrence_type TEXT NOT NULL DEFAULT 'none',
  recurrence_end_date DATE,
  recurrence_rule TEXT,
  reminder_minutes INTEGER,
  reminder_at TIMESTAMPTZ,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMPTZ,
  origin TEXT NOT NULL DEFAULT 'planned',
  fulfillment_score INTEGER,
  duration_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entries_scheduled_time_order_check CHECK (start_time IS NULL OR end_time IS NULL OR end_time >= start_time),
  CONSTRAINT plans_origin_check CHECK (origin IN ('planned', 'unplanned')),
  CONSTRAINT plans_fulfillment_score_check CHECK (fulfillment_score IS NULL OR (fulfillment_score >= 1 AND fulfillment_score <= 3)),
  CONSTRAINT plans_recurrence_type_check CHECK (recurrence_type IN ('none', 'daily', 'weekly', 'monthly', 'yearly', 'weekdays'))
);

CREATE TRIGGER trigger_update_plans_updated_at
  BEFORE UPDATE ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER trg_compute_reminder_at
  BEFORE INSERT OR UPDATE OF reminder_minutes, start_time ON public.entries
  FOR EACH ROW EXECUTE FUNCTION public.compute_reminder_at();

-- タグ
CREATE TABLE public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tags_user_id_name_unique UNIQUE (user_id, name),
  CONSTRAINT tags_color_valid_name CHECK (color IS NULL OR color IN ('red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'violet', 'pink', 'gray'))
);

-- エントリ-タグ関連（1エントリ1タグ制約）
CREATE TABLE public.entry_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT entry_tags_entry_id_unique UNIQUE (entry_id),
  CONSTRAINT plan_tags_user_plan_tag_unique UNIQUE (user_id, entry_id, tag_id)
);

-- エントリ操作履歴
CREATE TABLE public.entry_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  field_name TEXT,
  old_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}',
  schema_version SMALLINT NOT NULL DEFAULT 2,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entry_activities_action_type_check CHECK (action_type IN (
    'created', 'updated', 'status_changed', 'title_changed', 'description_changed',
    'time_changed', 'tag_added', 'tag_removed', 'recurrence_changed',
    'reminder_changed', 'fulfillment_changed', 'deleted'
  ))
);

-- 繰り返しエントリのインスタンス（例外管理）
CREATE TABLE public.entry_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES public.entries(id) ON DELETE CASCADE,
  instance_date DATE NOT NULL,
  instance_start TIMESTAMPTZ,
  instance_end TIMESTAMPTZ,
  exception_type TEXT,
  original_date DATE,
  title TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entry_instances_entry_id_instance_date_key UNIQUE (entry_id, instance_date),
  CONSTRAINT entry_instances_exception_type_check CHECK (exception_type IS NULL OR exception_type IN ('modified', 'cancelled', 'moved'))
);

CREATE TRIGGER trigger_update_plan_instances_updated_at
  BEFORE UPDATE ON public.entry_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- 通知
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
  reflection_id UUID,  -- FK追加後に定義（reflections テーブル後）
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notifications_type_check CHECK (type IN (
    'reminder', 'overdue', 'ai_insight', 'weekly_report', 'burnout_warning', 'energy_insight'
  ))
);

-- 通知設定
CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enable_browser_notifications BOOLEAN NOT NULL DEFAULT false,
  enable_email_notifications BOOLEAN NOT NULL DEFAULT false,
  enable_push_notifications BOOLEAN NOT NULL DEFAULT false,
  default_reminder_minutes INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT notification_preferences_reminder_minutes_check CHECK (default_reminder_minutes IS NULL OR default_reminder_minutes > 0)
);

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ユーザー設定
CREATE TABLE public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  show_utc_offset BOOLEAN NOT NULL DEFAULT true,
  time_format TEXT NOT NULL DEFAULT '24h',
  week_starts_on SMALLINT NOT NULL DEFAULT 1,
  show_weekends BOOLEAN NOT NULL DEFAULT true,
  show_week_numbers BOOLEAN NOT NULL DEFAULT false,
  default_duration INTEGER NOT NULL DEFAULT 60,
  snap_interval SMALLINT NOT NULL DEFAULT 15,
  business_hours_start SMALLINT NOT NULL DEFAULT 9,
  business_hours_end SMALLINT NOT NULL DEFAULT 18,
  show_declined_events BOOLEAN NOT NULL DEFAULT false,
  chronotype_enabled BOOLEAN NOT NULL DEFAULT true,
  chronotype_type TEXT NOT NULL DEFAULT 'bear',
  chronotype_custom_zones JSONB,
  chronotype_display_mode TEXT NOT NULL DEFAULT 'border',
  chronotype_opacity SMALLINT NOT NULL DEFAULT 90,
  plan_record_mode TEXT NOT NULL DEFAULT 'both',
  theme TEXT NOT NULL DEFAULT 'system',
  color_scheme TEXT NOT NULL DEFAULT 'blue',
  date_format TEXT NOT NULL DEFAULT 'yyyy/MM/dd',
  personalization_values JSONB DEFAULT '{}',
  ai_communication_style TEXT DEFAULT 'coach',
  ai_custom_style_prompt TEXT DEFAULT '',
  personalization_ranked_values JSONB DEFAULT '[]',
  default_view TEXT NOT NULL DEFAULT 'week',
  hour_height_density TEXT NOT NULL DEFAULT 'default',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_settings_time_format_check CHECK (time_format IN ('24h', '12h')),
  CONSTRAINT user_settings_week_starts_on_check CHECK (week_starts_on IN (0, 1, 6)),
  CONSTRAINT user_settings_snap_interval_check CHECK (snap_interval IN (5, 10, 15, 30)),
  CONSTRAINT user_settings_business_hours_start_check CHECK (business_hours_start >= 0 AND business_hours_start <= 23),
  CONSTRAINT user_settings_business_hours_end_check CHECK (business_hours_end >= 0 AND business_hours_end <= 23),
  CONSTRAINT user_settings_chronotype_type_check CHECK (chronotype_type IN ('bear', 'lion', 'wolf', 'dolphin', 'custom')),
  CONSTRAINT user_settings_chronotype_display_mode_check CHECK (chronotype_display_mode IN ('border', 'background', 'both')),
  CONSTRAINT user_settings_chronotype_opacity_check CHECK (chronotype_opacity >= 0 AND chronotype_opacity <= 100),
  CONSTRAINT user_settings_plan_record_mode_check CHECK (plan_record_mode IN ('plan', 'record', 'both')),
  CONSTRAINT user_settings_theme_check CHECK (theme IN ('light', 'dark', 'system')),
  CONSTRAINT user_settings_color_scheme_check CHECK (color_scheme IN ('blue', 'green', 'purple', 'orange', 'red')),
  CONSTRAINT user_settings_date_format_check CHECK (date_format IN ('yyyy/MM/dd', 'yyyy-MM-dd', 'MM/dd/yyyy', 'dd/MM/yyyy')),
  CONSTRAINT user_settings_ai_communication_style_check CHECK (ai_communication_style IS NULL OR ai_communication_style IN ('coach', 'analyst', 'friendly', 'custom'))
);

CREATE TRIGGER trigger_update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- AI振り返りレポート
CREATE TABLE public.reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  title TEXT NOT NULL,
  activities JSONB NOT NULL DEFAULT '[]',
  insights TEXT NOT NULL DEFAULT '',
  question TEXT NOT NULL DEFAULT '',
  model_used TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  user_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reflections_user_period_unique UNIQUE (user_id, period_type, period_start),
  CONSTRAINT reflections_period_type_check CHECK (period_type IN ('daily', 'weekly', 'monthly'))
);

CREATE TRIGGER set_reflections_updated_at
  BEFORE UPDATE ON public.reflections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- notifications.reflection_id FK（reflections テーブル作成後に追加）
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_reflection_id_fkey
  FOREIGN KEY (reflection_id) REFERENCES public.reflections(id) ON DELETE SET NULL;

-- AI使用量トラッキング
CREATE TABLE public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_user_month_unique UNIQUE (user_id, month)
);

CREATE TRIGGER update_ai_usage_updated_at
  BEFORE UPDATE ON public.ai_usage
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- チャット会話
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  messages JSONB NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ログイン試行記録
CREATE TABLE public.login_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  attempt_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_successful BOOLEAN NOT NULL DEFAULT false,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 認証監査ログ
CREATE TABLE public.auth_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  geo_country TEXT,
  geo_city TEXT
);

-- MFAリカバリーコード
CREATE TABLE public.mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

-- profiles
CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);
CREATE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles (username);
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles (id);

-- entries
CREATE INDEX IF NOT EXISTS idx_plans_user_id ON public.entries (user_id);
CREATE INDEX IF NOT EXISTS idx_plans_start_time ON public.entries (start_time);
CREATE INDEX IF NOT EXISTS idx_plans_recurrence_rule ON public.entries (recurrence_rule) WHERE recurrence_rule IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_plans_reminder_at_sent ON public.entries (reminder_at) WHERE reminder_at IS NOT NULL AND reminder_sent = false;
CREATE INDEX IF NOT EXISTS idx_plans_user_start_time ON public.entries (user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_entries_reviewed_at ON public.entries (reviewed_at) WHERE reviewed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entries_origin ON public.entries (origin);
CREATE INDEX IF NOT EXISTS idx_entries_fulfillment_score ON public.entries (fulfillment_score) WHERE fulfillment_score IS NOT NULL;

-- tags
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags (user_id);
CREATE INDEX IF NOT EXISTS idx_tags_name ON public.tags (name);
CREATE INDEX IF NOT EXISTS idx_tags_is_active ON public.tags (is_active);
CREATE INDEX IF NOT EXISTS idx_tags_user_id_name ON public.tags (user_id, name);

-- entry_tags
CREATE INDEX IF NOT EXISTS idx_plan_tags_plan_id ON public.entry_tags (entry_id);
CREATE INDEX IF NOT EXISTS idx_plan_tags_tag_id ON public.entry_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_record_tags_user_id ON public.entry_tags (user_id);

-- entry_activities
CREATE INDEX IF NOT EXISTS idx_plan_activities_plan_id ON public.entry_activities (entry_id);
CREATE INDEX IF NOT EXISTS idx_plan_activities_user_id ON public.entry_activities (user_id);
CREATE INDEX IF NOT EXISTS idx_plan_activities_created_at ON public.entry_activities (created_at);
CREATE INDEX IF NOT EXISTS idx_plan_activities_action_type ON public.entry_activities (action_type);

-- entry_instances
CREATE INDEX IF NOT EXISTS idx_plan_instances_plan_id ON public.entry_instances (entry_id);
CREATE INDEX IF NOT EXISTS idx_plan_instances_instance_date ON public.entry_instances (instance_date);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_plan_id ON public.notifications (entry_id);
CREATE INDEX IF NOT EXISTS idx_notifications_reflection_id ON public.notifications (reflection_id) WHERE reflection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications (type);

-- reflections
CREATE INDEX IF NOT EXISTS idx_reflections_user_period ON public.reflections (user_id, period_type, period_start DESC);

-- ai_usage
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_month ON public.ai_usage (user_id, month);

-- chat_conversations
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id ON public.chat_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON public.chat_conversations (user_id, updated_at DESC);

-- login_attempts
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON public.login_attempts (email);
CREATE INDEX IF NOT EXISTS idx_login_attempts_attempt_time ON public.login_attempts (attempt_time);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time ON public.login_attempts (email, attempt_time);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_address ON public.login_attempts (ip_address);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON public.login_attempts (ip_address, attempt_time);

-- auth_audit_logs
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_id ON public.auth_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_event_type ON public.auth_audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_created_at ON public.auth_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_auth_audit_logs_user_created ON public.auth_audit_logs (user_id, created_at);

-- mfa_recovery_codes
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_id ON public.mfa_recovery_codes (user_id);
CREATE INDEX IF NOT EXISTS idx_mfa_recovery_codes_user_unused ON public.mfa_recovery_codes (user_id) WHERE used_at IS NULL;

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reflections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "Service role can insert profiles" ON public.profiles
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "Users can delete own profile" ON public.profiles
  FOR DELETE TO authenticated USING ((select auth.uid()) = id);
CREATE POLICY "Service role has full access to profiles" ON public.profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- entries
CREATE POLICY "Users can view own plans" ON public.entries
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own plans" ON public.entries
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own plans" ON public.entries
  FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own plans" ON public.entries
  FOR DELETE USING ((select auth.uid()) = user_id);

-- tags
CREATE POLICY "Users can view own tags" ON public.tags
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own tags" ON public.tags
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own tags" ON public.tags
  FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own tags" ON public.tags
  FOR DELETE USING ((select auth.uid()) = user_id);

-- entry_tags
CREATE POLICY "Users can view own plan_tags" ON public.entry_tags
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own plan_tags" ON public.entry_tags
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own plan_tags" ON public.entry_tags
  FOR DELETE USING ((select auth.uid()) = user_id);

-- entry_activities（entries経由のRLS）
CREATE POLICY "Users can view activities of their own plans" ON public.entry_activities
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.entries WHERE entries.id = entry_activities.entry_id AND entries.user_id = (select auth.uid()))
    OR entry_activities.user_id = (select auth.uid())
  );
CREATE POLICY "Users can create activities for their own plans" ON public.entry_activities
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.entries WHERE entries.id = entry_activities.entry_id AND entries.user_id = (select auth.uid()))
    AND entry_activities.user_id = (select auth.uid())
  );

-- entry_instances（entries経由のRLS）
CREATE POLICY "Users can view own plan instances" ON public.entry_instances
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.entries WHERE entries.id = entry_instances.entry_id AND entries.user_id = (select auth.uid()))
  );
CREATE POLICY "Users can insert own plan instances" ON public.entry_instances
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.entries WHERE entries.id = entry_instances.entry_id AND entries.user_id = (select auth.uid()))
  );
CREATE POLICY "Users can update own plan instances" ON public.entry_instances
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.entries WHERE entries.id = entry_instances.entry_id AND entries.user_id = (select auth.uid()))
  );
CREATE POLICY "Users can delete own plan instances" ON public.entry_instances
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.entries WHERE entries.id = entry_instances.entry_id AND entries.user_id = (select auth.uid()))
  );

-- notifications
CREATE POLICY "Users can view own notifications" ON public.notifications
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications
  FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own notifications" ON public.notifications
  FOR DELETE USING ((select auth.uid()) = user_id);
CREATE POLICY "System can create notifications" ON public.notifications
  FOR INSERT TO service_role WITH CHECK (true);

-- notification_preferences
CREATE POLICY "Users can view own notification preferences" ON public.notification_preferences
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own notification preferences" ON public.notification_preferences
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own notification preferences" ON public.notification_preferences
  FOR UPDATE USING ((select auth.uid()) = user_id);

-- user_settings
CREATE POLICY "Users can view own settings" ON public.user_settings
  FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own settings" ON public.user_settings
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own settings" ON public.user_settings
  FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own settings" ON public.user_settings
  FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);

-- reflections
CREATE POLICY "Users can view own reflections" ON public.reflections
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own reflections" ON public.reflections
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reflections" ON public.reflections
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reflections" ON public.reflections
  FOR DELETE USING (auth.uid() = user_id);

-- ai_usage
CREATE POLICY "Users can view own usage" ON public.ai_usage
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own usage" ON public.ai_usage
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own usage" ON public.ai_usage
  FOR UPDATE USING ((select auth.uid()) = user_id);

-- chat_conversations
CREATE POLICY "Users can view own chat_conversations" ON public.chat_conversations
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own chat_conversations" ON public.chat_conversations
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own chat_conversations" ON public.chat_conversations
  FOR UPDATE USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own chat_conversations" ON public.chat_conversations
  FOR DELETE USING ((select auth.uid()) = user_id);

-- login_attempts
CREATE POLICY "Service role has full access to login_attempts" ON public.login_attempts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role can insert login attempts" ON public.login_attempts
  FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Users can delete own login attempts" ON public.login_attempts
  FOR DELETE TO authenticated USING (
    email = (SELECT email FROM auth.users WHERE id = (select auth.uid()))
  );

-- auth_audit_logs
CREATE POLICY "Users can view own audit logs" ON public.auth_audit_logs
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Service role can insert audit logs" ON public.auth_audit_logs
  FOR INSERT TO service_role WITH CHECK (true);

-- mfa_recovery_codes
CREATE POLICY "Users can view own recovery codes" ON public.mfa_recovery_codes
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own recovery codes" ON public.mfa_recovery_codes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own recovery codes" ON public.mfa_recovery_codes
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ============================================================
-- Auth Triggers（auth.users へのトリガー）
-- ============================================================

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE TRIGGER on_auth_user_created_notification_preferences
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.create_default_notification_preferences();

-- ============================================================
-- RPC / Utility Functions
-- ============================================================

-- クリーンアップ: 古いログイン試行を削除（90日）
CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.login_attempts
  WHERE attempt_time < now() - interval '90 days';
END;
$$;

-- クリーンアップ: 古い認証監査ログを削除（365日）
CREATE OR REPLACE FUNCTION public.cleanup_old_auth_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.auth_audit_logs
  WHERE created_at < now() - interval '365 days';
END;
$$;

-- クリーンアップ: 既読の古い通知を削除（30日）
CREATE OR REPLACE FUNCTION public.delete_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.notifications
  WHERE is_read = true AND created_at < now() - interval '30 days';
END;
$$;

-- クリーンアップ: 古い操作履歴を削除（365日）
CREATE OR REPLACE FUNCTION public.cleanup_old_plan_activities()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.entry_activities
  WHERE created_at < now() - interval '365 days';
END;
$$;

-- AI使用量インクリメント
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id UUID, p_month TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.ai_usage (user_id, month, request_count)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET request_count = ai_usage.request_count + 1, updated_at = now();
END;
$$;

-- ログイン試行記録
CREATE OR REPLACE FUNCTION public.record_login_attempt(
  p_email TEXT,
  p_ip_address TEXT,
  p_is_successful BOOLEAN,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.login_attempts (email, ip_address, is_successful, user_agent)
  VALUES (p_email, p_ip_address, p_is_successful, p_user_agent)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- タグマージ
CREATE OR REPLACE FUNCTION public.merge_tags(
  p_user_id UUID,
  p_source_tag_id UUID,
  p_target_tag_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_migrated INTEGER := 0;
BEGIN
  -- entry_tagsを移行（重複がある場合はソース側を削除）
  WITH to_migrate AS (
    SELECT et.id, et.entry_id
    FROM public.entry_tags et
    WHERE et.tag_id = p_source_tag_id AND et.user_id = p_user_id
  ),
  existing AS (
    SELECT entry_id FROM public.entry_tags WHERE tag_id = p_target_tag_id AND user_id = p_user_id
  ),
  deleted AS (
    DELETE FROM public.entry_tags
    WHERE id IN (SELECT id FROM to_migrate WHERE entry_id IN (SELECT entry_id FROM existing))
  )
  UPDATE public.entry_tags
  SET tag_id = p_target_tag_id
  WHERE id IN (SELECT id FROM to_migrate WHERE entry_id NOT IN (SELECT entry_id FROM existing));

  GET DIAGNOSTICS v_migrated = ROW_COUNT;

  -- ソースタグを非アクティブ化
  UPDATE public.tags SET is_active = false WHERE id = p_source_tag_id AND user_id = p_user_id;

  RETURN json_build_object('migrated', v_migrated);
END;
$$;
GRANT EXECUTE ON FUNCTION public.merge_tags(UUID, UUID, UUID) TO authenticated;

-- MFAリカバリーコード使用
CREATE OR REPLACE FUNCTION public.use_recovery_code(p_user_id UUID, p_code_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id UUID;
BEGIN
  SELECT id INTO v_code_id
  FROM public.mfa_recovery_codes
  WHERE user_id = p_user_id AND code_hash = p_code_hash AND used_at IS NULL;

  IF v_code_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.mfa_recovery_codes SET used_at = now() WHERE id = v_code_id;
  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.use_recovery_code(UUID, TEXT) TO authenticated;

-- MFA未使用リカバリーコード数
CREATE OR REPLACE FUNCTION public.count_unused_recovery_codes(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM public.mfa_recovery_codes
  WHERE user_id = p_user_id AND used_at IS NULL;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.count_unused_recovery_codes(UUID) TO authenticated;

-- ============================================================
-- Statistics Functions
-- ============================================================

-- プランサマリー
CREATE OR REPLACE FUNCTION public.get_plan_summary(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_hours DOUBLE PRECISION;
  v_monthly_hours DOUBLE PRECISION;
  v_weekly_hours DOUBLE PRECISION;
  v_completed_count BIGINT;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN duration_minutes IS NOT NULL THEN duration_minutes / 60.0
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE 0
    END
  ), 0) INTO v_total_hours
  FROM public.entries WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(
    CASE
      WHEN duration_minutes IS NOT NULL THEN duration_minutes / 60.0
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE 0
    END
  ), 0) INTO v_monthly_hours
  FROM public.entries WHERE user_id = p_user_id AND start_time >= date_trunc('month', now());

  SELECT COALESCE(SUM(
    CASE
      WHEN duration_minutes IS NOT NULL THEN duration_minutes / 60.0
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE 0
    END
  ), 0) INTO v_weekly_hours
  FROM public.entries WHERE user_id = p_user_id AND start_time >= date_trunc('week', now());

  SELECT COUNT(*) INTO v_completed_count
  FROM public.entries WHERE user_id = p_user_id AND reviewed_at IS NOT NULL;

  RETURN json_build_object(
    'total_hours', ROUND(v_total_hours::numeric, 1),
    'monthly_hours', ROUND(v_monthly_hours::numeric, 1),
    'weekly_hours', ROUND(v_weekly_hours::numeric, 1),
    'completed_count', v_completed_count
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_plan_summary(UUID) TO authenticated;

-- アクティブ日取得
CREATE OR REPLACE FUNCTION public.get_active_dates(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE(active_date DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT (start_time AT TIME ZONE 'UTC')::DATE
  FROM public.entries
  WHERE user_id = p_user_id AND start_time >= p_since AND start_time IS NOT NULL
  ORDER BY 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_dates(UUID, TIMESTAMPTZ) TO authenticated;

-- 日別時間
CREATE OR REPLACE FUNCTION public.get_daily_hours(p_user_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE(date TEXT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char((e.start_time AT TIME ZONE 'UTC')::DATE, 'YYYY-MM-DD'),
    COALESCE(SUM(
      CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes / 60.0
        WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
        ELSE 0
      END
    ), 0)
  FROM public.entries e
  WHERE e.user_id = p_user_id AND e.start_time >= p_start AND e.start_time < p_end AND e.start_time IS NOT NULL
  GROUP BY (e.start_time AT TIME ZONE 'UTC')::DATE
  ORDER BY 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_daily_hours(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- 時間帯別分布
CREATE OR REPLACE FUNCTION public.get_hourly_distribution(p_user_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE(hour INT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT,
    COALESCE(SUM(
      CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes / 60.0
        WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
        ELSE 0
      END
    ), 0)
  FROM public.entries e
  WHERE e.user_id = p_user_id AND e.start_time >= p_start AND e.start_time < p_end AND e.start_time IS NOT NULL
  GROUP BY EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT
  ORDER BY 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_hourly_distribution(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- 曜日別分布
CREATE OR REPLACE FUNCTION public.get_dow_distribution(p_user_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE(dow INT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT,
    COALESCE(SUM(
      CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes / 60.0
        WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
        ELSE 0
      END
    ), 0)
  FROM public.entries e
  WHERE e.user_id = p_user_id AND e.start_time >= p_start AND e.start_time < p_end AND e.start_time IS NOT NULL
  GROUP BY EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT
  ORDER BY 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_dow_distribution(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- 月別時間
CREATE OR REPLACE FUNCTION public.get_monthly_hours(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE(month TEXT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(date_trunc('month', e.start_time AT TIME ZONE 'UTC'), 'YYYY-MM'),
    COALESCE(SUM(
      CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes / 60.0
        WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
        ELSE 0
      END
    ), 0)
  FROM public.entries e
  WHERE e.user_id = p_user_id AND e.start_time >= p_since AND e.start_time IS NOT NULL
  GROUP BY date_trunc('month', e.start_time AT TIME ZONE 'UTC')
  ORDER BY 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_monthly_hours(UUID, TIMESTAMPTZ) TO authenticated;

-- 合計時間
CREATE OR REPLACE FUNCTION public.get_total_time(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total DOUBLE PRECISION;
BEGIN
  SELECT COALESCE(SUM(
    CASE
      WHEN duration_minutes IS NOT NULL THEN duration_minutes / 60.0
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE 0
    END
  ), 0) INTO v_total
  FROM public.entries WHERE user_id = p_user_id;
  RETURN json_build_object('total_hours', ROUND(v_total::numeric, 1));
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_total_time(UUID) TO authenticated;

-- タグ統計
CREATE OR REPLACE FUNCTION public.get_tag_stats(p_user_id UUID)
RETURNS TABLE(tag_id UUID, entry_count BIGINT, last_used TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT et.tag_id, COUNT(*)::BIGINT, MAX(e.created_at)
  FROM public.entry_tags et
  JOIN public.entries e ON e.id = et.entry_id
  WHERE et.user_id = p_user_id
  GROUP BY et.tag_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_tag_stats(UUID) TO authenticated;

-- 週次振り返りデータ
CREATE OR REPLACE FUNCTION public.get_weekly_reflection_data(p_user_id UUID, p_week_start DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_entries BIGINT;
  v_total_minutes DOUBLE PRECISION;
  v_avg_fulfillment DOUBLE PRECISION;
  v_week_end DATE;
BEGIN
  v_week_end := p_week_start + 6;

  SELECT COUNT(*), COALESCE(SUM(
    CASE
      WHEN duration_minutes IS NOT NULL THEN duration_minutes
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 60.0
      ELSE 0
    END
  ), 0)
  INTO v_total_entries, v_total_minutes
  FROM public.entries
  WHERE user_id = p_user_id
    AND start_time >= p_week_start::TIMESTAMPTZ
    AND start_time < (v_week_end + 1)::TIMESTAMPTZ;

  SELECT COALESCE(AVG(fulfillment_score), 0)
  INTO v_avg_fulfillment
  FROM public.entries
  WHERE user_id = p_user_id
    AND start_time >= p_week_start::TIMESTAMPTZ
    AND start_time < (v_week_end + 1)::TIMESTAMPTZ
    AND fulfillment_score IS NOT NULL;

  RETURN json_build_object(
    'total_entries', v_total_entries,
    'total_minutes', ROUND(v_total_minutes::numeric),
    'avg_fulfillment', ROUND(v_avg_fulfillment::numeric, 2)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_weekly_reflection_data(UUID, DATE) TO service_role;

-- 充実度トレンド
CREATE OR REPLACE FUNCTION public.get_fulfillment_trend(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS TABLE(date TEXT, avg_score DOUBLE PRECISION, entry_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char((e.start_time AT TIME ZONE 'UTC')::DATE, 'YYYY-MM-DD'),
    AVG(e.fulfillment_score)::DOUBLE PRECISION,
    COUNT(*)::BIGINT
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time >= p_start::TIMESTAMPTZ
    AND e.start_time < (p_end + 1)::TIMESTAMPTZ
    AND e.fulfillment_score IS NOT NULL
  GROUP BY (e.start_time AT TIME ZONE 'UTC')::DATE
  ORDER BY 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_fulfillment_trend(UUID, DATE, DATE) TO authenticated;

-- エネルギーマップ
CREATE OR REPLACE FUNCTION public.get_energy_map(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS TABLE(hour INT, dow INT, avg_score DOUBLE PRECISION, entry_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT,
    EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT,
    AVG(e.fulfillment_score)::DOUBLE PRECISION,
    COUNT(*)::BIGINT
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time >= p_start::TIMESTAMPTZ
    AND e.start_time < (p_end + 1)::TIMESTAMPTZ
    AND e.fulfillment_score IS NOT NULL
  GROUP BY
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT,
    EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT
  ORDER BY 1, 2;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_energy_map(UUID, DATE, DATE) TO authenticated;

-- タイムボクシング遵守率
CREATE OR REPLACE FUNCTION public.get_timeboxing_adherence(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_reviewed BIGINT;
  v_on_time BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_total
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ;

  SELECT COUNT(*) INTO v_reviewed
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND reviewed_at IS NOT NULL
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ;

  SELECT COUNT(*) INTO v_on_time
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND reviewed_at IS NOT NULL
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ
    AND (
      duration_minutes IS NOT NULL
      OR (start_time IS NOT NULL AND end_time IS NOT NULL)
    );

  RETURN json_build_object(
    'total_planned', v_total,
    'reviewed', v_reviewed,
    'on_time', v_on_time,
    'adherence_rate', CASE WHEN v_total > 0 THEN ROUND((v_reviewed::numeric / v_total) * 100, 1) ELSE 0 END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_timeboxing_adherence(UUID, DATE, DATE) TO authenticated;

-- 週次フォーカススコア
CREATE OR REPLACE FUNCTION public.get_weekly_focus_score(p_user_id UUID, p_weeks INT DEFAULT 12)
RETURNS TABLE(week_start TEXT, focus_score DOUBLE PRECISION, entry_count BIGINT, unique_tags BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    to_char(date_trunc('week', e.start_time AT TIME ZONE 'UTC'), 'YYYY-MM-DD'),
    CASE
      WHEN COUNT(DISTINCT et.tag_id) = 0 THEN 0
      ELSE (1.0 / COUNT(DISTINCT et.tag_id)::DOUBLE PRECISION) * 100
    END,
    COUNT(DISTINCT e.id)::BIGINT,
    COUNT(DISTINCT et.tag_id)::BIGINT
  FROM public.entries e
  LEFT JOIN public.entry_tags et ON et.entry_id = e.id
  WHERE e.user_id = p_user_id
    AND e.start_time >= (now() - (p_weeks || ' weeks')::interval)
    AND e.start_time IS NOT NULL
  GROUP BY date_trunc('week', e.start_time AT TIME ZONE 'UTC')
  ORDER BY 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_weekly_focus_score(UUID, INT) TO authenticated;

-- 振り返り対象のアクティブユーザー取得（service_role専用）
CREATE OR REPLACE FUNCTION public.get_active_users_for_reflection(
  p_week_start DATE,
  p_threshold_days INT,
  p_limit INT
)
RETURNS TABLE(user_id UUID, entry_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT e.user_id, COUNT(*)::BIGINT
  FROM public.entries e
  WHERE e.start_time >= p_week_start::TIMESTAMPTZ
    AND e.start_time < (p_week_start + 7)::TIMESTAMPTZ
    AND e.start_time IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.entries e2
      WHERE e2.user_id = e.user_id
        AND e2.start_time < (p_week_start - p_threshold_days)::TIMESTAMPTZ
        AND e2.start_time IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.reflections r
      WHERE r.user_id = e.user_id
        AND r.period_type = 'weekly'
        AND r.period_start = p_week_start
    )
  GROUP BY e.user_id
  ORDER BY COUNT(*) DESC
  LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_active_users_for_reflection(DATE, INT, INT) TO service_role;

-- ============================================================
-- Storage Buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES
  ('attachments', 'attachments', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: avatars
CREATE POLICY "Users can upload own avatar" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Users can update own avatar" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Users can delete own avatar" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Users can view own avatar" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- Storage RLS: attachments
CREATE POLICY "Users can upload own attachments" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Users can view own attachments" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Users can delete own attachments" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'attachments' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- ============================================================
-- pg_cron Jobs（ローカル環境用。本番は Dashboard で設定）
-- ============================================================

SELECT cron.schedule('cleanup-login-attempts', '0 3 * * *', $$SELECT public.cleanup_old_login_attempts()$$);
SELECT cron.schedule('cleanup-auth-audit-logs', '10 3 * * *', $$SELECT public.cleanup_old_auth_audit_logs()$$);
SELECT cron.schedule('cleanup-notifications', '20 3 * * *', $$SELECT public.delete_old_notifications()$$);
SELECT cron.schedule('cleanup-plan-activities', '30 3 * * *', $$SELECT public.cleanup_old_plan_activities()$$);

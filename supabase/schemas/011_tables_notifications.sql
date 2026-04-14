-- ============================================================
-- 通知テーブル（読み物用 — CLIでは使用しない）
-- ============================================================

-- notifications: アプリ内通知
-- type で種別を分岐、data (JSONB) に種別固有のペイロード
-- INSERT は service_role のみ（Edge Function / pg_cron 経由）
-- read_at が NULL = 未読、非NULL = 既読
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,            -- reminder/overdue/ai_insight/weekly_report/burnout_warning/energy_insight
  entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
  title TEXT NOT NULL,           -- 通知タイトル（表示用）
  data JSONB DEFAULT '{}',       -- 通知種別ごとの追加データ
  read_at TIMESTAMPTZ,           -- NULL=未読, 非NULL=既読
  fire_at TIMESTAMPTZ,           -- 通知発火予定日時（リマインダー等）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- notification_preferences: ユーザーごとの通知設定
-- auth.users 作成時に create_default_notification_preferences() で自動生成
CREATE TABLE public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  enable_browser_notifications BOOLEAN NOT NULL DEFAULT false,
  enable_email_notifications BOOLEAN NOT NULL DEFAULT false,
  enable_push_notifications BOOLEAN NOT NULL DEFAULT false,
  default_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

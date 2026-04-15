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
  entry_id UUID REFERENCES public.entries(id) ON DELETE SET NULL,
  type TEXT NOT NULL,             -- reminder/ai_insight/weekly_report/burnout_warning/energy_insight
  title TEXT NOT NULL,            -- 通知タイトル（表示用）
  data JSONB DEFAULT '{}',        -- 通知種別ごとの追加データ
  fire_at TIMESTAMPTZ,            -- 通知発火予定日時（リマインダー等）
  read_at TIMESTAMPTZ,            -- NULL=未読, 非NULL=既読
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- notification_preferences: 削除済み（20260414130000_drop_notification_preferences.sql）

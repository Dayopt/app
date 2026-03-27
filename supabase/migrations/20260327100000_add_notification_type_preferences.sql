-- 通知タイプ別のON/OFF設定カラムを追加

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS enable_daily_insights BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_energy_insights BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_burnout_warnings BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_weekly_reports BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.notification_preferences.enable_daily_insights IS 'AI インサイト通知（計画率・空白率等の閾値アラート）';
COMMENT ON COLUMN public.notification_preferences.enable_energy_insights IS 'エネルギーインサイト通知（ピーク活用率の提案）';
COMMENT ON COLUMN public.notification_preferences.enable_burnout_warnings IS 'バーンアウト警告通知（連続過負荷の検出）';
COMMENT ON COLUMN public.notification_preferences.enable_weekly_reports IS '週次レポート通知';

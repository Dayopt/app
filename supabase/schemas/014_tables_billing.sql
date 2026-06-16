-- ============================================================
-- 課金・メール関連テーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- 最終同期日: 2026-06-17
-- 同期対象 migration:
--   - 20260318091249_create_email_suppressions.sql
--   - 20260319090000_create_stripe_webhook_events.sql
--   - 20260604230607_harden_function_execute_privileges.sql
--

-- stripe_webhook_events: Stripe Webhook 冪等性キー
-- event_id で重複処理を防止
-- RLS: browser client は拒否、service_role のみ書き込み
CREATE TABLE public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- email_suppressions: メール送信抑制リスト
-- バウンス・苦情のあったアドレスを記録し、再送を防止
-- RLS: browser client は拒否、service_role のみ書き込み
CREATE TABLE public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  reason TEXT NOT NULL,            -- bounce/complaint
  source_event_id TEXT,            -- Resend のイベントID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

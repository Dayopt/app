-- ============================================================
-- プロダクト分析テーブル（読み物用 — CLIでは使用しない）
-- ============================================================
-- 最終同期日: 2026-08-02
-- 同期対象 migration:
--   - 20260802013954_add_product_events.sql
--
-- payload-free の allowlist event だけを90日保持する。
-- browser client は全拒否し、service_role は INSERT のみ。
-- ============================================================

CREATE TABLE public.product_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL
    CHECK (
      event_name IN (
        'user_signed_up',
        'plan_created',
        'record_created',
        'review_opened',
        'checkout_started',
        'subscription_started'
      )
    ),
  properties JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (properties = '{}'::JSONB),
  created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX product_events_created_at_idx
  ON public.product_events (created_at);

CREATE INDEX product_events_user_created_at_idx
  ON public.product_events (user_id, created_at DESC);

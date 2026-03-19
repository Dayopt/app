-- Stripe Webhookイベント冪等性テーブル
-- 同一イベントの重複処理を防止する
--
-- Webhook handler (src/app/api/webhooks/stripe/route.ts) から挿入される
-- INSERT 時に UNIQUE 制約違反 (23505) なら処理済みとしてスキップ

CREATE TABLE public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: service_role のみアクセス（webhook route handler から使用）
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- service_role は RLS をバイパスするため、ポリシー不要
-- 一般ユーザーにはアクセスさせない（ポリシーなし = 全拒否）

COMMENT ON TABLE public.stripe_webhook_events IS 'Stripe Webhookイベントの冪等性管理テーブル（30日経過後の古いレコードは定期的に削除可能）';

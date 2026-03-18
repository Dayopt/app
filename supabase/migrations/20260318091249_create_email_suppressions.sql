-- メールサプレッションリスト
-- バウンス・苦情のあったメールアドレスを記録し、再送信を防止する
--
-- Resend Webhook (email.bounced / email.complained) から挿入される
-- メール送信前にこのテーブルをチェックしてスキップする

CREATE TABLE public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('bounce', 'complaint')),
  source_event_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 同一メール+理由の重複防止
CREATE UNIQUE INDEX email_suppressions_email_reason_idx
  ON public.email_suppressions (email, reason);

-- メール送信前の高速ルックアップ用
CREATE INDEX email_suppressions_email_idx
  ON public.email_suppressions (email);

-- RLS: service_role のみアクセス（webhook route handler から使用）
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- service_role は RLS をバイパスするため、ポリシー不要
-- 一般ユーザーにはアクセスさせない（ポリシーなし = 全拒否）

COMMENT ON TABLE public.email_suppressions IS 'バウンス/苦情メールアドレスのサプレッションリスト';

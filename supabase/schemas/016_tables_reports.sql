-- ============================================================
-- レポートテーブル（読み物用 — CLIでは使用しない）
-- ============================================================

-- reports: AI生成の週次/月次レポート
-- period_type: 'weekly' | 'monthly'
-- summary は1-2文のリスト表示用概要（content を開かずに一覧で使う）
-- content はフルレポートJSONB
-- INSERT は service_role のみ（Edge Function / pg_cron 経由）
-- 同一 user_id + period_type + period_start の重複を UNIQUE 制約で防止
CREATE TABLE public.reports (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type  TEXT        NOT NULL,
  period_start DATE        NOT NULL,
  period_end   DATE        NOT NULL,
  summary      TEXT        NOT NULL,
  content      JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_type, period_start)
);

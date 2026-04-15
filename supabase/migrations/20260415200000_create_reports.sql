-- reports: AI生成の週次/月次レポート
-- INSERT は service_role のみ（AI/cronが生成）
-- ユーザーは SELECT / DELETE のみ

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

-- RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports" ON public.reports
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own reports" ON public.reports
  FOR DELETE USING ((select auth.uid()) = user_id);

CREATE POLICY "System can create reports" ON public.reports
  FOR INSERT TO service_role WITH CHECK (true);

-- Index: 一覧クエリ最適化（user_id + period_start DESC）
CREATE INDEX idx_reports_user_period
  ON public.reports (user_id, period_start DESC);

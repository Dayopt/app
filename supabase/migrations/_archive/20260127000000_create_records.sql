-- =====================================================
-- Records テーブル作成
-- Plan に紐づく作業ログ（時間記録）機能
-- =====================================================

-- records テーブル
CREATE TABLE IF NOT EXISTS public.records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 時間関連
  worked_at DATE NOT NULL,                                              -- 作業日
  start_time TIME,                                                      -- 開始時刻（任意）
  end_time TIME,                                                        -- 終了時刻（任意）
  duration_minutes INT NOT NULL CHECK (duration_minutes > 0),           -- 作業時間（分、1以上）

  -- ムード
  fulfillment_score INT CHECK (fulfillment_score BETWEEN 1 AND 5),      -- 充実度（1-5）

  -- その他
  note TEXT,                                                            -- メモ

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- コメント
COMMENT ON TABLE public.records IS 'Plan に紐づく作業ログ（時間記録）';
COMMENT ON COLUMN public.records.worked_at IS '作業した日付';
COMMENT ON COLUMN public.records.start_time IS '作業開始時刻（任意）';
COMMENT ON COLUMN public.records.end_time IS '作業終了時刻（任意）';
COMMENT ON COLUMN public.records.duration_minutes IS '作業時間（分）';
COMMENT ON COLUMN public.records.fulfillment_score IS '充実度（1-5）';
COMMENT ON COLUMN public.records.note IS 'メモ';

-- インデックス
CREATE INDEX IF NOT EXISTS idx_records_user_id ON public.records(user_id);
CREATE INDEX IF NOT EXISTS idx_records_plan_id ON public.records(plan_id);
CREATE INDEX IF NOT EXISTS idx_records_worked_at ON public.records(worked_at DESC);
CREATE INDEX IF NOT EXISTS idx_records_user_worked_at ON public.records(user_id, worked_at DESC);

-- RLS 有効化
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: ユーザーは自分の records のみ操作可能
CREATE POLICY "Users can view own records"
  ON public.records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own records"
  ON public.records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own records"
  ON public.records FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own records"
  ON public.records FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at 自動更新トリガー
CREATE TRIGGER update_records_updated_at
  BEFORE UPDATE ON public.records
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

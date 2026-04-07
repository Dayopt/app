-- ユーザー実績バッジ: ゲーミフィケーション用テーブル
-- バッジ定義はフロントエンド定数として管理（DBマスタ不要）

CREATE TABLE public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  rank TEXT,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_badges_unique UNIQUE(user_id, badge_id, rank),
  CONSTRAINT user_badges_rank_check CHECK (rank IS NULL OR rank IN ('bronze', 'silver', 'gold'))
);

COMMENT ON TABLE public.user_badges IS 'ユーザーが獲得したバッジの記録';
COMMENT ON COLUMN public.user_badges.badge_id IS 'フロントエンド定数のバッジID（例: streak, blocks, tags-5）';
COMMENT ON COLUMN public.user_badges.rank IS '段階成長型バッジのランク（bronze/silver/gold）。非段階型はNULL';
COMMENT ON COLUMN public.user_badges.earned_at IS 'バッジ獲得日時';

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own badges"
  ON public.user_badges FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own badges"
  ON public.user_badges FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE INDEX idx_user_badges_user ON public.user_badges(user_id);
CREATE INDEX idx_user_badges_user_badge ON public.user_badges(user_id, badge_id);

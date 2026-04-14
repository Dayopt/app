-- ============================================================
-- ゲーミフィケーション関連テーブル（読み物用 — CLIでは使用しない）
-- ============================================================

-- user_badges: ユーザーが獲得したバッジ
-- badge_id はアプリ側で定義された固定キー（DBにマスタテーブルなし）
CREATE TABLE public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,          -- streak_3/streak_7 等のバッジキー
  rank TEXT,                       -- bronze/silver/gold 等（バッジによる）
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_id)
);

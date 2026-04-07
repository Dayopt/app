-- user_badges制約修正:
-- 1. UNIQUE制約をNULLS NOT DISTINCTに変更（NULL rankの重複INSERT防止）
-- 2. 冗長インデックス削除（composite indexで代替可能）

-- 既存のUNIQUE制約を削除して再作成
ALTER TABLE public.user_badges DROP CONSTRAINT user_badges_unique;
ALTER TABLE public.user_badges ADD CONSTRAINT user_badges_unique
  UNIQUE NULLS NOT DISTINCT (user_id, badge_id, rank);

-- 冗長インデックス削除（idx_user_badges_user_badge がuser_idクエリもカバー）
DROP INDEX IF EXISTS idx_user_badges_user;

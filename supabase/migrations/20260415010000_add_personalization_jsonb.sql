-- user_settings に personalization JSONB カラムを追加
-- 将来のAI機能で使用する価値観・スタイル設定の器
-- 構造は未定（実装時に決定）

ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS personalization JSONB;

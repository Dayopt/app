-- chat_conversations テーブルの正式マイグレーション
-- ローカルには既にテーブルが存在する可能性があるため IF NOT EXISTS を使用

-- =============================================================
-- テーブル作成
-- =============================================================
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- インデックス（IF NOT EXISTS で冪等に）
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_id
  ON public.chat_conversations(user_id);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at
  ON public.chat_conversations(user_id, updated_at DESC);

-- =============================================================
-- RLS 有効化 + ポリシー
-- =============================================================
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーがあればDROP（冪等性）
DROP POLICY IF EXISTS "Users can view own chat_conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can insert own chat_conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can update own chat_conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can delete own chat_conversations" ON public.chat_conversations;

CREATE POLICY "Users can view own chat_conversations"
  ON public.chat_conversations FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can insert own chat_conversations"
  ON public.chat_conversations FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can update own chat_conversations"
  ON public.chat_conversations FOR UPDATE
  USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own chat_conversations"
  ON public.chat_conversations FOR DELETE
  USING ((select auth.uid()) = user_id);

-- =============================================================
-- updated_at 自動更新トリガー
-- =============================================================
DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON public.chat_conversations;

CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

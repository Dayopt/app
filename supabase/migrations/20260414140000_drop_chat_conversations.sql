-- chat_conversations テーブルを削除
-- 理由: チャット機能は未実装であり、アプリコードからの参照もないため不要

-- トリガー削除
DROP TRIGGER IF EXISTS update_chat_conversations_updated_at ON public.chat_conversations;

-- RLSポリシー削除
DROP POLICY IF EXISTS "Users can view own chat_conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can insert own chat_conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can update own chat_conversations" ON public.chat_conversations;
DROP POLICY IF EXISTS "Users can delete own chat_conversations" ON public.chat_conversations;

-- テーブル削除（インデックス・RLS設定もカスケードで消える）
DROP TABLE IF EXISTS public.chat_conversations;

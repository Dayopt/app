-- ============================================================
-- AI関連テーブル（読み物用 — CLIでは使用しない）
-- ============================================================

-- reflections: AI生成の振り返りレポート
-- 週次/日次/月次のレポートを永続保存
-- UNIQUE(user_id, period_type, period_start) で冪等性を保証
CREATE TABLE public.reflections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL,     -- daily/weekly/monthly
  period_start DATE NOT NULL,    -- 期間の開始日
  period_end DATE NOT NULL,      -- 期間の終了日
  title TEXT NOT NULL,           -- AIが生成した見出し
  activities JSONB NOT NULL DEFAULT '[]',  -- [{ label, minutes, highlight }]
  insights TEXT NOT NULL DEFAULT '',        -- AIの洞察テキスト
  question TEXT NOT NULL DEFAULT '',        -- 振り返り用の問いかけ
  model_used TEXT,               -- 使用AIモデル名
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  user_note TEXT NOT NULL DEFAULT '',  -- ユーザーが追記したメモ
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_type, period_start)
);

-- ai_usage: AI使用量トラッキング（月別）
-- increment_ai_usage() RPC でアトミックにインクリメント
CREATE TABLE public.ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,           -- 'YYYY-MM' 形式
  request_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, month)
);

-- chat_conversations: AIチャット会話
-- messages (JSONB配列) に全メッセージを格納
CREATE TABLE public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  messages JSONB NOT NULL DEFAULT '[]',
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

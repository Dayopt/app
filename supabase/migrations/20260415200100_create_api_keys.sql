-- api_keys: 外部連携用APIキー（Obsidian、Claude Code等）
-- key_hash にSHA-256ハッシュを保存（生キーはDBに保存しない）
-- ユーザーは SELECT / INSERT / DELETE のみ（UPDATE不可 — キー再生成は削除+新規作成）

CREATE TABLE public.api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own api_keys" ON public.api_keys
  FOR SELECT USING ((select auth.uid()) = user_id);

CREATE POLICY "Users can create own api_keys" ON public.api_keys
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "Users can delete own api_keys" ON public.api_keys
  FOR DELETE USING ((select auth.uid()) = user_id);

-- Index: ユーザーのキー一覧取得
CREATE INDEX idx_api_keys_user_id
  ON public.api_keys (user_id);

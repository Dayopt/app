-- ============================================================
-- APIキーテーブル（読み物用 — CLIでは使用しない）
-- ============================================================

-- api_keys: 外部連携用APIキー（Obsidian、Claude Code等）
-- key_hash: SHA-256ハッシュ。生キー（dayopt_sk_...）はDBに保存しない
-- name: ユーザーがつけるラベル（「Claude Code用」等）
-- last_used_at: 最後にAPIリクエストが来た日時（セキュリティ衛生管理用）
-- UPDATE不可 — キー再生成は削除+新規作成で対応
CREATE TABLE public.api_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

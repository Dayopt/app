-- パスワード履歴テーブル
-- @see src/lib/auth/password-history.ts
--
-- 目的:
-- - 過去のパスワード再利用を防止（OWASP推奨）
-- - 最新5件の履歴を保持
--
-- セキュリティ:
-- - パスワードはbcryptでハッシュ化して保存
-- - pgcrypto拡張を使用

-- pgcrypto拡張を有効化（bcrypt用）
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create table
CREATE TABLE IF NOT EXISTS public.password_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_password_history_user_id ON public.password_history(user_id);
CREATE INDEX idx_password_history_user_created ON public.password_history(user_id, created_at DESC);

-- Add comments
COMMENT ON TABLE public.password_history IS 'パスワード履歴（再利用防止用）';
COMMENT ON COLUMN public.password_history.password_hash IS 'bcryptハッシュ化されたパスワード';

-- Enable RLS
ALTER TABLE public.password_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies（サービスロールのみアクセス可能）
CREATE POLICY "Service role only for password history"
    ON public.password_history
    FOR ALL
    USING (false)
    WITH CHECK (false);

-- パスワード履歴をチェック（過去5件と比較）
CREATE OR REPLACE FUNCTION public.check_password_reuse(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_hash TEXT;
    v_is_reused BOOLEAN := FALSE;
BEGIN
    -- 過去5件の履歴をチェック
    FOR v_hash IN
        SELECT password_hash
        FROM public.password_history
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 5
    LOOP
        -- bcrypt比較
        IF crypt(p_new_password, v_hash) = v_hash THEN
            v_is_reused := TRUE;
            EXIT;
        END IF;
    END LOOP;

    RETURN v_is_reused;
END;
$$;

COMMENT ON FUNCTION public.check_password_reuse IS 'パスワードが過去5件と重複していないかチェック';

-- パスワード履歴に追加
CREATE OR REPLACE FUNCTION public.add_password_to_history(
    p_user_id UUID,
    p_new_password TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 新しいパスワードをハッシュ化して保存
    INSERT INTO public.password_history (user_id, password_hash)
    VALUES (p_user_id, crypt(p_new_password, gen_salt('bf', 10)));

    -- 古い履歴を削除（6件以上ある場合、最新5件のみ保持）
    DELETE FROM public.password_history
    WHERE user_id = p_user_id
      AND id NOT IN (
          SELECT id
          FROM public.password_history
          WHERE user_id = p_user_id
          ORDER BY created_at DESC
          LIMIT 5
      );
END;
$$;

COMMENT ON FUNCTION public.add_password_to_history IS 'パスワード履歴に新しいパスワードを追加';

-- パスワード履歴数を取得
CREATE OR REPLACE FUNCTION public.get_password_history_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM public.password_history
        WHERE user_id = p_user_id
    );
END;
$$;

COMMENT ON FUNCTION public.get_password_history_count IS 'ユーザーのパスワード履歴数を取得';

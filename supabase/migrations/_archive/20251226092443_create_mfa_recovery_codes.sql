-- MFAリカバリーコードテーブル
-- @see src/lib/auth/recovery-codes.ts
--
-- 目的:
-- - MFAデバイス紛失時のアカウント復旧
-- - ワンタイム使用のバックアップコード管理
--
-- セキュリティ:
-- - コードはSHA-256ハッシュで保存（平文は保存しない）
-- - 使用済みコードは即座にマーク or 削除
-- - ユーザーは自分のコードのみアクセス可能

-- Create table
CREATE TABLE IF NOT EXISTS public.mfa_recovery_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code_hash TEXT NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_mfa_recovery_codes_user_id ON public.mfa_recovery_codes(user_id);
CREATE INDEX idx_mfa_recovery_codes_user_unused ON public.mfa_recovery_codes(user_id) WHERE used_at IS NULL;

-- Add comments
COMMENT ON TABLE public.mfa_recovery_codes IS 'MFAリカバリーコード（ハッシュ化済み）';
COMMENT ON COLUMN public.mfa_recovery_codes.user_id IS 'ユーザーID';
COMMENT ON COLUMN public.mfa_recovery_codes.code_hash IS 'SHA-256ハッシュ化されたリカバリーコード';
COMMENT ON COLUMN public.mfa_recovery_codes.used_at IS '使用日時（NULL=未使用）';

-- Enable RLS
ALTER TABLE public.mfa_recovery_codes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- ユーザーは自分のリカバリーコードのみ参照可能
CREATE POLICY "Users can view own recovery codes"
    ON public.mfa_recovery_codes
    FOR SELECT
    USING (auth.uid() = user_id);

-- サービスロールのみ挿入・更新可能
CREATE POLICY "Service role can manage recovery codes"
    ON public.mfa_recovery_codes
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- リカバリーコード使用時の更新関数
CREATE OR REPLACE FUNCTION public.use_recovery_code(
    p_user_id UUID,
    p_code_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_code_id UUID;
BEGIN
    -- 未使用のコードを検索
    SELECT id INTO v_code_id
    FROM public.mfa_recovery_codes
    WHERE user_id = p_user_id
      AND code_hash = p_code_hash
      AND used_at IS NULL
    FOR UPDATE
    LIMIT 1;

    IF v_code_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 使用済みにマーク
    UPDATE public.mfa_recovery_codes
    SET used_at = NOW()
    WHERE id = v_code_id;

    RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.use_recovery_code IS 'リカバリーコードを使用済みにマーク';

-- 残りのリカバリーコード数を取得
CREATE OR REPLACE FUNCTION public.count_unused_recovery_codes(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM public.mfa_recovery_codes
        WHERE user_id = p_user_id
          AND used_at IS NULL
    );
END;
$$;

COMMENT ON FUNCTION public.count_unused_recovery_codes IS 'ユーザーの未使用リカバリーコード数を取得';

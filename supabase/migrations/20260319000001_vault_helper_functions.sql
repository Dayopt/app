-- ============================================================
-- Vault ヘルパー関数
-- ============================================================
-- vault.decrypted_secrets への直接アクセスを避け、
-- 安全な関数インターフェース経由でシークレットを取得する。
--
-- セキュリティモデル:
--   - SECURITY DEFINER: 関数の定義者（postgres）権限で実行
--   - search_path 固定: search_path injection 防止
--   - service_role 専用: PUBLIC/authenticated/anon からはアクセス不可
-- ============================================================

-- シークレット取得関数
CREATE OR REPLACE FUNCTION public.get_vault_secret(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name;

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'Vault secret not found: %', p_name;
  END IF;

  RETURN v_secret;
END;
$$;

REVOKE ALL ON FUNCTION public.get_vault_secret(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_vault_secret(TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.get_vault_secret(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_vault_secret(TEXT) TO service_role;

COMMENT ON FUNCTION public.get_vault_secret(TEXT) IS
  'Vault からシークレットを名前で取得。service_role 専用。';

-- シークレット存在確認関数
CREATE OR REPLACE FUNCTION public.vault_secret_exists(p_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = p_name
  );
END;
$$;

REVOKE ALL ON FUNCTION public.vault_secret_exists(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vault_secret_exists(TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.vault_secret_exists(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.vault_secret_exists(TEXT) TO service_role;

COMMENT ON FUNCTION public.vault_secret_exists(TEXT) IS
  'Vault にシークレットが存在するか確認。service_role 専用。';

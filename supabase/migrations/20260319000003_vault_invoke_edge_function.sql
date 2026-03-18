-- ============================================================
-- pg_cron から Edge Function を Vault シークレットで呼び出すヘルパー
-- ============================================================
-- pg_cron + pg_net パターンで Edge Function を呼び出す際、
-- SERVICE_ROLE_KEY を Dashboard SQL に直書きする代わりに
-- Vault から取得して認証ヘッダーを構築する。
--
-- 使用例（Dashboard > pg_cron）:
--   SELECT cron.schedule('check-reminders', '* * * * *', $$
--     SELECT public.invoke_edge_function('check-reminders');
--   $$);
-- ============================================================

CREATE OR REPLACE FUNCTION public.invoke_edge_function(
  p_function_name TEXT,
  p_body JSONB DEFAULT '{}'::JSONB
)
RETURNS BIGINT  -- pg_net request ID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url TEXT;
  v_key TEXT;
BEGIN
  v_url := public.get_vault_secret('supabase_url');
  v_key := public.get_vault_secret('service_role_key');

  RETURN net.http_post(
    url := v_url || '/functions/v1/' || p_function_name,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := p_body
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_edge_function(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.invoke_edge_function(TEXT, JSONB) FROM authenticated;
REVOKE ALL ON FUNCTION public.invoke_edge_function(TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.invoke_edge_function(TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.invoke_edge_function(TEXT, JSONB) IS
  'pg_cron から Edge Function を呼び出すヘルパー。Vault からシークレットを取得して認証ヘッダーを構築。';

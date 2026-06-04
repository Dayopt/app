-- ============================================================
-- MCP Phase 1.5: oauth_audit_log + issue_oauth_token_pair RPC
-- ============================================================

-- 1. oauth_audit_log table
CREATE TABLE public.oauth_audit_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_id   UUID        REFERENCES public.oauth_tokens(id) ON DELETE SET NULL,
  client_id  TEXT        NOT NULL,
  tool_name  TEXT        NOT NULL,
  called_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own audit log" ON public.oauth_audit_log
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE INDEX idx_oauth_audit_log_user_called
  ON public.oauth_audit_log(user_id, called_at DESC);

-- 2. issue_oauth_token_pair()
CREATE OR REPLACE FUNCTION public.issue_oauth_token_pair(
  p_user_id          UUID,
  p_client_id        TEXT,
  p_scopes           TEXT[],
  p_refresh_hash     TEXT,
  p_access_hash      TEXT,
  p_refresh_expires_at TIMESTAMPTZ,
  p_access_expires_at  TIMESTAMPTZ,
  p_parent_refresh_id  UUID DEFAULT NULL
) RETURNS TABLE(refresh_id UUID, access_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refresh_id UUID;
  v_access_id  UUID;
BEGIN
  INSERT INTO public.oauth_tokens (
    user_id, token_hash, token_type, client_id, scopes, expires_at, parent_token_id
  ) VALUES (
    p_user_id, p_refresh_hash, 'refresh', p_client_id, p_scopes,
    p_refresh_expires_at, p_parent_refresh_id
  )
  RETURNING id INTO v_refresh_id;

  INSERT INTO public.oauth_tokens (
    user_id, token_hash, token_type, client_id, scopes, expires_at, parent_token_id
  ) VALUES (
    p_user_id, p_access_hash, 'access', p_client_id, p_scopes,
    p_access_expires_at, v_refresh_id
  )
  RETURNING id INTO v_access_id;

  RETURN QUERY SELECT v_refresh_id, v_access_id;
END;
$$;

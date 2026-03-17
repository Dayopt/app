-- ==================================================================
-- P0: login_attempts INSERT ポリシーを RPC 経由に制限
--
-- 問題: anon/authenticated が直接 INSERT 可能（偽データ注入リスク）
-- 対策: SECURITY DEFINER 関数経由のみに制限
-- ==================================================================

-- RPC function: 入力バリデーション付きログイン試行記録
CREATE OR REPLACE FUNCTION record_login_attempt(
  p_email TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_is_successful BOOLEAN DEFAULT false,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Email validation
  IF p_email IS NULL OR length(p_email) > 320 OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'Invalid email parameter';
  END IF;

  INSERT INTO login_attempts (email, ip_address, is_successful, user_agent)
  VALUES (
    lower(trim(p_email)),
    p_ip_address::inet,
    p_is_successful,
    left(p_user_agent, 500)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_login_attempt TO anon, authenticated;

COMMENT ON FUNCTION record_login_attempt IS
  'ログイン試行を記録。直接INSERTの代わりにRPC経由で入力バリデーション付き。';

-- 直接 INSERT を service_role のみに制限
DROP POLICY IF EXISTS "System can log login attempts" ON public.login_attempts;
CREATE POLICY "Service role can insert login attempts"
  ON public.login_attempts
  FOR INSERT
  TO service_role
  WITH CHECK (true);

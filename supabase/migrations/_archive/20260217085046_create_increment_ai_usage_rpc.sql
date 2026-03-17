-- アトミックなAI利用回数インクリメント用RPC
CREATE OR REPLACE FUNCTION increment_ai_usage(p_user_id UUID, p_month TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.ai_usage (user_id, month, request_count)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET
    request_count = ai_usage.request_count + 1,
    updated_at = now();
END;
$$;

-- RLSバイパスのためSECURITY DEFINERを使用
-- サーバーサイドからのみ呼び出されるため安全
REVOKE ALL ON FUNCTION increment_ai_usage(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_ai_usage(UUID, TEXT) TO authenticated;

-- personalization JSONB の部分更新を atomic に行う RPC
-- 並行する ValueRankingSettings / ValuesSettings の保存が互いを上書きしないようにする
CREATE OR REPLACE FUNCTION update_personalization(
  p_user_id UUID,
  p_path TEXT,
  p_value JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_settings
  SET personalization = CASE
    WHEN personalization IS NULL THEN jsonb_build_object(p_path, p_value)
    ELSE jsonb_set(personalization, ARRAY[p_path], p_value, true)
  END,
  updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

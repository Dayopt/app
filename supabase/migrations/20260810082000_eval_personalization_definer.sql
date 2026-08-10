CREATE OR REPLACE FUNCTION public.update_personalization(
  p_user_id UUID,
  p_path TEXT,
  p_value JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.user_settings
  SET personalization = CASE
    WHEN personalization IS NULL THEN pg_catalog.jsonb_build_object(p_path, p_value)
    ELSE pg_catalog.jsonb_set(personalization, ARRAY[p_path], p_value, true)
  END,
  updated_at = pg_catalog.now()
  WHERE user_id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_personalization(UUID, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_personalization(UUID, TEXT, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_personalization(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_personalization(UUID, TEXT, JSONB) TO service_role;

-- SECURITY DEFINER RPC の残存 IDOR ガードを追加する。
--
-- 既存の hardening migration と同じ例外文言で、caller-supplied user_id が
-- auth.uid() と一致しない呼び出しを関数先頭で拒否する。

CREATE OR REPLACE FUNCTION public.soft_delete_entry(p_entry_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  UPDATE public.entries
  SET deleted_at = now()
  WHERE id = p_entry_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found or already deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_entry(p_entry_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  UPDATE public.entries
  SET deleted_at = NULL
  WHERE id = p_entry_id AND user_id = p_user_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found or not deleted';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.bulk_soft_delete_entries(p_entry_ids UUID[], p_user_id UUID)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  UPDATE public.entries
  SET deleted_at = now()
  WHERE id = ANY(p_entry_ids) AND user_id = p_user_id AND deleted_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_personalization(
  p_user_id UUID,
  p_path TEXT,
  p_value JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  UPDATE public.user_settings
  SET personalization = CASE
    WHEN personalization IS NULL THEN jsonb_build_object(p_path, p_value)
    ELSE jsonb_set(personalization, ARRAY[p_path], p_value, true)
  END,
  updated_at = now()
  WHERE user_id = p_user_id;
END;
$$;

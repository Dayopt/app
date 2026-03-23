-- ============================================================
-- RPC functions for soft-delete / restore
--
-- PostgreSQL は UPDATE 時に新しい行が SELECT ポリシーも
-- 満たすことを要求する。SELECT ポリシーの deleted_at IS NULL が
-- soft-delete 後の行を不可視にするため、直接 UPDATE では
-- RLS 違反（"new row violates row-level security policy"）になる。
--
-- SECURITY DEFINER の RPC でRLSをバイパスし、
-- 関数内で user_id チェックを実施して安全性を保証。
-- ============================================================

-- 1. soft-delete RPC
CREATE OR REPLACE FUNCTION public.soft_delete_entry(p_entry_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE entries
  SET deleted_at = now()
  WHERE id = p_entry_id AND user_id = p_user_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found or already deleted';
  END IF;
END;
$$;

-- 2. restore RPC
CREATE OR REPLACE FUNCTION public.restore_entry(p_entry_id UUID, p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE entries
  SET deleted_at = NULL
  WHERE id = p_entry_id AND user_id = p_user_id AND deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found or not deleted';
  END IF;
END;
$$;

-- 3. bulk soft-delete RPC
CREATE OR REPLACE FUNCTION public.bulk_soft_delete_entries(p_entry_ids UUID[], p_user_id UUID)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE entries
  SET deleted_at = now()
  WHERE id = ANY(p_entry_ids) AND user_id = p_user_id AND deleted_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

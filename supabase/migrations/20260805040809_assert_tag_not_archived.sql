-- アーカイブ済みタグの付与拒否を DB command 境界の内側へ移す（#1824）
--
-- assert_active_timeblock_tag_v1 は is_active しか見ておらず、2026-08-02 に
-- 追加した archived_at（20260802235756_add_tag_archived_at.sql）に未対応だった。
-- そのため「アーカイブ済みタグは新規 Plan / Record に付与できない」（#1576）の
-- 保証が TS の preflight（tag-assignment-guard.ts）だけに乗っており、preflight の
-- read とcommand の write の間にアーカイブが commit されると付与を通してしまう。
--
-- この関数は create_plan / update_plan / create_record / update_record の 4 command
-- （現在は private.*_unserialized_v1）から PERFORM されるため、ここを直せば 4 経路
-- すべてに伝播する。呼び出し元の書き換えは不要。
--
-- ERRCODE を DT001（not found）と分けるのは、DT001 が Plan / Record の not-found にも
-- 使われる汎用コードで、TS 側が NOT_FOUND へマップしているため。同じコードに載せると
-- アーカイブ済みタグへの付与が「見つかりません」に化け、TAG_ARCHIVED の公開契約
-- （mcp-mutation-contract.ts の McpMutationErrorCode）とユーザー向け文言が劣化する。
-- DT014 は未使用（DT001-DT013 が使用済み、DT010 は欠番）。

CREATE OR REPLACE FUNCTION public.assert_active_timeblock_tag_v1(p_user_id UUID, p_tag_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_archived_at TIMESTAMPTZ;
BEGIN
  IF p_tag_id IS NULL THEN
    RETURN;
  END IF;

  -- FOR SHARE は既存挙動のまま維持する。command のトランザクション内で対象タグ行を
  -- ロックすることで、この検証の後にアーカイブが commit される窓を閉じる。
  SELECT tag.archived_at
  INTO v_archived_at
  FROM public.tags AS tag
  WHERE tag.id = p_tag_id
    AND tag.user_id = p_user_id
    AND tag.is_active
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tag not found' USING ERRCODE = 'DT001';
  END IF;

  IF v_archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'Tag is archived' USING ERRCODE = 'DT014';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.assert_active_timeblock_tag_v1(UUID, UUID) IS
  'Plan / Record の tag_id を command 境界で検証する。存在しない / 他ユーザー / マージ済み墓標は DT001、アーカイブ済みは DT014。';

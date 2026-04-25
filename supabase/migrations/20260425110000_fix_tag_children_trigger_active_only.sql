-- check_tag_has_children: active children のみを判定対象にする
--
-- 経緯:
--   restore_tag_parent_hierarchy.sql の trigger は `parent_id = NEW.id` の行が
--   存在するかだけを見ており、`is_active = false` (soft-deleted) の子も判定対象
--   になっていた。タグ削除は行を残して is_active を false にする運用なので、
--   非アクティブな子しか持たない親を再 parent しようとすると service 側の
--   check は通っても trigger で例外になる。
--
-- 本マイグレーションでは trigger 内の判定に `child.is_active = true` を加える
-- ことで service 側の semantics と整合させる。

CREATE OR REPLACE FUNCTION public.check_tag_has_children()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL AND OLD.parent_id IS DISTINCT FROM NEW.parent_id THEN
    IF EXISTS (
      SELECT 1
      FROM public.tags child
      WHERE child.parent_id = NEW.id
        AND child.is_active = true
    ) THEN
      RAISE EXCEPTION 'Cannot move a tag with children to be a child of another tag.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

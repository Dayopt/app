-- タグアーカイブ状態の導入（#1576）
--
-- `archived_at` を正式なアーカイブ状態とする。`is_active = false` は
-- merge RPC がソースタグに書く「マージ済みの墓標」専用であり、意味を混ぜない
-- （設計判断: docs/product/log/2026-08-03-tag-archive-design.md）。
--
-- 状態の整理:
--   通常:          is_active = true,  archived_at IS NULL
--   アーカイブ:    is_active = true,  archived_at IS NOT NULL
--   マージ済み墓標: is_active = false（アーカイブ一覧にも出さない）

ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

COMMENT ON COLUMN public.tags.archived_at IS
  'アーカイブ日時。NULL = 通常。セット済みタグは新規 Plan / Record の候補に出さないが、過去の表示では元の名前・色を維持する。';

-- 名前の一意性はアーカイブ済みタグに占有させない。
-- 復元時の同名衝突は service 層が DUPLICATE_NAME で弾き、リネームを促す。
DROP INDEX IF EXISTS public.tags_user_root_name_unique;
CREATE UNIQUE INDEX tags_user_root_name_unique
  ON public.tags(user_id, name)
  WHERE parent_id IS NULL AND is_active = true AND archived_at IS NULL;

DROP INDEX IF EXISTS public.tags_user_parent_name_unique;
CREATE UNIQUE INDEX tags_user_parent_name_unique
  ON public.tags(user_id, parent_id, name)
  WHERE parent_id IS NOT NULL AND is_active = true AND archived_at IS NULL;

-- check_tag_has_children: アーカイブ済みの子タグは「子を持つ」判定から除外する。
-- 全子タグがアーカイブ済みの親を別タグの子へ移動できないと、is_active の時と
-- 同型の誤ブロック（20260425110000 の教訓）が再発するため。
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
        AND child.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Cannot move a tag with children to be a child of another tag.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

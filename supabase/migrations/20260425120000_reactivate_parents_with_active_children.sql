-- restore_tag_parent_hierarchy.sql の prefix backfill が is_active を考慮していなかった
-- 補完マイグレーション
--
-- 経緯:
--   20260424000000_restore_tag_parent_hierarchy.sql の prefix 補完ロジックは
--   `LEFT JOIN public.tags existing ON existing.name = mp.prefix_name` で同名 row を
--   既存判定しており、`is_active = false` の soft-deleted root も「存在する」と扱って
--   いた。結果として:
--     - 既に soft-deleted root `X` (is_active=false) があり、active な `X:child` が
--       残っている場合、新しい active な root が insert されない
--     - その後の rename + link 段階で `X:child` は `child` にリネームされ、
--       inactive な `X` に parent_id がぶら下がる形で hierarchy が壊れた状態になる
--
-- 本マイグレーションでは「active な子を持つ inactive な root を reactivate する」
-- ことで hierarchy を救済する。inactive な行を reactivate するため `tags_user_root_name_unique`
-- index と衝突する可能性があるが、その場合は別途手動対応が必要なケースなので
-- index 違反を露出させる方針で良い (silent な hierarchy 喪失より検知可能)。

UPDATE public.tags AS p
SET is_active = true,
    updated_at = NOW()
WHERE p.is_active = false
  AND p.parent_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM public.tags AS c
    WHERE c.parent_id = p.id
      AND c.is_active = true
  );

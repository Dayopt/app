-- enforce_entry_tag_owner トリガー（20260706120000）は以降の INSERT/UPDATE のみを検査するため、
-- 導入前から存在する owner 不一致の entries.tag_id は対象外のまま残ってしまう。
-- ここで既存データを一括で解消し、不変条件を過去分にも適用する。
UPDATE public.entries
SET tag_id = NULL
WHERE tag_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.tags
    WHERE tags.id = entries.tag_id
      AND tags.user_id = entries.user_id
  );

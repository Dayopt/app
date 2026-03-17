-- plan_tagsテーブルにユニーク制約を追加
--
-- 目的: upsert操作のON CONFLICTで必要な制約を追加
--
-- エラー: "there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- 原因: plan_tagsテーブルに(user_id, plan_id, tag_id)のユニーク制約がない
--
-- API側 (src/server/api/routers/plans/tags.ts) で以下のように使用:
--   onConflict: 'user_id,plan_id,tag_id'

-- 既存の重複データを削除（もしあれば）
DELETE FROM plan_tags a
USING plan_tags b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.plan_id = b.plan_id
  AND a.tag_id = b.tag_id;

-- ユニーク制約を追加
ALTER TABLE plan_tags
ADD CONSTRAINT plan_tags_user_plan_tag_unique
UNIQUE (user_id, plan_id, tag_id);

-- コメント追加
COMMENT ON CONSTRAINT plan_tags_user_plan_tag_unique ON plan_tags IS 'ユーザー・プラン・タグの組み合わせの一意性を保証（upsert用）';

-- タグ名にユニーク制約を追加
-- これにより、同じ名前のタグを作成できなくなる

-- ユーザーごとにタグ名をユニークにする制約を追加
ALTER TABLE tags
ADD CONSTRAINT tags_user_id_name_unique UNIQUE (user_id, name);

-- インデックスを作成（検索パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_tags_user_id_name ON tags(user_id, name);

-- タグに連番を追加（#t-1, #t-2形式）

-- tag_numberカラムを追加
ALTER TABLE tags
ADD COLUMN tag_number INTEGER;

-- 既存のタグに連番を割り当て（ユーザーごと、作成日時順）
WITH numbered_tags AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) as tag_num
  FROM tags
)
UPDATE tags
SET tag_number = numbered_tags.tag_num
FROM numbered_tags
WHERE tags.id = numbered_tags.id;

-- tag_numberをNOT NULLに変更
ALTER TABLE tags
ALTER COLUMN tag_number SET NOT NULL;

-- ユニーク制約を追加（ユーザーごとに連番がユニーク）
ALTER TABLE tags
ADD CONSTRAINT tags_user_id_tag_number_unique UNIQUE (user_id, tag_number);

-- シーケンス用の関数を作成（新規タグ作成時に自動で次の番号を割り当て）
CREATE OR REPLACE FUNCTION get_next_tag_number(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(tag_number), 0) + 1 INTO next_num
  FROM tags
  WHERE user_id = p_user_id;

  -- 最小値を1にする
  IF next_num < 1 THEN
    next_num := 1;
  END IF;

  RETURN next_num;
END;
$$;

-- タグ作成時に自動で tag_number を設定するトリガー
CREATE OR REPLACE FUNCTION set_tag_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tag_number IS NULL OR NEW.tag_number = 0 THEN
    NEW.tag_number := get_next_tag_number(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_tag_number
BEFORE INSERT ON tags
FOR EACH ROW
EXECUTE FUNCTION set_tag_number();

-- インデックスを作成
CREATE INDEX IF NOT EXISTS idx_tags_user_id_tag_number ON tags(user_id, tag_number);

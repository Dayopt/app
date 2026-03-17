-- 日付表示形式カラムを追加
-- yyyy/MM/dd（日本）, MM/dd/yyyy（米国）, dd/MM/yyyy（欧州）, yyyy-MM-dd（ISO）

ALTER TABLE user_settings
ADD COLUMN date_format TEXT NOT NULL DEFAULT 'yyyy/MM/dd'
CHECK (date_format IN ('yyyy/MM/dd', 'MM/dd/yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd'));

-- コメント
COMMENT ON COLUMN user_settings.date_format IS '日付表示形式: yyyy/MM/dd（日本）, MM/dd/yyyy（米国）, dd/MM/yyyy（欧州）, yyyy-MM-dd（ISO）';

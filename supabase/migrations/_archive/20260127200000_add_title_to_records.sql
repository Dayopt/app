-- =====================================================
-- Records テーブルに title カラムを追加
-- 作業内容の詳細を記録するため
-- =====================================================

-- title カラム追加（任意）
ALTER TABLE public.records ADD COLUMN title TEXT;

-- コメント
COMMENT ON COLUMN public.records.title IS '作業タイトル（任意）- 予定に対する詳細を記録';

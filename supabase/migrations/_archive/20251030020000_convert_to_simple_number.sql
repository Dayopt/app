-- ========================================
-- 既存の旧形式データを削除して、新形式に移行
-- TKT-20251030-001 → 削除後、新規作成時に #1, #2, #3... で採番
-- ========================================

-- 既存の旧形式チケットを削除
DELETE FROM plans WHERE plan_number LIKE 'TKT-%';

-- 確認用ログ
DO $$
BEGIN
  RAISE NOTICE '旧形式データを削除しました';
  RAISE NOTICE 'plans 残存件数: %', (SELECT COUNT(*) FROM plans);
END $$;

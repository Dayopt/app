-- ========================================
-- plansテーブルにrecurrence_ruleカラムを追加
-- カスタム繰り返し設定をRRULE形式で保存
-- ========================================

-- recurrence_ruleカラム追加（RRULE形式の文字列）
ALTER TABLE plans ADD COLUMN IF NOT EXISTS recurrence_rule TEXT;

-- インデックス追加（パフォーマンス向上）
CREATE INDEX IF NOT EXISTS idx_plans_recurrence_rule ON plans(recurrence_rule) WHERE recurrence_rule IS NOT NULL;

-- コメント追加（ドキュメント化）
COMMENT ON COLUMN plans.recurrence_rule IS 'カスタム繰り返しルール（RRULE形式: FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20251231）';

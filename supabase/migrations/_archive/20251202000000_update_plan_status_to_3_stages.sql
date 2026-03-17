-- ========================================
-- planステータスを3段階に変更（todo/doing/done）
-- 作成日: 2025-12-02
-- ========================================

-- 既存のステータスを新しいステータスにマッピング
UPDATE plans
SET status = CASE
  WHEN status = 'backlog' THEN 'todo'
  WHEN status = 'ready' THEN 'doing'    -- カレンダー配置済み = doing
  WHEN status = 'active' THEN 'doing'
  WHEN status = 'wait' THEN 'doing'     -- 待ち状態もdoingに統合
  WHEN status = 'done' THEN 'done'
  WHEN status = 'cancel' THEN 'done'    -- キャンセルはdoneに統合（または削除扱い）
  ELSE 'todo'
END;

-- ステータスのCHECK制約を削除
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check;

-- 新しいステータスでCHECK制約を再作成
ALTER TABLE plans ADD CONSTRAINT plans_status_check
  CHECK (status IN ('todo', 'doing', 'done'));

-- ========================================
-- ステータス説明
-- ========================================
-- todo:  未着手
-- doing: 作業中（自動判定: カレンダー配置 or Log紐づけ）
-- done:  完了（手動）
--
-- 注意:
-- - DBには実際のステータス値を保存
-- - 'doing' は start_time / log_id から計算でも導出可能
-- - 詳細は getEffectiveStatus() を参照

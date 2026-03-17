-- ========================================
-- planステータスを6段階に更新
-- 作成日: 2024-10-30
-- ========================================

-- 既存のステータスを新しいステータスにマッピング
UPDATE plans
SET status = CASE
  WHEN status = 'open' THEN 'backlog'
  WHEN status = 'in_progress' THEN 'active'
  WHEN status = 'completed' THEN 'done'
  WHEN status = 'cancelled' THEN 'cancel'
  ELSE status
END;

-- ステータスのCHECK制約を削除
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_status_check;

-- 新しいステータスでCHECK制約を再作成
ALTER TABLE plans ADD CONSTRAINT plans_status_check
  CHECK (status IN ('backlog', 'ready', 'active', 'wait', 'done', 'cancel'));

-- ステータス説明
-- backlog: 準備中（未着手）
-- ready: 配置済み（準備完了、開始待ち）
-- active: 作業中
-- wait: 待ち（ブロック中）
-- done: 完了
-- cancel: 中止

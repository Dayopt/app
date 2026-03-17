-- =====================================================
-- records.plan_id を NULL 許可に変更
-- RecordはPlanなしでも作成可能にする（スタンドアロン時間記録）
-- =====================================================

-- NOT NULL制約を削除
ALTER TABLE public.records
  ALTER COLUMN plan_id DROP NOT NULL;

-- 外部キー制約を更新（ON DELETE SET NULL に変更）
-- まず既存の制約を削除
ALTER TABLE public.records
  DROP CONSTRAINT IF EXISTS records_plan_id_fkey;

-- 新しい制約を追加（Plan削除時はNULLに設定）
ALTER TABLE public.records
  ADD CONSTRAINT records_plan_id_fkey
  FOREIGN KEY (plan_id)
  REFERENCES public.plans(id)
  ON DELETE SET NULL;

-- コメント更新
COMMENT ON COLUMN public.records.plan_id IS '紐づくPlan（NULLの場合はスタンドアロンの時間記録）';

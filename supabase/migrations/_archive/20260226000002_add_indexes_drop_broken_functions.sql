-- ==================================================================
-- P1: インデックス追加 + 壊れた関数削除
-- ==================================================================

-- plans 複合インデックス（カレンダー表示最適化）
-- PlanService.list() の WHERE user_id = ? AND start_time >= ? AND start_time <= ?
-- 単一カラムインデックスでは Bitmap Index Scan 合成が必要
CREATE INDEX IF NOT EXISTS idx_plans_user_start_time
  ON plans(user_id, start_time);

-- 壊れた SECURITY DEFINER 関数を削除
-- plan_activities のカラム名が不一致:
--   関数内: activity_type, details
--   実テーブル: action_type, metadata
-- サービス層（PlanService）が個別クエリを使用しており未使用
DROP FUNCTION IF EXISTS create_plan_with_tags(uuid, text, text, date, uuid[]);
DROP FUNCTION IF EXISTS update_plan_with_tags(uuid, uuid, text, text, date, uuid[]);
DROP FUNCTION IF EXISTS delete_plan_with_cleanup(uuid, uuid);

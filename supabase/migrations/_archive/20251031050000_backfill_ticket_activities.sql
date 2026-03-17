-- 既存のチケットに対して「作成」アクティビティを一括追加
-- これにより、既存チケットのInspectorでもアクティビティタブが機能するようになる

INSERT INTO plan_activities (plan_id, user_id, action_type, created_at)
SELECT
  id,
  user_id,
  'created',
  created_at -- チケットの作成日時を使用
FROM plans
WHERE id NOT IN (
  SELECT DISTINCT plan_id
  FROM plan_activities
  WHERE action_type = 'created'
);

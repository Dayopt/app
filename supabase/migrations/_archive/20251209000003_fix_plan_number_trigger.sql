-- plan_number自動生成トリガー関数を修正
-- 問題: 古いテーブル名 'tickets' と カラム名 'ticket_number' を参照していた

-- 関数を再作成（plans テーブルと plan_number カラムを使用）
CREATE OR REPLACE FUNCTION public.generate_simple_ticket_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  -- ユーザーごとの最大値+1を取得
  SELECT COALESCE(
    MAX(CAST(REGEXP_REPLACE(plan_number, '[^0-9]', '', 'g') AS INTEGER)),
    0
  ) + 1 INTO next_num
  FROM plans
  WHERE user_id = NEW.user_id;

  NEW.plan_number := next_num::TEXT;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.generate_simple_ticket_number() IS 'Planのplan_numberを自動生成するトリガー関数';

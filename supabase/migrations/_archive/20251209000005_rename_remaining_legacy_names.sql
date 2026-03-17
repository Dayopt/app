-- 残りのレガシーticket命名をplan命名にリネーム
-- PK制約、UNIQUE制約、FK制約、RLSポリシー
-- 注意: 既に新しい名前の場合はスキップ

-- ===== PK制約のリネーム =====
DO $$
BEGIN
  -- plan_activities
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_activities_pkey') THEN
    ALTER TABLE plan_activities RENAME CONSTRAINT ticket_activities_pkey TO plan_activities_pkey;
  END IF;
  -- plan_tags
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_tags_pkey') THEN
    ALTER TABLE plan_tags RENAME CONSTRAINT ticket_tags_pkey TO plan_tags_pkey;
  END IF;
  -- plans
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_pkey') THEN
    ALTER TABLE plans RENAME CONSTRAINT tickets_pkey TO plans_pkey;
  END IF;
END
$$;

-- ===== UNIQUE制約のリネーム =====
DO $$
BEGIN
  -- plan_tags
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_tags_ticket_id_tag_id_key') THEN
    ALTER TABLE plan_tags RENAME CONSTRAINT ticket_tags_ticket_id_tag_id_key TO plan_tags_plan_id_tag_id_key;
  END IF;
  -- plans
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_user_id_ticket_number_key') THEN
    ALTER TABLE plans RENAME CONSTRAINT tickets_user_id_ticket_number_key TO plans_user_id_plan_number_key;
  END IF;
END
$$;

-- ===== FK制約のリネーム =====
DO $$
BEGIN
  -- plan_tags
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ticket_tags_user_id_fkey') THEN
    ALTER TABLE plan_tags RENAME CONSTRAINT ticket_tags_user_id_fkey TO plan_tags_user_id_fkey;
  END IF;
  -- plans
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tickets_user_id_fkey') THEN
    ALTER TABLE plans RENAME CONSTRAINT tickets_user_id_fkey TO plans_user_id_fkey;
  END IF;
END
$$;

-- ===== RLSポリシーのリネーム =====
DO $$
BEGIN
  -- plan_activities
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can create activities for their own tickets') THEN
    ALTER POLICY "Users can create activities for their own tickets" ON plan_activities
      RENAME TO "Users can create activities for their own plans";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view activities of their own tickets') THEN
    ALTER POLICY "Users can view activities of their own tickets" ON plan_activities
      RENAME TO "Users can view activities of their own plans";
  END IF;
  -- plan_tags
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own ticket_tags') THEN
    ALTER POLICY "Users can delete own ticket_tags" ON plan_tags
      RENAME TO "Users can delete own plan_tags";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own ticket_tags') THEN
    ALTER POLICY "Users can insert own ticket_tags" ON plan_tags
      RENAME TO "Users can insert own plan_tags";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own ticket_tags') THEN
    ALTER POLICY "Users can view own ticket_tags" ON plan_tags
      RENAME TO "Users can view own plan_tags";
  END IF;
  -- plans
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete own tickets') THEN
    ALTER POLICY "Users can delete own tickets" ON plans
      RENAME TO "Users can delete own plans";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can insert own tickets') THEN
    ALTER POLICY "Users can insert own tickets" ON plans
      RENAME TO "Users can insert own plans";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update own tickets') THEN
    ALTER POLICY "Users can update own tickets" ON plans
      RENAME TO "Users can update own plans";
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can view own tickets') THEN
    ALTER POLICY "Users can view own tickets" ON plans
      RENAME TO "Users can view own plans";
  END IF;
END
$$;

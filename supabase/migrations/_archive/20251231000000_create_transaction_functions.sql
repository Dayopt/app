-- トランザクション処理のためのStored Procedures
-- Phase 3: 複数操作のACID保証を実装

-- ==========================================
-- 1. create_plan_with_tags
-- ==========================================
-- プラン作成 + タグ関連付けをアトミックに実行
-- トランザクション内で実行され、エラー時は全操作がロールバックされる

CREATE OR REPLACE FUNCTION create_plan_with_tags(
  p_user_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_scheduled_date date DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS json AS $$
DECLARE
  new_plan plans;
  tag_id uuid;
  result json;
BEGIN
  -- 1. プラン作成
  INSERT INTO plans (user_id, title, description, scheduled_date)
  VALUES (p_user_id, p_title, p_description, p_scheduled_date)
  RETURNING * INTO new_plan;

  -- 2. タグ関連付け（配列をループ）
  IF array_length(p_tag_ids, 1) > 0 THEN
    FOREACH tag_id IN ARRAY p_tag_ids LOOP
      INSERT INTO plan_tags (user_id, plan_id, tag_id)
      VALUES (p_user_id, new_plan.id, tag_id)
      ON CONFLICT (user_id, plan_id, tag_id) DO NOTHING;  -- 重複は無視
    END LOOP;
  END IF;

  -- 3. アクティビティ記録
  INSERT INTO plan_activities (plan_id, user_id, activity_type, details)
  VALUES (new_plan.id, p_user_id, 'created', jsonb_build_object(
    'title', p_title,
    'tag_count', COALESCE(array_length(p_tag_ids, 1), 0)
  ));

  -- 4. 結果をJSONで返す（タグ情報を含む）
  SELECT json_build_object(
    'id', new_plan.id,
    'user_id', new_plan.user_id,
    'title', new_plan.title,
    'description', new_plan.description,
    'scheduled_date', new_plan.scheduled_date,
    'created_at', new_plan.created_at,
    'updated_at', new_plan.updated_at,
    'tag_ids', p_tag_ids
  ) INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- 全操作ロールバック
    RAISE EXCEPTION 'Failed to create plan with tags: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 関数の説明
COMMENT ON FUNCTION create_plan_with_tags IS
  'Atomically creates a plan with tags and activity log. All operations are rolled back on error.';

-- ==========================================
-- 2. merge_tags
-- ==========================================
-- タグマージをアトミックに実行
-- ソースタグの関連付けをターゲットタグに移行し、ソースタグを削除

CREATE OR REPLACE FUNCTION merge_tags(
  p_user_id uuid,
  p_source_tag_ids uuid[],
  p_target_tag_id uuid
) RETURNS json AS $$
DECLARE
  source_tag_id uuid;
  merged_count integer := 0;
  deleted_count integer := 0;
  target_tag tags;
  result json;
BEGIN
  -- 1. ターゲットタグの存在確認
  SELECT * INTO target_tag FROM tags
  WHERE id = p_target_tag_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target tag not found: %', p_target_tag_id;
  END IF;

  -- 2. 各ソースタグを処理
  FOREACH source_tag_id IN ARRAY p_source_tag_ids LOOP
    -- ソースタグの存在確認
    IF NOT EXISTS (
      SELECT 1 FROM tags WHERE id = source_tag_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Source tag not found: %', source_tag_id;
    END IF;

    -- 同じタグへのマージは不可
    IF source_tag_id = p_target_tag_id THEN
      RAISE EXCEPTION 'Cannot merge a tag with itself: %', source_tag_id;
    END IF;

    -- plan_tags を更新（重複しないもののみ）
    UPDATE plan_tags
    SET tag_id = p_target_tag_id
    WHERE user_id = p_user_id
      AND tag_id = source_tag_id
      AND NOT EXISTS (
        SELECT 1 FROM plan_tags pt
        WHERE pt.user_id = p_user_id
          AND pt.plan_id = plan_tags.plan_id
          AND pt.tag_id = p_target_tag_id
      );

    GET DIAGNOSTICS merged_count = ROW_COUNT;

    -- 重複していた関連付けを削除
    DELETE FROM plan_tags
    WHERE user_id = p_user_id AND tag_id = source_tag_id;

    -- ソースタグを削除
    DELETE FROM tags WHERE id = source_tag_id AND user_id = p_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END LOOP;

  -- 3. 結果をJSONで返す
  SELECT json_build_object(
    'success', true,
    'merged_associations', merged_count,
    'deleted_tags', deleted_count,
    'target_tag', row_to_json(target_tag)
  ) INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- 全操作ロールバック
    RAISE EXCEPTION 'Failed to merge tags: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 関数の説明
COMMENT ON FUNCTION merge_tags IS
  'Atomically merges multiple source tags into a target tag, migrating associations and deleting source tags.';

-- ==========================================
-- 3. delete_plan_with_cleanup
-- ==========================================
-- プラン削除 + カスケード削除 + アクティビティ記録

CREATE OR REPLACE FUNCTION delete_plan_with_cleanup(
  p_user_id uuid,
  p_plan_id uuid
) RETURNS json AS $$
DECLARE
  plan_record plans;
  deleted_tags_count integer := 0;
  result json;
BEGIN
  -- 1. プラン情報を取得
  SELECT * INTO plan_record FROM plans
  WHERE id = p_plan_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or access denied: %', p_plan_id;
  END IF;

  -- 2. アクティビティ記録
  INSERT INTO plan_activities (plan_id, user_id, activity_type, details)
  VALUES (p_plan_id, p_user_id, 'deleted', jsonb_build_object(
    'title', plan_record.title,
    'deleted_at', NOW()
  ));

  -- 3. plan_tags を削除
  DELETE FROM plan_tags WHERE plan_id = p_plan_id AND user_id = p_user_id;
  GET DIAGNOSTICS deleted_tags_count = ROW_COUNT;

  -- 4. プランを削除
  DELETE FROM plans WHERE id = p_plan_id AND user_id = p_user_id;

  -- 5. 結果をJSONで返す
  SELECT json_build_object(
    'success', true,
    'deleted_plan', row_to_json(plan_record),
    'deleted_tags_associations', deleted_tags_count
  ) INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- 全操作ロールバック
    RAISE EXCEPTION 'Failed to delete plan: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 関数の説明
COMMENT ON FUNCTION delete_plan_with_cleanup IS
  'Atomically deletes a plan with cascade cleanup and activity logging.';

-- ==========================================
-- 4. update_plan_with_tags
-- ==========================================
-- プラン更新 + タグ関連付け更新をアトミックに実行

CREATE OR REPLACE FUNCTION update_plan_with_tags(
  p_user_id uuid,
  p_plan_id uuid,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_scheduled_date date DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL
) RETURNS json AS $$
DECLARE
  updated_plan plans;
  tag_id uuid;
  result json;
BEGIN
  -- 1. プランの所有権確認
  IF NOT EXISTS (
    SELECT 1 FROM plans WHERE id = p_plan_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Plan not found or access denied: %', p_plan_id;
  END IF;

  -- 2. プラン更新（NULLでないフィールドのみ）
  UPDATE plans SET
    title = COALESCE(p_title, title),
    description = COALESCE(p_description, description),
    scheduled_date = COALESCE(p_scheduled_date, scheduled_date),
    updated_at = NOW()
  WHERE id = p_plan_id AND user_id = p_user_id
  RETURNING * INTO updated_plan;

  -- 3. タグ関連付け更新（p_tag_idsがNULLでない場合）
  IF p_tag_ids IS NOT NULL THEN
    -- 既存の関連付けを削除
    DELETE FROM plan_tags WHERE plan_id = p_plan_id AND user_id = p_user_id;

    -- 新しい関連付けを挿入
    IF array_length(p_tag_ids, 1) > 0 THEN
      FOREACH tag_id IN ARRAY p_tag_ids LOOP
        INSERT INTO plan_tags (user_id, plan_id, tag_id)
        VALUES (p_user_id, p_plan_id, tag_id)
        ON CONFLICT (user_id, plan_id, tag_id) DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  -- 4. アクティビティ記録
  INSERT INTO plan_activities (plan_id, user_id, activity_type, details)
  VALUES (p_plan_id, p_user_id, 'updated', jsonb_build_object(
    'title', p_title,
    'tag_count', COALESCE(array_length(p_tag_ids, 1), 0)
  ));

  -- 5. 結果をJSONで返す
  SELECT json_build_object(
    'id', updated_plan.id,
    'user_id', updated_plan.user_id,
    'title', updated_plan.title,
    'description', updated_plan.description,
    'scheduled_date', updated_plan.scheduled_date,
    'created_at', updated_plan.created_at,
    'updated_at', updated_plan.updated_at,
    'tag_ids', p_tag_ids
  ) INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    -- 全操作ロールバック
    RAISE EXCEPTION 'Failed to update plan: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 関数の説明
COMMENT ON FUNCTION update_plan_with_tags IS
  'Atomically updates a plan and its tag associations with activity logging.';

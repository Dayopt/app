-- DB関数のsearch_path固定
-- セキュリティ強化: search_path攻撃を防止
-- 参考: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- ============================================
-- Trigger関数
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_plan_instances_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_user_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_simple_session_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(CAST(REGEXP_REPLACE(session_number, '[^0-9]', '', 'g') AS INTEGER)),
    0
  ) + 1 INTO next_num
  FROM sessions
  WHERE user_id = NEW.user_id;

  NEW.session_number := next_num::TEXT;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_default_calendar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.is_default = false THEN
    IF NOT EXISTS (
      SELECT 1 FROM calendars
      WHERE user_id = NEW.user_id
      AND is_default = true
      AND id != NEW.id
    ) THEN
      NEW.is_default = true;
    END IF;
  ELSIF NEW.is_default = true THEN
    UPDATE calendars
    SET is_default = false
    WHERE user_id = NEW.user_id
    AND id != NEW.id
    AND is_default = true;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.calculate_and_check_tag_depth()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
declare
  calculated_depth smallint;
begin
  if new.parent_id is null then
    new.depth := 1;
  else
    select coalesce(depth, 1) + 1 into calculated_depth
    from tags
    where id = new.parent_id;

    new.depth := calculated_depth;
  end if;

  if (new.depth >= 4) then
    raise exception 'Tag depth cannot be 4 or greater';
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_tag_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM tags WHERE id = NEW.parent_id AND parent_id IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Maximum nesting depth is 1 level. Parent tag cannot be a child of another tag.';
    END IF;

    IF NEW.parent_id = NEW.id THEN
      RAISE EXCEPTION 'A tag cannot be its own parent.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_tag_has_children()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.parent_id IS NOT NULL AND (OLD.parent_id IS NULL OR OLD.parent_id != NEW.parent_id) THEN
    IF EXISTS (
      SELECT 1 FROM tags WHERE parent_id = NEW.id
    ) THEN
      RAISE EXCEPTION 'Cannot move a tag with children to be a child of another tag.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- ============================================
-- SECURITY DEFINER関数
-- ============================================

CREATE OR REPLACE FUNCTION public.cleanup_old_login_attempts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    DELETE FROM login_attempts
    WHERE attempt_time < NOW() - INTERVAL '90 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_auth_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    DELETE FROM auth_audit_logs
    WHERE created_at < NOW() - INTERVAL '365 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    DELETE FROM audit_logs
    WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_old_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  DELETE FROM notifications
  WHERE created_at < NOW() - INTERVAL '30 days'
    AND is_read = true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_password_reuse(p_user_id uuid, p_new_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_hash TEXT;
    v_is_reused BOOLEAN := FALSE;
BEGIN
    FOR v_hash IN
        SELECT password_hash
        FROM password_history
        WHERE user_id = p_user_id
        ORDER BY created_at DESC
        LIMIT 5
    LOOP
        IF crypt(p_new_password, v_hash) = v_hash THEN
            v_is_reused := TRUE;
            EXIT;
        END IF;
    END LOOP;

    RETURN v_is_reused;
END;
$function$;

CREATE OR REPLACE FUNCTION public.add_password_to_history(p_user_id uuid, p_new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    INSERT INTO password_history (user_id, password_hash)
    VALUES (p_user_id, crypt(p_new_password, gen_salt('bf', 10)));

    DELETE FROM password_history
    WHERE user_id = p_user_id
      AND id NOT IN (
          SELECT id
          FROM password_history
          WHERE user_id = p_user_id
          ORDER BY created_at DESC
          LIMIT 5
      );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_password_history_count(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM password_history
        WHERE user_id = p_user_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.use_recovery_code(p_user_id uuid, p_code_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_code_id UUID;
BEGIN
    SELECT id INTO v_code_id
    FROM mfa_recovery_codes
    WHERE user_id = p_user_id
      AND code_hash = p_code_hash
      AND used_at IS NULL
    FOR UPDATE
    LIMIT 1;

    IF v_code_id IS NULL THEN
        RETURN FALSE;
    END IF;

    UPDATE mfa_recovery_codes
    SET used_at = NOW()
    WHERE id = v_code_id;

    RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.count_unused_recovery_codes(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    RETURN (
        SELECT COUNT(*)::INTEGER
        FROM mfa_recovery_codes
        WHERE user_id = p_user_id
          AND used_at IS NULL
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.merge_tags(p_user_id uuid, p_source_tag_ids uuid[], p_target_tag_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  source_tag_id uuid;
  merged_count integer := 0;
  deleted_count integer := 0;
  promoted_count integer := 0;
  row_affected integer := 0;
  target_tag tags;
  result json;
BEGIN
  SELECT * INTO target_tag FROM tags
  WHERE id = p_target_tag_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target tag not found: %', p_target_tag_id;
  END IF;

  FOREACH source_tag_id IN ARRAY p_source_tag_ids LOOP
    IF NOT EXISTS (
      SELECT 1 FROM tags WHERE id = source_tag_id AND user_id = p_user_id
    ) THEN
      RAISE EXCEPTION 'Source tag not found: %', source_tag_id;
    END IF;

    IF source_tag_id = p_target_tag_id THEN
      RAISE EXCEPTION 'Cannot merge a tag with itself: %', source_tag_id;
    END IF;

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

    DELETE FROM plan_tags
    WHERE user_id = p_user_id AND tag_id = source_tag_id;

    UPDATE tags
    SET parent_id = NULL, updated_at = NOW()
    WHERE user_id = p_user_id AND parent_id = source_tag_id;

    GET DIAGNOSTICS row_affected = ROW_COUNT;
    promoted_count := promoted_count + row_affected;

    DELETE FROM tags WHERE id = source_tag_id AND user_id = p_user_id;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
  END LOOP;

  SELECT json_build_object(
    'success', true,
    'merged_associations', merged_count,
    'deleted_tags', deleted_count,
    'promoted_children', promoted_count,
    'target_tag', row_to_json(target_tag)
  ) INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to merge tags: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_plan_with_tags(
  p_user_id uuid,
  p_title text,
  p_description text DEFAULT NULL,
  p_scheduled_date date DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  new_plan plans;
  tag_id uuid;
  result json;
BEGIN
  INSERT INTO plans (user_id, title, description, scheduled_date)
  VALUES (p_user_id, p_title, p_description, p_scheduled_date)
  RETURNING * INTO new_plan;

  IF array_length(p_tag_ids, 1) > 0 THEN
    FOREACH tag_id IN ARRAY p_tag_ids LOOP
      INSERT INTO plan_tags (user_id, plan_id, tag_id)
      VALUES (p_user_id, new_plan.id, tag_id)
      ON CONFLICT (user_id, plan_id, tag_id) DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO plan_activities (plan_id, user_id, activity_type, details)
  VALUES (new_plan.id, p_user_id, 'created', jsonb_build_object(
    'title', p_title,
    'tag_count', COALESCE(array_length(p_tag_ids, 1), 0)
  ));

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
    RAISE EXCEPTION 'Failed to create plan with tags: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_plan_with_tags(
  p_user_id uuid,
  p_plan_id uuid,
  p_title text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_scheduled_date date DEFAULT NULL,
  p_tag_ids uuid[] DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  updated_plan plans;
  tag_id uuid;
  result json;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM plans WHERE id = p_plan_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Plan not found or access denied: %', p_plan_id;
  END IF;

  UPDATE plans SET
    title = COALESCE(p_title, title),
    description = COALESCE(p_description, description),
    scheduled_date = COALESCE(p_scheduled_date, scheduled_date),
    updated_at = NOW()
  WHERE id = p_plan_id AND user_id = p_user_id
  RETURNING * INTO updated_plan;

  IF p_tag_ids IS NOT NULL THEN
    DELETE FROM plan_tags WHERE plan_id = p_plan_id AND user_id = p_user_id;

    IF array_length(p_tag_ids, 1) > 0 THEN
      FOREACH tag_id IN ARRAY p_tag_ids LOOP
        INSERT INTO plan_tags (user_id, plan_id, tag_id)
        VALUES (p_user_id, p_plan_id, tag_id)
        ON CONFLICT (user_id, plan_id, tag_id) DO NOTHING;
      END LOOP;
    END IF;
  END IF;

  INSERT INTO plan_activities (plan_id, user_id, activity_type, details)
  VALUES (p_plan_id, p_user_id, 'updated', jsonb_build_object(
    'title', p_title,
    'tag_count', COALESCE(array_length(p_tag_ids, 1), 0)
  ));

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
    RAISE EXCEPTION 'Failed to update plan: %', SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_plan_with_cleanup(p_user_id uuid, p_plan_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  plan_record plans;
  deleted_tags_count integer := 0;
  result json;
BEGIN
  SELECT * INTO plan_record FROM plans
  WHERE id = p_plan_id AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or access denied: %', p_plan_id;
  END IF;

  INSERT INTO plan_activities (plan_id, user_id, activity_type, details)
  VALUES (p_plan_id, p_user_id, 'deleted', jsonb_build_object(
    'title', plan_record.title,
    'deleted_at', NOW()
  ));

  DELETE FROM plan_tags WHERE plan_id = p_plan_id AND user_id = p_user_id;
  GET DIAGNOSTICS deleted_tags_count = ROW_COUNT;

  DELETE FROM plans WHERE id = p_plan_id AND user_id = p_user_id;

  SELECT json_build_object(
    'success', true,
    'deleted_plan', row_to_json(plan_record),
    'deleted_tags_associations', deleted_tags_count
  ) INTO result;

  RETURN result;

EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Failed to delete plan: %', SQLERRM;
END;
$function$;

-- ============================================
-- 重複インデックスの削除
-- ============================================
DROP INDEX IF EXISTS public.idx_notification_preferences_user_id;

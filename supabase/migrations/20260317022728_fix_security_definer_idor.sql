-- SECURITY DEFINER関数のIDOR脆弱性修正
-- p_user_id引数を受け取る関数にauth.uid()チェックを追加し、
-- 他ユーザーのデータへのアクセスを防止する

-- ============================================================
-- increment_ai_usage: 他ユーザーのAI無料枠を消費される脆弱性
-- ============================================================
CREATE OR REPLACE FUNCTION public.increment_ai_usage(p_user_id UUID, p_month TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  INSERT INTO public.ai_usage (user_id, month, request_count)
  VALUES (p_user_id, p_month, 1)
  ON CONFLICT (user_id, month)
  DO UPDATE SET request_count = ai_usage.request_count + 1, updated_at = now();
END;
$$;

-- ============================================================
-- merge_tags: 他ユーザーのタグを破壊的にマージされる脆弱性
-- ============================================================
CREATE OR REPLACE FUNCTION public.merge_tags(
  p_user_id UUID,
  p_source_tag_id UUID,
  p_target_tag_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_migrated INTEGER := 0;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  -- entry_tagsを移行（重複がある場合はソース側を削除）
  WITH to_migrate AS (
    SELECT et.id, et.entry_id
    FROM public.entry_tags et
    WHERE et.tag_id = p_source_tag_id AND et.user_id = p_user_id
  ),
  existing AS (
    SELECT entry_id FROM public.entry_tags WHERE tag_id = p_target_tag_id AND user_id = p_user_id
  ),
  deleted AS (
    DELETE FROM public.entry_tags
    WHERE id IN (SELECT id FROM to_migrate WHERE entry_id IN (SELECT entry_id FROM existing))
  )
  UPDATE public.entry_tags
  SET tag_id = p_target_tag_id
  WHERE id IN (SELECT id FROM to_migrate WHERE entry_id NOT IN (SELECT entry_id FROM existing));

  GET DIAGNOSTICS v_migrated = ROW_COUNT;

  -- ソースタグを非アクティブ化
  UPDATE public.tags SET is_active = false WHERE id = p_source_tag_id AND user_id = p_user_id;

  RETURN json_build_object('migrated', v_migrated);
END;
$$;

-- ============================================================
-- use_recovery_code: 他ユーザーのリカバリーコードを消費される脆弱性
-- ============================================================
CREATE OR REPLACE FUNCTION public.use_recovery_code(p_user_id UUID, p_code_hash TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id UUID;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  SELECT id INTO v_code_id
  FROM public.mfa_recovery_codes
  WHERE user_id = p_user_id AND code_hash = p_code_hash AND used_at IS NULL;

  IF v_code_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.mfa_recovery_codes SET used_at = now() WHERE id = v_code_id;
  RETURN true;
END;
$$;

-- ============================================================
-- count_unused_recovery_codes: 他ユーザーの残コード数が漏洩する脆弱性
-- ============================================================
CREATE OR REPLACE FUNCTION public.count_unused_recovery_codes(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.mfa_recovery_codes
  WHERE user_id = p_user_id AND used_at IS NULL;
  RETURN v_count;
END;
$$;

-- ============================================================
-- Statistics Functions
-- ============================================================

-- get_plan_summary
CREATE OR REPLACE FUNCTION public.get_plan_summary(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_hours DOUBLE PRECISION;
  v_monthly_hours DOUBLE PRECISION;
  v_weekly_hours DOUBLE PRECISION;
  v_completed_count BIGINT;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN duration_minutes IS NOT NULL THEN duration_minutes / 60.0
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE 0
    END
  ), 0) INTO v_total_hours
  FROM public.entries WHERE user_id = p_user_id;

  SELECT COALESCE(SUM(
    CASE
      WHEN duration_minutes IS NOT NULL THEN duration_minutes / 60.0
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE 0
    END
  ), 0) INTO v_monthly_hours
  FROM public.entries WHERE user_id = p_user_id AND start_time >= date_trunc('month', now());

  SELECT COALESCE(SUM(
    CASE
      WHEN duration_minutes IS NOT NULL THEN duration_minutes / 60.0
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE 0
    END
  ), 0) INTO v_weekly_hours
  FROM public.entries WHERE user_id = p_user_id AND start_time >= date_trunc('week', now());

  SELECT COUNT(*) INTO v_completed_count
  FROM public.entries WHERE user_id = p_user_id AND reviewed_at IS NOT NULL;

  RETURN json_build_object(
    'total_hours', ROUND(v_total_hours::numeric, 1),
    'monthly_hours', ROUND(v_monthly_hours::numeric, 1),
    'weekly_hours', ROUND(v_weekly_hours::numeric, 1),
    'completed_count', v_completed_count
  );
END;
$$;

-- get_active_dates
CREATE OR REPLACE FUNCTION public.get_active_dates(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE(active_date DATE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT DISTINCT (start_time AT TIME ZONE 'UTC')::DATE
  FROM public.entries
  WHERE user_id = p_user_id AND start_time >= p_since AND start_time IS NOT NULL
  ORDER BY 1;
END;
$$;

-- get_daily_hours
CREATE OR REPLACE FUNCTION public.get_daily_hours(p_user_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE(date TEXT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT
    to_char((e.start_time AT TIME ZONE 'UTC')::DATE, 'YYYY-MM-DD'),
    COALESCE(SUM(
      CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes / 60.0
        WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
        ELSE 0
      END
    ), 0)
  FROM public.entries e
  WHERE e.user_id = p_user_id AND e.start_time >= p_start AND e.start_time < p_end AND e.start_time IS NOT NULL
  GROUP BY (e.start_time AT TIME ZONE 'UTC')::DATE
  ORDER BY 1;
END;
$$;

-- get_hourly_distribution
CREATE OR REPLACE FUNCTION public.get_hourly_distribution(p_user_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE(hour INT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT,
    COALESCE(SUM(
      CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes / 60.0
        WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
        ELSE 0
      END
    ), 0)
  FROM public.entries e
  WHERE e.user_id = p_user_id AND e.start_time >= p_start AND e.start_time < p_end AND e.start_time IS NOT NULL
  GROUP BY EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT
  ORDER BY 1;
END;
$$;

-- get_dow_distribution
CREATE OR REPLACE FUNCTION public.get_dow_distribution(p_user_id UUID, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE(dow INT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT
    EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT,
    COALESCE(SUM(
      CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes / 60.0
        WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
        ELSE 0
      END
    ), 0)
  FROM public.entries e
  WHERE e.user_id = p_user_id AND e.start_time >= p_start AND e.start_time < p_end AND e.start_time IS NOT NULL
  GROUP BY EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT
  ORDER BY 1;
END;
$$;

-- get_monthly_hours
CREATE OR REPLACE FUNCTION public.get_monthly_hours(p_user_id UUID, p_since TIMESTAMPTZ)
RETURNS TABLE(month TEXT, hours DOUBLE PRECISION)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('month', e.start_time AT TIME ZONE 'UTC'), 'YYYY-MM'),
    COALESCE(SUM(
      CASE
        WHEN e.duration_minutes IS NOT NULL THEN e.duration_minutes / 60.0
        WHEN e.start_time IS NOT NULL AND e.end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (e.end_time - e.start_time)) / 3600.0
        ELSE 0
      END
    ), 0)
  FROM public.entries e
  WHERE e.user_id = p_user_id AND e.start_time >= p_since AND e.start_time IS NOT NULL
  GROUP BY date_trunc('month', e.start_time AT TIME ZONE 'UTC')
  ORDER BY 1;
END;
$$;

-- get_total_time
CREATE OR REPLACE FUNCTION public.get_total_time(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total DOUBLE PRECISION;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN duration_minutes IS NOT NULL THEN duration_minutes / 60.0
      WHEN start_time IS NOT NULL AND end_time IS NOT NULL THEN EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0
      ELSE 0
    END
  ), 0) INTO v_total
  FROM public.entries WHERE user_id = p_user_id;
  RETURN json_build_object('total_hours', ROUND(v_total::numeric, 1));
END;
$$;

-- get_tag_stats
CREATE OR REPLACE FUNCTION public.get_tag_stats(p_user_id UUID)
RETURNS TABLE(tag_id UUID, entry_count BIGINT, last_used TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT et.tag_id, COUNT(*)::BIGINT, MAX(e.created_at)
  FROM public.entry_tags et
  JOIN public.entries e ON e.id = et.entry_id
  WHERE et.user_id = p_user_id
  GROUP BY et.tag_id;
END;
$$;

-- get_fulfillment_trend
CREATE OR REPLACE FUNCTION public.get_fulfillment_trend(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS TABLE(date TEXT, avg_score DOUBLE PRECISION, entry_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT
    to_char((e.start_time AT TIME ZONE 'UTC')::DATE, 'YYYY-MM-DD'),
    AVG(e.fulfillment_score)::DOUBLE PRECISION,
    COUNT(*)::BIGINT
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time >= p_start::TIMESTAMPTZ
    AND e.start_time < (p_end + 1)::TIMESTAMPTZ
    AND e.fulfillment_score IS NOT NULL
  GROUP BY (e.start_time AT TIME ZONE 'UTC')::DATE
  ORDER BY 1;
END;
$$;

-- get_energy_map
CREATE OR REPLACE FUNCTION public.get_energy_map(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS TABLE(hour INT, dow INT, avg_score DOUBLE PRECISION, entry_count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT,
    EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT,
    AVG(e.fulfillment_score)::DOUBLE PRECISION,
    COUNT(*)::BIGINT
  FROM public.entries e
  WHERE e.user_id = p_user_id
    AND e.start_time >= p_start::TIMESTAMPTZ
    AND e.start_time < (p_end + 1)::TIMESTAMPTZ
    AND e.fulfillment_score IS NOT NULL
  GROUP BY
    EXTRACT(HOUR FROM e.start_time AT TIME ZONE 'UTC')::INT,
    EXTRACT(DOW FROM e.start_time AT TIME ZONE 'UTC')::INT
  ORDER BY 1, 2;
END;
$$;

-- get_timeboxing_adherence
CREATE OR REPLACE FUNCTION public.get_timeboxing_adherence(p_user_id UUID, p_start DATE, p_end DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total BIGINT;
  v_reviewed BIGINT;
  v_on_time BIGINT;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ;

  SELECT COUNT(*) INTO v_reviewed
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND reviewed_at IS NOT NULL
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ;

  SELECT COUNT(*) INTO v_on_time
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND reviewed_at IS NOT NULL
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ
    AND (
      duration_minutes IS NOT NULL
      OR (start_time IS NOT NULL AND end_time IS NOT NULL)
    );

  RETURN json_build_object(
    'total_planned', v_total,
    'reviewed', v_reviewed,
    'on_time', v_on_time,
    'adherence_rate', CASE WHEN v_total > 0 THEN ROUND((v_reviewed::numeric / v_total) * 100, 1) ELSE 0 END
  );
END;
$$;

-- get_weekly_focus_score
CREATE OR REPLACE FUNCTION public.get_weekly_focus_score(p_user_id UUID, p_weeks INT DEFAULT 12)
RETURNS TABLE(week_start TEXT, focus_score DOUBLE PRECISION, entry_count BIGINT, unique_tags BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: user_id mismatch';
  END IF;

  RETURN QUERY
  SELECT
    to_char(date_trunc('week', e.start_time AT TIME ZONE 'UTC'), 'YYYY-MM-DD'),
    CASE
      WHEN COUNT(DISTINCT et.tag_id) = 0 THEN 0
      ELSE (1.0 / COUNT(DISTINCT et.tag_id)::DOUBLE PRECISION) * 100
    END,
    COUNT(DISTINCT e.id)::BIGINT,
    COUNT(DISTINCT et.tag_id)::BIGINT
  FROM public.entries e
  LEFT JOIN public.entry_tags et ON et.entry_id = e.id
  WHERE e.user_id = p_user_id
    AND e.start_time >= (now() - (p_weeks || ' weeks')::interval)
    AND e.start_time IS NOT NULL
  GROUP BY date_trunc('week', e.start_time AT TIME ZONE 'UTC')
  ORDER BY 1;
END;
$$;

-- NOTE: get_weekly_reflection_data と get_active_users_for_reflection は
-- service_role 専用（GRANT TO service_role）のため、変更不要

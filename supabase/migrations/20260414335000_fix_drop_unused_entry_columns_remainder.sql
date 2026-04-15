-- 20260414105000_drop_unused_entry_columns.sql が途中で失敗したため、
-- 残りの処理を冪等に再実行する。
-- ステートメント5: duration_minutes GENERATED COLUMN
-- ステートメント7: get_timeboxing_adherence パラメータ名変更（DROP+CREATEが必要）

-- duration_minutes を GENERATED ALWAYS AS に変換（未適用の場合のみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'entries'
      AND column_name = 'duration_minutes' AND is_generated = 'ALWAYS'
  ) THEN
    EXECUTE 'ALTER TABLE public.entries DROP COLUMN IF EXISTS duration_minutes';
    EXECUTE 'ALTER TABLE public.entries ADD COLUMN duration_minutes INTEGER GENERATED ALWAYS AS (
      CASE
        WHEN start_time IS NOT NULL AND end_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (end_time - start_time))::INTEGER / 60
        ELSE NULL
      END
    ) STORED';
  END IF;
END;
$$;

-- get_timeboxing_adherence: パラメータ名変更はCREATE OR REPLACEでは不可
DROP FUNCTION IF EXISTS public.get_timeboxing_adherence(UUID, DATE, DATE);

CREATE FUNCTION public.get_timeboxing_adherence(p_user_id UUID, p_start DATE, p_end DATE)
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
    AND fulfillment_score IS NOT NULL
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ;

  SELECT COUNT(*) INTO v_on_time
  FROM public.entries
  WHERE user_id = p_user_id
    AND origin = 'planned'
    AND fulfillment_score IS NOT NULL
    AND start_time >= p_start::TIMESTAMPTZ
    AND start_time < (p_end + 1)::TIMESTAMPTZ
    AND start_time IS NOT NULL
    AND end_time IS NOT NULL;

  RETURN json_build_object(
    'total_planned', v_total,
    'reviewed', v_reviewed,
    'on_time', v_on_time,
    'adherence_rate', CASE WHEN v_total > 0 THEN ROUND((v_reviewed::numeric / v_total) * 100, 1) ELSE 0 END
  );
END;
$$;

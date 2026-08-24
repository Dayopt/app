-- 20260824090000（Step 8 tag_id 剥離）で本体を書き換えた
-- private.confirm_day_plans_unserialized_v1 に、pre-existing の別バグを発見したので
-- 同 round で修正する。
--
-- 「1日まとめて確定」（confirm day）で生成される Record が activity_id をコピーして
-- いなかった（20260818140000 の activity 追加漏れ、tag_id 剥離とは無関係）。
-- 兄弟関数 private.record_plan_unserialized_v1（Plan を 1 件ずつ「記録する」）は
-- v_plan.activity_id を正しくコピーしており、confirm_day 経路だけが非対称だった。
--
-- 影響: ユーザーが 1 日分をまとめて確定すると、その日の Record は全部
-- activity_id = NULL になり、カレンダーで「アクティビティなし」表示・
-- アクティビティ別統計/セグメント集計から丸ごと脱落する。記録は過去の事実の
-- 凍結なので後から復元できない（temporal-constraints.md）。risk-reviewer
-- のレビューで検出（Refs #2352）。

CREATE OR REPLACE FUNCTION private.confirm_day_plans_unserialized_v1(p_user_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_confirmed_at timestamp with time zone DEFAULT now())
 RETURNS SETOF records
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_confirmed_at CONSTANT TIMESTAMPTZ := LEAST(
    COALESCE(p_confirmed_at, pg_catalog.now()),
    pg_catalog.now()
  );
  v_plan public.plans%ROWTYPE;
  v_record public.records%ROWTYPE;
BEGIN
  IF p_end_at IS NULL OR p_start_at IS NULL OR p_end_at <= p_start_at THEN
    RAISE EXCEPTION 'Confirm day range end must be after start'
      USING ERRCODE = 'DT003';
  END IF;
  IF p_end_at - p_start_at > INTERVAL '26 hours' THEN
    RAISE EXCEPTION 'Confirm day range must not exceed 26 hours'
      USING ERRCODE = '22023';
  END IF;

  FOR v_plan IN
    SELECT plan.*
    FROM public.plans AS plan
    WHERE plan.user_id = p_user_id
      AND plan.deleted_at IS NULL
      AND plan.skipped_at IS NULL
      AND plan.end_at <= v_confirmed_at
      AND plan.start_at >= p_start_at
      AND plan.start_at < p_end_at
    ORDER BY plan.start_at, plan.id
    FOR UPDATE OF plan
  LOOP
    CONTINUE WHEN EXISTS (
      SELECT 1
      FROM public.records AS record
      WHERE record.user_id = p_user_id
        AND record.plan_id = v_plan.id
        AND record.deleted_at IS NULL
    );

    INSERT INTO public.records (
      user_id,
      plan_id,
      activity_id,
      external_calendar_event_id,
      title,
      note,
      start_at,
      end_at,
      source,
      created_at,
      updated_at
    ) VALUES (
      v_plan.user_id,
      v_plan.id,
      v_plan.activity_id,
      NULL,
      v_plan.title,
      v_plan.note,
      v_plan.start_at,
      v_plan.end_at,
      'from_plan',
      v_confirmed_at,
      v_confirmed_at
    )
    RETURNING public.records.* INTO v_record;

    RETURN NEXT v_record;
  END LOOP;

  RETURN;
END;
$function$;

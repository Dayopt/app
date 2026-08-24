-- Step 8（tag_id 剥離）: Step 3 の additive-only 設計（`p_tag_id` を書き込み経路に
-- 残す判断）を巻き戻す。tags テーブル・plans.tag_id / records.tag_id 列そのものは
-- 残す（物理 drop は Step 9、issue #2175）。この migration は書き込み経路から
-- tag_id への参照だけを除去する。
--
-- 20260818140000 / 20260818140100 と同じ規律:
--   - CREATE OR REPLACE では引数を減らせない（overload になる）ため厳密シグネチャ DROP → CREATE
--   - DROP は ACL と SET 句（lock_timeout / statement_timeout）を道連れにするため末尾で再適用
--
-- 対象 15 関数（直接 14 + 間接 1、docs/projects/tag-model-replacement/overview.md
-- §Step 8（tag_id 剥離）の設計 が正本）:
--   - private.{create,update}_{plan,record}_unserialized_v1（4、p_tag_id 引数を削除）
--   - public.{create,update}_{plan,record}_command_v1（4、p_tag_id 引数を削除）
--   - public.apply_mcp_{plan,record}_{create,update}_v1（4、p_tag_id / p_tag_id_present 引数を削除）
--   - private.record_plan_unserialized_v1 / private.confirm_day_plans_unserialized_v1
--     （2、引数には無いが本体で v_plan.tag_id を records.tag_id へ直接コピーしている。
--      シグネチャ変更は無いので CREATE OR REPLACE で足りる）
--   - public.record_plan_command_v1（間接 1。自身に tag_id 参照は無く、
--     private.record_plan_unserialized_v1 を呼ぶだけなので変更不要）
--
-- ★ apply_mcp_* の冪等 digest から 'tagId' キーを削除する。20260818140100 の
--   activity 追加時は「キー名を変えると deploy 前に発行済みの receipt と digest が
--   一致せず再送クライアントが DM006 を踏む」ため 'tagId' を据え置いたが、あれは
--   シグネチャに互換性を残した ADD だった。今回は p_tag_id 引数そのものを削除する
--   互換性破壊であり、旧シグネチャでの呼び出しは digest 云々の前に呼び出し自体が
--   失敗する。据え置く理由が無いため他の削除引数と同様に取り除く。
--
-- ★ UPDATE の SET 句から `tag_id = p_tag_id` を単純に外す（NULL で消すのではない）。
--   引数が無くなった以上、次回編集以降 tag_id は書き込み対象から外れ、値は
--   この migration 適用時点の状態で凍結される（overview.md §Step 8 の表を参照）。
--
-- enforce_plan_tag_owner / enforce_record_tag_owner は tag_id を書く経路が無くなれば
-- 発火しなくなるため、列の存続とは独立してこの Step で trigger ごと drop する。

-- =============================================================================
-- private.create_plan_unserialized_v1
-- =============================================================================

DROP FUNCTION private.create_plan_unserialized_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid);

CREATE FUNCTION private.create_plan_unserialized_v1(p_user_id uuid, p_title text, p_note text, p_external_calendar_event_id uuid, p_source text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL)
 RETURNS SETOF plans
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  PERFORM public.assert_active_timeblock_activity_v1(p_user_id, p_activity_id);
  PERFORM public.assert_timeblock_external_event_v1(
    p_user_id,
    p_external_calendar_event_id
  );

  IF p_source <> ALL (ARRAY['manual', 'external_calendar', 'api']::TEXT[])
    OR ((p_source = 'external_calendar') IS DISTINCT FROM
        (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Plan source shape' USING ERRCODE = 'DT012';
  END IF;

  RETURN QUERY
  INSERT INTO public.plans (
    user_id, title, note, activity_id, external_calendar_event_id,
    source, start_at, end_at
  ) VALUES (
    p_user_id, p_title, p_note, p_activity_id, p_external_calendar_event_id,
    p_source, p_start_at, p_end_at
  )
  RETURNING public.plans.*;
END;
$function$;

-- =============================================================================
-- private.update_plan_unserialized_v1
-- =============================================================================

DROP FUNCTION private.update_plan_unserialized_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean);

CREATE FUNCTION private.update_plan_unserialized_v1(p_user_id uuid, p_plan_id uuid, p_expected_updated_at timestamp with time zone, p_title text, p_note text, p_external_calendar_event_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL, p_activity_id_present boolean DEFAULT false)
 RETURNS SETOF plans
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
  v_next_activity_id uuid;
BEGIN
  SELECT plan.*
  INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
    AND plan.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;

  -- present=false は「触らない」。旧バンドルの更新で activity_id を消さないための要。
  v_next_activity_id := CASE
    WHEN p_activity_id_present THEN p_activity_id
    ELSE v_plan.activity_id
  END;

  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  IF v_next_activity_id IS DISTINCT FROM v_plan.activity_id THEN
    PERFORM public.assert_active_timeblock_activity_v1(p_user_id, v_next_activity_id);
  END IF;
  IF p_external_calendar_event_id IS DISTINCT FROM v_plan.external_calendar_event_id THEN
    PERFORM public.assert_timeblock_external_event_v1(
      p_user_id,
      p_external_calendar_event_id
    );
  END IF;
  IF ((v_plan.source = 'external_calendar') IS DISTINCT FROM
      (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Plan source shape' USING ERRCODE = 'DT012';
  END IF;

  IF ROW(
    p_title, p_note, v_next_activity_id,
    p_external_calendar_event_id, p_start_at, p_end_at
  ) IS NOT DISTINCT FROM ROW(
    v_plan.title,
    v_plan.note,
    v_plan.activity_id,
    v_plan.external_calendar_event_id,
    v_plan.start_at,
    v_plan.end_at
  ) THEN
    RETURN NEXT v_plan;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.plans
  SET title = p_title,
      note = p_note,
      activity_id = v_next_activity_id,
      external_calendar_event_id = p_external_calendar_event_id,
      start_at = p_start_at,
      end_at = p_end_at
  WHERE id = p_plan_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.plans.*;
END;
$function$;

-- =============================================================================
-- private.create_record_unserialized_v1
-- =============================================================================

DROP FUNCTION private.create_record_unserialized_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid,text);

CREATE FUNCTION private.create_record_unserialized_v1(p_user_id uuid, p_title text, p_note text, p_plan_id uuid, p_external_calendar_event_id uuid, p_source text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL, p_fulfillment text DEFAULT NULL)
 RETURNS SETOF records
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  PERFORM public.assert_active_timeblock_activity_v1(p_user_id, p_activity_id);
  PERFORM public.assert_timeblock_external_event_v1(
    p_user_id,
    p_external_calendar_event_id
  );
  IF p_plan_id IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, p_plan_id);
  END IF;

  IF p_source IS NULL
    OR p_source <> ALL (ARRAY['manual', 'external_calendar', 'api']::TEXT[])
    OR ((p_source = 'external_calendar') IS DISTINCT FROM
        (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Record source shape' USING ERRCODE = 'DT012';
  END IF;

  IF p_fulfillment IS NOT NULL
    AND p_fulfillment <> ALL (ARRAY['low', 'medium', 'high']::TEXT[]) THEN
    RAISE EXCEPTION 'Invalid Record fulfillment value' USING ERRCODE = 'DT012';
  END IF;

  RETURN QUERY
  INSERT INTO public.records (
    user_id, title, note, activity_id, plan_id, external_calendar_event_id,
    source, start_at, end_at, fulfillment
  ) VALUES (
    p_user_id, p_title, p_note, p_activity_id, p_plan_id,
    p_external_calendar_event_id, p_source, p_start_at, p_end_at, p_fulfillment
  )
  RETURNING public.records.*;
END;
$function$;

-- =============================================================================
-- private.update_record_unserialized_v1
-- =============================================================================

DROP FUNCTION private.update_record_unserialized_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean);

CREATE FUNCTION private.update_record_unserialized_v1(p_user_id uuid, p_record_id uuid, p_expected_updated_at timestamp with time zone, p_title text, p_note text, p_plan_id uuid, p_external_calendar_event_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL, p_activity_id_present boolean DEFAULT false, p_fulfillment text DEFAULT NULL, p_fulfillment_present boolean DEFAULT false)
 RETURNS SETOF records
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_record public.records%ROWTYPE;
  v_next_activity_id uuid;
  v_next_fulfillment text;
BEGIN
  SELECT record.* INTO v_record
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;
  IF p_expected_updated_at IS NULL
    OR v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Record version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF v_record.source = 'auto_migrated' THEN
    RAISE EXCEPTION 'Migrated Record is immutable' USING ERRCODE = 'DT009';
  END IF;
  IF v_record.source = 'from_plan' AND p_plan_id IS NULL THEN
    RAISE EXCEPTION 'from_plan Record requires a Plan' USING ERRCODE = 'DT012';
  END IF;
  IF ((v_record.source = 'external_calendar') IS DISTINCT FROM
      (p_external_calendar_event_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'Invalid Record source shape' USING ERRCODE = 'DT012';
  END IF;

  -- present=false は「触らない」（旧バンドルの更新で activity_id / fulfillment を消さない）。
  v_next_activity_id := CASE
    WHEN p_activity_id_present THEN p_activity_id
    ELSE v_record.activity_id
  END;
  v_next_fulfillment := CASE
    WHEN p_fulfillment_present THEN p_fulfillment
    ELSE v_record.fulfillment
  END;

  IF p_fulfillment_present
    AND v_next_fulfillment IS NOT NULL
    AND v_next_fulfillment <> ALL (ARRAY['low', 'medium', 'high']::TEXT[]) THEN
    RAISE EXCEPTION 'Invalid Record fulfillment value' USING ERRCODE = 'DT012';
  END IF;

  IF p_plan_id IS DISTINCT FROM v_record.plan_id AND p_plan_id IS NOT NULL THEN
    PERFORM public.lock_recordable_plan_v1(p_user_id, p_plan_id);
  END IF;

  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  IF v_next_activity_id IS DISTINCT FROM v_record.activity_id THEN
    PERFORM public.assert_active_timeblock_activity_v1(p_user_id, v_next_activity_id);
  END IF;
  IF p_external_calendar_event_id IS DISTINCT FROM v_record.external_calendar_event_id THEN
    PERFORM public.assert_timeblock_external_event_v1(
      p_user_id,
      p_external_calendar_event_id
    );
  END IF;

  IF ROW(
    p_title,
    p_note,
    v_next_activity_id,
    p_plan_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at,
    v_next_fulfillment
  ) IS NOT DISTINCT FROM ROW(
    v_record.title,
    v_record.note,
    v_record.activity_id,
    v_record.plan_id,
    v_record.external_calendar_event_id,
    v_record.start_at,
    v_record.end_at,
    v_record.fulfillment
  ) THEN
    RETURN NEXT v_record;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.records
  SET title = p_title,
      note = p_note,
      activity_id = v_next_activity_id,
      plan_id = p_plan_id,
      external_calendar_event_id = p_external_calendar_event_id,
      start_at = p_start_at,
      end_at = p_end_at,
      fulfillment = v_next_fulfillment
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.records.*;
END;
$function$;

-- =============================================================================
-- private.record_plan_unserialized_v1（シグネチャ不変、本体の tag_id コピーだけ除去）
-- =============================================================================

CREATE OR REPLACE FUNCTION private.record_plan_unserialized_v1(p_user_id uuid, p_plan_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS SETOF records
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  v_plan := public.lock_recordable_plan_v1(p_user_id, p_plan_id);

  IF p_expected_updated_at IS NULL
    OR v_plan.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Plan version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.records AS record
    WHERE record.user_id = p_user_id
      AND record.plan_id = p_plan_id
      AND record.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Plan already has an active Record' USING ERRCODE = 'DT011';
  END IF;

  RETURN QUERY
  INSERT INTO public.records (
    user_id, title, note, activity_id, plan_id, external_calendar_event_id,
    source, start_at, end_at
  ) VALUES (
    p_user_id,
    v_plan.title,
    v_plan.note,
    v_plan.activity_id,
    v_plan.id,
    NULL,
    'from_plan',
    v_plan.start_at,
    v_plan.end_at
  )
  RETURNING public.records.*;
END;
$function$;

-- =============================================================================
-- private.confirm_day_plans_unserialized_v1（シグネチャ不変、本体の tag_id コピーだけ除去）
-- =============================================================================

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

-- =============================================================================
-- public.create_plan_command_v1
-- =============================================================================

DROP FUNCTION public.create_plan_command_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid);

CREATE FUNCTION public.create_plan_command_v1(p_user_id uuid, p_title text, p_note text, p_external_calendar_event_id uuid, p_source text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '30s'
AS $function$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.create_plan_unserialized_v1(
    p_user_id,
    p_title,
    p_note,
    p_external_calendar_event_id,
    p_source,
    p_start_at,
    p_end_at,
    p_activity_id
  ) AS implementation;
END;
$function$;

-- =============================================================================
-- public.update_plan_command_v1
-- =============================================================================

DROP FUNCTION public.update_plan_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean);

CREATE FUNCTION public.update_plan_command_v1(p_user_id uuid, p_plan_id uuid, p_expected_updated_at timestamp with time zone, p_title text, p_note text, p_external_calendar_event_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid, p_activity_id_present boolean DEFAULT false)
 RETURNS SETOF plans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '30s'
AS $function$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.update_plan_unserialized_v1(
    p_user_id,
    p_plan_id,
    p_expected_updated_at,
    p_title,
    p_note,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at,
    p_activity_id,
    p_activity_id_present
  ) AS implementation;
END;
$function$;

-- =============================================================================
-- public.create_record_command_v1
-- =============================================================================

DROP FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid,text);

CREATE FUNCTION public.create_record_command_v1(p_user_id uuid, p_title text, p_note text, p_plan_id uuid, p_external_calendar_event_id uuid, p_source text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid, p_fulfillment text DEFAULT NULL::text)
 RETURNS SETOF records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '30s'
AS $function$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.create_record_unserialized_v1(
    p_user_id,
    p_title,
    p_note,
    p_plan_id,
    p_external_calendar_event_id,
    p_source,
    p_start_at,
    p_end_at,
    p_activity_id,
    p_fulfillment
  ) AS implementation;
END;
$function$;

-- =============================================================================
-- public.update_record_command_v1
-- =============================================================================

DROP FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean);

CREATE FUNCTION public.update_record_command_v1(p_user_id uuid, p_record_id uuid, p_expected_updated_at timestamp with time zone, p_title text, p_note text, p_plan_id uuid, p_external_calendar_event_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid, p_activity_id_present boolean DEFAULT false, p_fulfillment text DEFAULT NULL::text, p_fulfillment_present boolean DEFAULT false)
 RETURNS SETOF records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '30s'
AS $function$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);
  RETURN QUERY
  SELECT implementation.*
  FROM private.update_record_unserialized_v1(
    p_user_id,
    p_record_id,
    p_expected_updated_at,
    p_title,
    p_note,
    p_plan_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at,
    p_activity_id,
    p_activity_id_present,
    p_fulfillment,
    p_fulfillment_present
  ) AS implementation;
END;
$function$;

-- =============================================================================
-- public.apply_mcp_plan_create_v1
-- =============================================================================

DROP FUNCTION public.apply_mcp_plan_create_v1(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,uuid);

CREATE FUNCTION public.apply_mcp_plan_create_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_title text, p_note text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL)
 RETURNS TABLE(schema_version smallint, operation_id uuid, resource_type text, resource_id uuid, version timestamp with time zone, deleted_at timestamp with time zone, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_client_id TEXT;
  v_authority_expires_at TIMESTAMPTZ;
  v_decision_at TIMESTAMPTZ;
  v_request_digest BYTEA;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
  v_plan public.plans%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_start_at IS NULL
    OR p_end_at IS NULL THEN
    RAISE EXCEPTION 'MCP Plan create input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT pg_catalog.isfinite(p_start_at) OR NOT pg_catalog.isfinite(p_end_at) THEN
    RAISE EXCEPTION 'MCP Plan timestamps must be finite'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    auth_result.user_id,
    auth_result.client_id,
    auth_result.authority_expires_at
  INTO v_user_id, v_client_id, v_authority_expires_at
  FROM private.authorize_mcp_mutation_v1(
    p_connection_id,
    p_access_token_id,
    'write:plans'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'plans.create'::TEXT,
    pg_catalog.jsonb_build_object(
      'title', p_title,
      'note', p_note,
      'externalCalendarEventId', NULL::UUID,
      'source', 'api',
      'startAt', pg_catalog.to_char(
        p_start_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'endAt', pg_catalog.to_char(
        p_end_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    )
    || CASE
         WHEN p_activity_id IS NULL THEN '{}'::JSONB
         ELSE pg_catalog.jsonb_build_object('activityId', p_activity_id)
       END
  );

  SELECT replay_receipt.*
  INTO v_receipt
  FROM private.resolve_mcp_mutation_replay_v1(
    v_user_id,
    v_client_id,
    p_operation_id,
    'plans.create'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'plan'::TEXT
  ) AS replay_receipt;

  v_decision_at := pg_catalog.clock_timestamp();
  IF v_authority_expires_at <= v_decision_at THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP mutation receipt invariant failed'
        USING ERRCODE = 'DM007';
    END IF;

    RETURN QUERY SELECT
      v_receipt.envelope_version,
      v_receipt.operation_id,
      v_receipt.resource_type,
      v_receipt.resource_id,
      v_receipt.resource_version,
      v_receipt.resource_deleted_at,
      true;
    RETURN;
  END IF;

  -- Replay is intentionally resolved before current domain validation so a
  -- completed historical call remains replayable after time or activity changes.
  IF p_end_at <= v_decision_at THEN
    RAISE EXCEPTION 'Plans must end in the future'
      USING ERRCODE = 'DT004';
  END IF;

  SELECT plan.*
  INTO v_plan
  FROM public.create_plan_command_v1(
    v_user_id,
    p_title,
    p_note,
    NULL::UUID,
    'api'::TEXT,
    p_start_at,
    p_end_at,
    p_activity_id
  ) AS plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  INSERT INTO public.mcp_mutation_receipts (
    user_id,
    client_id,
    operation_id,
    origin_connection_id,
    envelope_version,
    tool_name,
    request_digest,
    resource_type,
    resource_id,
    resource_version,
    resource_deleted_at
  ) VALUES (
    v_user_id,
    v_client_id,
    p_operation_id,
    p_connection_id,
    1,
    'plans.create',
    v_request_digest,
    'plan',
    v_plan.id,
    v_plan.updated_at,
    v_plan.deleted_at
  )
  RETURNING * INTO v_receipt;

  RETURN QUERY SELECT
    v_receipt.envelope_version,
    v_receipt.operation_id,
    v_receipt.resource_type,
    v_receipt.resource_id,
    v_receipt.resource_version,
    v_receipt.resource_deleted_at,
    false;
END;
$function$;

-- =============================================================================
-- public.apply_mcp_plan_update_v1
-- =============================================================================

DROP FUNCTION public.apply_mcp_plan_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid);

CREATE FUNCTION public.apply_mcp_plan_update_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_plan_id uuid, p_expected_updated_at timestamp with time zone, p_title_present boolean, p_title text, p_note_present boolean, p_note text, p_start_at_present boolean, p_start_at timestamp with time zone, p_end_at_present boolean, p_end_at timestamp with time zone, p_activity_id_present boolean DEFAULT false, p_activity_id uuid DEFAULT NULL)
 RETURNS TABLE(schema_version smallint, operation_id uuid, resource_type text, resource_id uuid, version timestamp with time zone, deleted_at timestamp with time zone, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_client_id TEXT;
  v_authority_expires_at TIMESTAMPTZ;
  v_decision_at TIMESTAMPTZ;
  v_normalized_args JSONB;
  v_request_digest BYTEA;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
  v_existing public.plans%ROWTYPE;
  v_plan public.plans%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_plan_id IS NULL
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'MCP Plan update input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF p_title_present IS NULL
    OR p_note_present IS NULL
    OR p_activity_id_present IS NULL
    OR p_start_at_present IS NULL
    OR p_end_at_present IS NULL THEN
    RAISE EXCEPTION 'MCP Plan update field presence is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT p_title_present
    AND NOT p_note_present
    AND NOT p_activity_id_present
    AND NOT p_start_at_present
    AND NOT p_end_at_present THEN
    RAISE EXCEPTION 'MCP Plan update patch is empty'
      USING ERRCODE = '22023';
  END IF;

  -- A false presence flag has exactly one representation: a null value.
  -- Explicit null remains meaningful only for note.
  IF (p_title_present AND p_title IS NULL)
    OR (NOT p_title_present AND p_title IS NOT NULL)
    OR (NOT p_note_present AND p_note IS NOT NULL)
    OR (NOT p_activity_id_present AND p_activity_id IS NOT NULL)
    OR (p_start_at_present AND p_start_at IS NULL)
    OR (NOT p_start_at_present AND p_start_at IS NOT NULL)
    OR (p_end_at_present AND p_end_at IS NULL)
    OR (NOT p_end_at_present AND p_end_at IS NOT NULL) THEN
    RAISE EXCEPTION 'MCP Plan update patch shape is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT pg_catalog.isfinite(p_expected_updated_at)
    OR (p_start_at_present AND NOT pg_catalog.isfinite(p_start_at))
    OR (p_end_at_present AND NOT pg_catalog.isfinite(p_end_at)) THEN
    RAISE EXCEPTION 'MCP Plan update timestamps must be finite'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    auth_result.user_id,
    auth_result.client_id,
    auth_result.authority_expires_at
  INTO v_user_id, v_client_id, v_authority_expires_at
  FROM private.authorize_mcp_mutation_v1(
    p_connection_id,
    p_access_token_id,
    'write:plans'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  -- Key presence is part of the public request. Omitted fields are preserved;
  -- explicit null clears note. Internal source/calendar bindings are not
  -- public mutation inputs and therefore are not included in this digest.
  v_normalized_args := pg_catalog.jsonb_build_object(
    'planId', p_plan_id,
    'expectedUpdatedAt', pg_catalog.to_char(
      p_expected_updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );

  IF p_title_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('title', p_title);
  END IF;
  IF p_note_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('note', p_note);
  END IF;
  IF p_activity_id_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('activityId', p_activity_id);
  END IF;
  IF p_start_at_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object(
        'startAt', pg_catalog.to_char(
          p_start_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      );
  END IF;
  IF p_end_at_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object(
        'endAt', pg_catalog.to_char(
          p_end_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      );
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'plans.update'::TEXT,
    v_normalized_args
  );

  SELECT replay_receipt.*
  INTO v_receipt
  FROM private.resolve_mcp_mutation_replay_v1(
    v_user_id,
    v_client_id,
    p_operation_id,
    'plans.update'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'plan'::TEXT
  ) AS replay_receipt;

  v_decision_at := pg_catalog.clock_timestamp();
  IF v_authority_expires_at <= v_decision_at THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_id IS DISTINCT FROM p_plan_id
      OR v_receipt.resource_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP mutation receipt invariant failed'
        USING ERRCODE = 'DM007';
    END IF;

    RETURN QUERY SELECT
      v_receipt.envelope_version,
      v_receipt.operation_id,
      v_receipt.resource_type,
      v_receipt.resource_id,
      v_receipt.resource_version,
      v_receipt.resource_deleted_at,
      true;
    RETURN;
  END IF;

  -- Expand the partial patch while holding the same Plan row lock that normal
  -- UI commands use. Source and external-calendar binding always pass through.
  SELECT plan.*
  INTO v_existing
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = v_user_id
    AND plan.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;

  -- The Plan lock itself can wait after authorization. Recheck the wall-clock
  -- deadline before invoking the authoritative domain command.
  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  SELECT plan.*
  INTO v_plan
  FROM public.update_plan_command_v1(
    v_user_id,
    p_plan_id,
    p_expected_updated_at,
    CASE WHEN p_title_present THEN p_title ELSE v_existing.title END,
    CASE WHEN p_note_present THEN p_note ELSE v_existing.note END,
    v_existing.external_calendar_event_id,
    CASE WHEN p_start_at_present THEN p_start_at ELSE v_existing.start_at END,
    CASE WHEN p_end_at_present THEN p_end_at ELSE v_existing.end_at END,
    CASE WHEN p_activity_id_present THEN p_activity_id ELSE v_existing.activity_id END,
    TRUE
  ) AS plan;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  -- The domain command can wait on an overlap lock after the Plan lock.
  -- Rechecking here makes an expired authority roll back both the Plan update
  -- and the receipt in this same transaction.
  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  INSERT INTO public.mcp_mutation_receipts (
    user_id,
    client_id,
    operation_id,
    origin_connection_id,
    envelope_version,
    tool_name,
    request_digest,
    resource_type,
    resource_id,
    resource_version,
    resource_deleted_at
  ) VALUES (
    v_user_id,
    v_client_id,
    p_operation_id,
    p_connection_id,
    1,
    'plans.update',
    v_request_digest,
    'plan',
    v_plan.id,
    v_plan.updated_at,
    v_plan.deleted_at
  )
  RETURNING * INTO v_receipt;

  RETURN QUERY SELECT
    v_receipt.envelope_version,
    v_receipt.operation_id,
    v_receipt.resource_type,
    v_receipt.resource_id,
    v_receipt.resource_version,
    v_receipt.resource_deleted_at,
    false;
END;
$function$;

-- =============================================================================
-- public.apply_mcp_record_create_v1
-- =============================================================================

DROP FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid,text);

CREATE FUNCTION public.apply_mcp_record_create_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_title text, p_note text, p_plan_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL, p_fulfillment text DEFAULT NULL)
 RETURNS TABLE(schema_version smallint, operation_id uuid, resource_type text, resource_id uuid, version timestamp with time zone, deleted_at timestamp with time zone, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_client_id TEXT;
  v_authority_expires_at TIMESTAMPTZ;
  v_request_digest BYTEA;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
  v_record public.records%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_start_at IS NULL
    OR p_end_at IS NULL THEN
    RAISE EXCEPTION 'MCP Record create input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT pg_catalog.isfinite(p_start_at) OR NOT pg_catalog.isfinite(p_end_at) THEN
    RAISE EXCEPTION 'MCP Record timestamps must be finite'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    auth_result.user_id,
    auth_result.client_id,
    auth_result.authority_expires_at
  INTO v_user_id, v_client_id, v_authority_expires_at
  FROM private.authorize_mcp_mutation_v1(
    p_connection_id,
    p_access_token_id,
    'write:records'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'records.create'::TEXT,
    pg_catalog.jsonb_build_object(
      'title', p_title,
      'note', p_note,
      'planId', p_plan_id,
      'externalCalendarEventId', NULL::UUID,
      'source', 'api',
      'startAt', pg_catalog.to_char(
        p_start_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ),
      'endAt', pg_catalog.to_char(
        p_end_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      )
    )
    || CASE
         WHEN p_activity_id IS NULL THEN '{}'::JSONB
         ELSE pg_catalog.jsonb_build_object('activityId', p_activity_id)
       END
    || CASE
         WHEN p_fulfillment IS NULL THEN '{}'::JSONB
         ELSE pg_catalog.jsonb_build_object('fulfillment', p_fulfillment)
       END
  );

  SELECT replay_receipt.*
  INTO v_receipt
  FROM private.resolve_mcp_mutation_replay_v1(
    v_user_id,
    v_client_id,
    p_operation_id,
    'records.create'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'record'::TEXT
  ) AS replay_receipt;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP mutation receipt invariant failed'
        USING ERRCODE = 'DM007';
    END IF;

    RETURN QUERY SELECT
      v_receipt.envelope_version,
      v_receipt.operation_id,
      v_receipt.resource_type,
      v_receipt.resource_id,
      v_receipt.resource_version,
      v_receipt.resource_deleted_at,
      true;
    RETURN;
  END IF;

  SELECT record.*
  INTO v_record
  FROM public.create_record_command_v1(
    v_user_id,
    p_title,
    p_note,
    p_plan_id,
    NULL::UUID,
    'api'::TEXT,
    p_start_at,
    p_end_at,
    p_activity_id,
    p_fulfillment
  ) AS record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_record.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'MCP mutation result invariant failed'
      USING ERRCODE = 'DM007';
  END IF;

  -- Record create may wait on a linked Plan row and the Record exclusion
  -- constraint. Expiry after either wait rolls back the row and receipt.
  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  INSERT INTO public.mcp_mutation_receipts (
    user_id,
    client_id,
    operation_id,
    origin_connection_id,
    envelope_version,
    tool_name,
    request_digest,
    resource_type,
    resource_id,
    resource_version,
    resource_deleted_at
  ) VALUES (
    v_user_id,
    v_client_id,
    p_operation_id,
    p_connection_id,
    1,
    'records.create',
    v_request_digest,
    'record',
    v_record.id,
    v_record.updated_at,
    v_record.deleted_at
  )
  RETURNING * INTO v_receipt;

  RETURN QUERY SELECT
    v_receipt.envelope_version,
    v_receipt.operation_id,
    v_receipt.resource_type,
    v_receipt.resource_id,
    v_receipt.resource_version,
    v_receipt.resource_deleted_at,
    false;
END;
$function$;

-- =============================================================================
-- public.apply_mcp_record_update_v1
-- =============================================================================

DROP FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid,boolean,text);

CREATE FUNCTION public.apply_mcp_record_update_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_record_id uuid, p_expected_updated_at timestamp with time zone, p_title_present boolean, p_title text, p_note_present boolean, p_note text, p_start_at_present boolean, p_start_at timestamp with time zone, p_end_at_present boolean, p_end_at timestamp with time zone, p_activity_id_present boolean DEFAULT false, p_activity_id uuid DEFAULT NULL, p_fulfillment_present boolean DEFAULT false, p_fulfillment text DEFAULT NULL)
 RETURNS TABLE(schema_version smallint, operation_id uuid, resource_type text, resource_id uuid, version timestamp with time zone, deleted_at timestamp with time zone, replayed boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_user_id UUID;
  v_client_id TEXT;
  v_authority_expires_at TIMESTAMPTZ;
  v_normalized_args JSONB;
  v_request_digest BYTEA;
  v_receipt public.mcp_mutation_receipts%ROWTYPE;
  v_existing public.records%ROWTYPE;
  v_record public.records%ROWTYPE;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_connection_id IS NULL
    OR p_access_token_id IS NULL
    OR p_operation_id IS NULL
    OR p_record_id IS NULL
    OR p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'MCP Record update input is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF p_title_present IS NULL
    OR p_note_present IS NULL
    OR p_activity_id_present IS NULL
    OR p_fulfillment_present IS NULL
    OR p_start_at_present IS NULL
    OR p_end_at_present IS NULL THEN
    RAISE EXCEPTION 'MCP Record update field presence is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT p_title_present
    AND NOT p_note_present
    AND NOT p_activity_id_present
    AND NOT p_fulfillment_present
    AND NOT p_start_at_present
    AND NOT p_end_at_present THEN
    RAISE EXCEPTION 'MCP Record update patch is empty'
      USING ERRCODE = '22023';
  END IF;

  IF (p_title_present AND p_title IS NULL)
    OR (NOT p_title_present AND p_title IS NOT NULL)
    OR (NOT p_note_present AND p_note IS NOT NULL)
    OR (NOT p_activity_id_present AND p_activity_id IS NOT NULL)
    OR (NOT p_fulfillment_present AND p_fulfillment IS NOT NULL)
    OR (p_start_at_present AND p_start_at IS NULL)
    OR (NOT p_start_at_present AND p_start_at IS NOT NULL)
    OR (p_end_at_present AND p_end_at IS NULL)
    OR (NOT p_end_at_present AND p_end_at IS NOT NULL) THEN
    RAISE EXCEPTION 'MCP Record update patch shape is invalid'
      USING ERRCODE = '22023';
  END IF;

  IF NOT pg_catalog.isfinite(p_expected_updated_at)
    OR (p_start_at_present AND NOT pg_catalog.isfinite(p_start_at))
    OR (p_end_at_present AND NOT pg_catalog.isfinite(p_end_at)) THEN
    RAISE EXCEPTION 'MCP Record update timestamps must be finite'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    auth_result.user_id,
    auth_result.client_id,
    auth_result.authority_expires_at
  INTO v_user_id, v_client_id, v_authority_expires_at
  FROM private.authorize_mcp_mutation_v1(
    p_connection_id,
    p_access_token_id,
    'write:records'::TEXT,
    p_operation_id
  ) AS auth_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  v_normalized_args := pg_catalog.jsonb_build_object(
    'recordId', p_record_id,
    'expectedUpdatedAt', pg_catalog.to_char(
      p_expected_updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    )
  );

  IF p_title_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('title', p_title);
  END IF;
  IF p_note_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('note', p_note);
  END IF;
  IF p_activity_id_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('activityId', p_activity_id);
  END IF;
  IF p_fulfillment_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('fulfillment', p_fulfillment);
  END IF;
  IF p_start_at_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object(
        'startAt', pg_catalog.to_char(
          p_start_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      );
  END IF;
  IF p_end_at_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object(
        'endAt', pg_catalog.to_char(
          p_end_at AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      );
  END IF;

  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'records.update'::TEXT,
    v_normalized_args
  );

  SELECT replay_receipt.*
  INTO v_receipt
  FROM private.resolve_mcp_mutation_replay_v1(
    v_user_id,
    v_client_id,
    p_operation_id,
    'records.update'::TEXT,
    v_request_digest,
    1::SMALLINT,
    'record'::TEXT
  ) AS replay_receipt;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  IF FOUND THEN
    IF v_receipt.resource_id IS DISTINCT FROM p_record_id
      OR v_receipt.resource_deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'MCP mutation receipt invariant failed'
        USING ERRCODE = 'DM007';
    END IF;

    RETURN QUERY SELECT
      v_receipt.envelope_version,
      v_receipt.operation_id,
      v_receipt.resource_type,
      v_receipt.resource_id,
      v_receipt.resource_version,
      v_receipt.resource_deleted_at,
      true;
    RETURN;
  END IF;

  SELECT record.*
  INTO v_existing
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = v_user_id
    AND record.deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  -- Public MCP updates cannot alter Plan attribution, source, or external
  -- calendar provenance. Those values pass through from the locked row.
  SELECT record.*
  INTO v_record
  FROM public.update_record_command_v1(
    v_user_id,
    p_record_id,
    p_expected_updated_at,
    CASE WHEN p_title_present THEN p_title ELSE v_existing.title END,
    CASE WHEN p_note_present THEN p_note ELSE v_existing.note END,
    v_existing.plan_id,
    v_existing.external_calendar_event_id,
    CASE WHEN p_start_at_present THEN p_start_at ELSE v_existing.start_at END,
    CASE WHEN p_end_at_present THEN p_end_at ELSE v_existing.end_at END,
    CASE WHEN p_activity_id_present THEN p_activity_id ELSE v_existing.activity_id END,
    TRUE,
    CASE WHEN p_fulfillment_present THEN p_fulfillment ELSE v_existing.fulfillment END,
    TRUE
  ) AS record;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record command returned no row'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_record.id IS DISTINCT FROM p_record_id
    OR v_record.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'MCP mutation result invariant failed'
      USING ERRCODE = 'DM007';
  END IF;

  IF v_authority_expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'MCP authorization is no longer active'
      USING ERRCODE = 'DM004';
  END IF;

  INSERT INTO public.mcp_mutation_receipts (
    user_id,
    client_id,
    operation_id,
    origin_connection_id,
    envelope_version,
    tool_name,
    request_digest,
    resource_type,
    resource_id,
    resource_version,
    resource_deleted_at
  ) VALUES (
    v_user_id,
    v_client_id,
    p_operation_id,
    p_connection_id,
    1,
    'records.update',
    v_request_digest,
    'record',
    v_record.id,
    v_record.updated_at,
    v_record.deleted_at
  )
  RETURNING * INTO v_receipt;

  RETURN QUERY SELECT
    v_receipt.envelope_version,
    v_receipt.operation_id,
    v_receipt.resource_type,
    v_receipt.resource_id,
    v_receipt.resource_version,
    v_receipt.resource_deleted_at,
    false;
END;
$function$;

-- =============================================================================
-- ACL の再適用（DROP は既存 GRANT/REVOKE を道連れにするため）
-- =============================================================================

REVOKE ALL ON FUNCTION private.create_plan_unserialized_v1(uuid,text,text,uuid,text,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_plan_unserialized_v1(uuid,uuid,timestamptz,text,text,uuid,timestamptz,timestamptz,uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.create_record_unserialized_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_record_unserialized_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.create_plan_command_v1(uuid,text,text,uuid,text,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_plan_command_v1(uuid,text,text,uuid,text,timestamptz,timestamptz,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.update_plan_command_v1(uuid,uuid,timestamptz,text,text,uuid,timestamptz,timestamptz,uuid,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_plan_command_v1(uuid,uuid,timestamptz,text,text,uuid,timestamptz,timestamptz,uuid,boolean)
  TO service_role;
REVOKE ALL ON FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,text,timestamptz,timestamptz,uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.apply_mcp_plan_create_v1(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_plan_create_v1(uuid,uuid,uuid,text,text,timestamptz,timestamptz,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.apply_mcp_plan_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_plan_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,timestamptz,boolean,timestamptz,boolean,uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,timestamptz,boolean,timestamptz,boolean,uuid,boolean,text)
  TO service_role;

-- =============================================================================
-- tag 専有 trigger の撤去。列がまだ残っていても tag_id を書く経路が無くなれば
-- `UPDATE OF tag_id` 条件は発火しなくなるため、この Step で trigger ごと drop する。
-- =============================================================================

DROP TRIGGER enforce_plan_tag_owner ON public.plans;
DROP FUNCTION public.enforce_plan_tag_owner();

DROP TRIGGER enforce_record_tag_owner ON public.records;
DROP FUNCTION public.enforce_record_tag_owner();

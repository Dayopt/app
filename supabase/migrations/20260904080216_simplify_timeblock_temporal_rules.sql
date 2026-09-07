-- 時刻ルールを 1 本に減らす。
--
-- これまで Plan には「未来にしか作れない（DT004）」「過去になったら時刻を変更
-- できない（DT006）」「未来のうちは skip できない（DT007）」「未来のうちは
-- Record を紐付けられない（DT013）」という 4 つの規則が積み上がっていた。実運用
-- では過去の予定を実際の時間へ訂正できないことが強い摩擦になっており、削除は
-- 無条件にできるのに時刻の訂正だけができない非対称も説明できなかった。
--
-- 変更後に残る時刻の規則は次の 2 つだけ:
--   * end_at > start_at（DT003）— Plan / Record 共通の順序チェック
--   * Record は未来に終われない（DT005、validate_record_temporal_write_v1）
--
-- Plan は時間軸のどこにでも置け、Record だけが過去に縛られる。「未来 Plan」と
-- いう特別扱いの状態は概念ごと無くなる。DT004 / DT006 / DT007 / DT013 は
-- どの関数からも送出されなくなる（アプリ側の写像も同じ PR で削除する）。
--
-- 各関数の本体は適用済みローカル DB の pg_get_functiondef 出力を起点にしており、
-- 上記の guard ブロックだけを取り除いている。DT001 / DT002 / DT008 / DT009 /
-- DT011 など時刻と無関係な不変条件は一切触っていない。
--
-- validate_plan_temporal_write_v1 は DT004 / DT006 を落とすと順序チェックだけが
-- 残るため、未使用になる v_now ごと畳んで書き直している。trigger 定義
-- （BEFORE INSERT OR UPDATE OF start_at, end_at ON public.plans）は据え置き。

CREATE OR REPLACE FUNCTION public.validate_plan_temporal_write_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.end_at <= NEW.start_at THEN
    RAISE EXCEPTION 'Plan end must be after start' USING ERRCODE = 'DT003';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.restore_record_unserialized_v1(p_user_id uuid, p_record_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS SETOF records
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
  v_plan_hint UUID;
  v_record public.records%ROWTYPE;
BEGIN
  SELECT record.plan_id
  INTO v_plan_hint
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;

  IF v_plan_hint IS NOT NULL THEN
    SELECT plan.*
    INTO v_plan
    FROM public.plans AS plan
    WHERE plan.id = v_plan_hint
      AND plan.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
    END IF;
    IF v_plan.skipped_at IS NOT NULL THEN
      RAISE EXCEPTION 'Skipped Plans cannot have linked Records'
        USING ERRCODE = 'DT008';
    END IF;
  END IF;

  SELECT record.*
  INTO v_record
  FROM public.records AS record
  WHERE record.id = p_record_id
    AND record.user_id = p_user_id
    AND record.deleted_at IS NOT NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Record not found' USING ERRCODE = 'DT001';
  END IF;
  IF v_record.plan_id IS DISTINCT FROM v_plan_hint
    OR p_expected_updated_at IS NULL
    OR v_record.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Record version conflict' USING ERRCODE = 'DT002';
  END IF;
  IF v_record.source = 'auto_migrated' THEN
    RAISE EXCEPTION 'Migrated Record is immutable' USING ERRCODE = 'DT009';
  END IF;

  RETURN QUERY
  UPDATE public.records
  SET deleted_at = NULL
  WHERE id = p_record_id
    AND user_id = p_user_id
    AND deleted_at IS NOT NULL
  RETURNING public.records.*;
END;
$function$
;

CREATE OR REPLACE FUNCTION private.set_plan_skipped_unserialized_v1(p_user_id uuid, p_plan_id uuid, p_expected_updated_at timestamp with time zone, p_skipped boolean)
 RETURNS SETOF plans
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  IF p_skipped IS NULL THEN
    RAISE EXCEPTION 'Skipped state is required' USING ERRCODE = '22023';
  END IF;

  SELECT plan.* INTO v_plan
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

  IF p_skipped AND EXISTS (
    SELECT 1 FROM public.records AS record
    WHERE record.user_id = p_user_id
      AND record.plan_id = p_plan_id
      AND record.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Plan already has an active Record' USING ERRCODE = 'DT011';
  END IF;

  IF (p_skipped AND v_plan.skipped_at IS NOT NULL)
    OR (NOT p_skipped AND v_plan.skipped_at IS NULL) THEN
    RETURN NEXT v_plan;
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.plans
  SET skipped_at = CASE WHEN p_skipped THEN pg_catalog.now() ELSE NULL END
  WHERE id = p_plan_id
    AND user_id = p_user_id
    AND deleted_at IS NULL
  RETURNING public.plans.*;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.apply_mcp_plan_create_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_title text, p_note text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid)
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

  -- ★ 'tagId' は now-removed パラメータの固定値（常に NULL）。20260818140100 と
  --   同じ規律で、deploy 前に発行済みの receipt の digest と一致させるためだけに
  --   キー自体は残す。
  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'plans.create'::TEXT,
    pg_catalog.jsonb_build_object(
      'title', p_title,
      'note', p_note,
      'tagId', NULL::UUID,
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
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_active_record_plan_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
  v_restoring_existing_link BOOLEAN;
BEGIN
  IF NEW.plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id
    AND (
      NEW.deleted_at IS NOT NULL
      OR NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    ) THEN
    RETURN NEW;
  END IF;

  v_restoring_existing_link := TG_OP = 'UPDATE'
    AND OLD.deleted_at IS NOT NULL
    AND NEW.deleted_at IS NULL
    AND NEW.plan_id IS NOT NULL
    AND NEW.plan_id IS NOT DISTINCT FROM OLD.plan_id;

  SELECT plan.*
  INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = NEW.plan_id
    AND plan.user_id = NEW.user_id
  FOR UPDATE;

  IF NOT FOUND
    OR (v_plan.deleted_at IS NOT NULL AND NOT v_restoring_existing_link) THEN
    RAISE EXCEPTION 'Linked Plan not found' USING ERRCODE = 'DT001';
  END IF;

  IF v_plan.skipped_at IS NOT NULL THEN
    RAISE EXCEPTION 'Skipped Plans cannot have linked Records' USING ERRCODE = 'DT008';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.enforce_plan_skip_record_invariant_v1()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.skipped_at IS NULL OR NEW.skipped_at IS NOT DISTINCT FROM OLD.skipped_at THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.records AS record
    WHERE record.user_id = NEW.user_id
      AND record.plan_id = NEW.id
      AND record.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Plan already has an active Record' USING ERRCODE = 'DT011';
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.lock_recordable_plan_v1(p_user_id uuid, p_plan_id uuid)
 RETURNS plans
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_plan public.plans%ROWTYPE;
BEGIN
  SELECT plan.*
  INTO v_plan
  FROM public.plans AS plan
  WHERE plan.id = p_plan_id
    AND plan.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_plan.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Plan not found' USING ERRCODE = 'DT001';
  END IF;
  IF v_plan.skipped_at IS NOT NULL THEN
    RAISE EXCEPTION 'Skipped Plans cannot have linked Records' USING ERRCODE = 'DT008';
  END IF;

  RETURN v_plan;
END;
$function$
;

-- Step 3 (H1) 続き: MCP apply コマンドへの activity 追加。
--
-- 20260818140000 と同じ規律:
--   - CREATE OR REPLACE では引数を足せない（overload になる）ため厳密シグネチャ DROP → CREATE
--   - DROP は ACL と SET 句（lock_timeout / statement_timeout）を道連れにするため末尾で再適用
--
-- ★ 冪等 digest のキー `'tagId'` は据え置く。キー名を変えると deploy 前に発行済みの
--   receipt と digest が一致せず、再送クライアントが DM006 を踏む。activity は
--   `'activityId'` という別キーとして足すだけにする。
--
-- ★ update 系は最終値を計算して p_activity_id_present := TRUE で command へ渡す
--   （既存の tag と同じ畳み方）。command 側の present フラグは旧バンドル保護のための
--   ものなので、MCP 経路のように常に明示値を持つ呼び出しでは TRUE 固定でよい。

DROP FUNCTION public.apply_mcp_plan_create_v1(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz);

CREATE FUNCTION public.apply_mcp_plan_create_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_title text, p_note text, p_tag_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL)
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
      'tagId', p_tag_id,
      'activityId', p_activity_id,
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
  -- completed historical call remains replayable after time or tag changes.
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
    p_tag_id,
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

DROP FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz);

CREATE FUNCTION public.apply_mcp_record_create_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_title text, p_note text, p_tag_id uuid, p_plan_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL)
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
      'tagId', p_tag_id,
      'activityId', p_activity_id,
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
    p_tag_id,
    p_plan_id,
    NULL::UUID,
    'api'::TEXT,
    p_start_at,
    p_end_at,
    p_activity_id
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

DROP FUNCTION public.apply_mcp_plan_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz);

CREATE FUNCTION public.apply_mcp_plan_update_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_plan_id uuid, p_expected_updated_at timestamp with time zone, p_title_present boolean, p_title text, p_note_present boolean, p_note text, p_tag_id_present boolean, p_tag_id uuid, p_start_at_present boolean, p_start_at timestamp with time zone, p_end_at_present boolean, p_end_at timestamp with time zone, p_activity_id_present boolean DEFAULT false, p_activity_id uuid DEFAULT NULL)
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
    OR p_tag_id_present IS NULL
    OR p_activity_id_present IS NULL
    OR p_start_at_present IS NULL
    OR p_end_at_present IS NULL THEN
    RAISE EXCEPTION 'MCP Plan update field presence is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT p_title_present
    AND NOT p_note_present
    AND NOT p_tag_id_present
    AND NOT p_activity_id_present
    AND NOT p_start_at_present
    AND NOT p_end_at_present THEN
    RAISE EXCEPTION 'MCP Plan update patch is empty'
      USING ERRCODE = '22023';
  END IF;

  -- A false presence flag has exactly one representation: a null value.
  -- Explicit null remains meaningful only for note and tag removal.
  IF (p_title_present AND p_title IS NULL)
    OR (NOT p_title_present AND p_title IS NOT NULL)
    OR (NOT p_note_present AND p_note IS NOT NULL)
    OR (NOT p_tag_id_present AND p_tag_id IS NOT NULL)
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
  -- explicit null clears note or tag. Internal source/calendar bindings are not
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
  IF p_tag_id_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('tagId', p_tag_id);
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
    CASE WHEN p_tag_id_present THEN p_tag_id ELSE v_existing.tag_id END,
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

  -- The domain command can wait on tag or overlap locks after the Plan lock.
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

DROP FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz);

CREATE FUNCTION public.apply_mcp_record_update_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_record_id uuid, p_expected_updated_at timestamp with time zone, p_title_present boolean, p_title text, p_note_present boolean, p_note text, p_tag_id_present boolean, p_tag_id uuid, p_start_at_present boolean, p_start_at timestamp with time zone, p_end_at_present boolean, p_end_at timestamp with time zone, p_activity_id_present boolean DEFAULT false, p_activity_id uuid DEFAULT NULL)
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
    OR p_tag_id_present IS NULL
    OR p_activity_id_present IS NULL
    OR p_start_at_present IS NULL
    OR p_end_at_present IS NULL THEN
    RAISE EXCEPTION 'MCP Record update field presence is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT p_title_present
    AND NOT p_note_present
    AND NOT p_tag_id_present
    AND NOT p_activity_id_present
    AND NOT p_start_at_present
    AND NOT p_end_at_present THEN
    RAISE EXCEPTION 'MCP Record update patch is empty'
      USING ERRCODE = '22023';
  END IF;

  IF (p_title_present AND p_title IS NULL)
    OR (NOT p_title_present AND p_title IS NOT NULL)
    OR (NOT p_note_present AND p_note IS NOT NULL)
    OR (NOT p_tag_id_present AND p_tag_id IS NOT NULL)
    OR (NOT p_activity_id_present AND p_activity_id IS NOT NULL)
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
  IF p_tag_id_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('tagId', p_tag_id);
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
    CASE WHEN p_tag_id_present THEN p_tag_id ELSE v_existing.tag_id END,
    v_existing.plan_id,
    v_existing.external_calendar_event_id,
    CASE WHEN p_start_at_present THEN p_start_at ELSE v_existing.start_at END,
    CASE WHEN p_end_at_present THEN p_end_at ELSE v_existing.end_at END,
    CASE WHEN p_activity_id_present THEN p_activity_id ELSE v_existing.activity_id END,
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

-- ---------------------------------------------------------------------------
-- DROP で失われた属性の復元（必須）。値は pg_proc 実測から。
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.apply_mcp_plan_create_v1(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,uuid)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.apply_mcp_plan_create_v1(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,uuid)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.apply_mcp_plan_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.apply_mcp_plan_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  SET statement_timeout TO '30s';

REVOKE ALL ON FUNCTION public.apply_mcp_plan_create_v1(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_plan_create_v1(uuid,uuid,uuid,text,text,uuid,timestamptz,timestamptz,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.apply_mcp_plan_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_plan_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid)
  TO service_role;

-- Record 専用の充実度 3 択（#2317）。
--
-- 手段の正本: docs/projects/tag-model-replacement/overview.md §9（Step 3 の
-- additive-only 手順）。CREATE OR REPLACE で引数を足すと REPLACE されず overload に
-- なり、旧バンドルの named-arg 呼び出しが `is not unique` で全滅するため、
-- 「厳密シグネチャ DROP → CREATE」にする。DROP は ACL と関数レベル SET 句
-- （lock_timeout / statement_timeout）を道連れにするため、本 migration の末尾で
-- 両方を再適用する。activity_id 追加時（20260818140000 / 20260818140100）と同型。
--
-- Plan 側（plans テーブル、plan 系 command RPC）は一切変更しない。

-- ---------------------------------------------------------------------------
-- 1. records.fulfillment 列 + CHECK 制約
--
-- NULL 許容（既定は未入力）。値は 'low' / 'medium' / 'high' の 3 値のみ
-- （UI 表示は 消耗 / 普通 / 充実）。authenticated は records に table-level SELECT
-- のみ許可済み（20260730090300）なので、新列も自動的に読み取り対象になる。
-- 書き込みは既存の command RPC 経由に限られる（authenticated の直接 DML は
-- 剥がされている）ため、列追加だけで GRANT / RLS の変更は不要。
-- ---------------------------------------------------------------------------

ALTER TABLE public.records
  ADD COLUMN fulfillment text,
  ADD CONSTRAINT records_fulfillment_check
    CHECK (fulfillment IS NULL OR fulfillment IN ('low', 'medium', 'high'));

-- ---------------------------------------------------------------------------
-- 2. private 実体（DROP → CREATE）
-- ---------------------------------------------------------------------------

DROP FUNCTION private.create_record_unserialized_v1(
  uuid, text, text, uuid, uuid, uuid, text,
  timestamp with time zone, timestamp with time zone, uuid);

CREATE FUNCTION private.create_record_unserialized_v1(
  p_user_id uuid,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_plan_id uuid,
  p_external_calendar_event_id uuid,
  p_source text,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL,
  p_fulfillment text DEFAULT NULL
)
RETURNS SETOF records
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
  PERFORM public.assert_timeblock_content_v1(p_title, p_note);
  PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
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
    user_id, title, note, tag_id, activity_id, plan_id, external_calendar_event_id,
    source, start_at, end_at, fulfillment
  ) VALUES (
    p_user_id, p_title, p_note, p_tag_id, p_activity_id, p_plan_id,
    p_external_calendar_event_id, p_source, p_start_at, p_end_at, p_fulfillment
  )
  RETURNING public.records.*;
END;
$function$;

DROP FUNCTION private.update_record_unserialized_v1(
  uuid, uuid, timestamp with time zone, text, text, uuid, uuid, uuid,
  timestamp with time zone, timestamp with time zone, uuid, boolean);

CREATE FUNCTION private.update_record_unserialized_v1(
  p_user_id uuid,
  p_record_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_plan_id uuid,
  p_external_calendar_event_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL,
  p_activity_id_present boolean DEFAULT false,
  p_fulfillment text DEFAULT NULL,
  p_fulfillment_present boolean DEFAULT false
)
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
  IF p_tag_id IS DISTINCT FROM v_record.tag_id THEN
    PERFORM public.assert_active_timeblock_tag_v1(p_user_id, p_tag_id);
  END IF;
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
    p_tag_id,
    v_next_activity_id,
    p_plan_id,
    p_external_calendar_event_id,
    p_start_at,
    p_end_at,
    v_next_fulfillment
  ) IS NOT DISTINCT FROM ROW(
    v_record.title,
    v_record.note,
    v_record.tag_id,
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
      tag_id = p_tag_id,
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

-- ---------------------------------------------------------------------------
-- 3. public wrapper（DROP → CREATE、position 引数まで必ず更新する）
--
-- ★ wrapper → private の呼び出しは位置引数。新引数を wrapper のシグネチャに足す
--   だけで private への呼び出しを直し忘れると、DEFAULT が黙って NULL / false を
--   埋めて fulfillment が永久に伝わらない（実測済みの罠、activity_id 追加時と同じ）。
-- ---------------------------------------------------------------------------

DROP FUNCTION public.create_record_command_v1(
  uuid, text, text, uuid, uuid, uuid, text,
  timestamp with time zone, timestamp with time zone, uuid);

CREATE FUNCTION public.create_record_command_v1(
  p_user_id uuid,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_plan_id uuid,
  p_external_calendar_event_id uuid,
  p_source text,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL,
  p_fulfillment text DEFAULT NULL
)
RETURNS SETOF records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
    p_tag_id,
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

DROP FUNCTION public.update_record_command_v1(
  uuid, uuid, timestamp with time zone, text, text, uuid, uuid, uuid,
  timestamp with time zone, timestamp with time zone, uuid, boolean);

CREATE FUNCTION public.update_record_command_v1(
  p_user_id uuid,
  p_record_id uuid,
  p_expected_updated_at timestamp with time zone,
  p_title text,
  p_note text,
  p_tag_id uuid,
  p_plan_id uuid,
  p_external_calendar_event_id uuid,
  p_start_at timestamp with time zone,
  p_end_at timestamp with time zone,
  p_activity_id uuid DEFAULT NULL,
  p_activity_id_present boolean DEFAULT false,
  p_fulfillment text DEFAULT NULL,
  p_fulfillment_present boolean DEFAULT false
)
RETURNS SETOF records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
    p_tag_id,
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

-- ---------------------------------------------------------------------------
-- 4. DROP で失われた属性の復元（必須、record 系 4 本のみ）
--
-- 値は pg_proc の実測から取る（migration 履歴からの転記はしない）。
--   - ACL     : DROP で PUBLIC 既定へ戻る = 20260604230607 の hardening が巻き戻る
--   - SET 句  : lock_timeout / statement_timeout は別 ALTER FUNCTION 由来のため
--               DROP で消える
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid,text)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid,text)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean)
  SET statement_timeout TO '30s';

REVOKE ALL ON FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_record_command_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_record_command_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean)
  TO service_role;

REVOKE ALL ON FUNCTION private.create_record_unserialized_v1(uuid,text,text,uuid,uuid,uuid,text,timestamptz,timestamptz,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.update_record_unserialized_v1(uuid,uuid,timestamptz,text,text,uuid,uuid,uuid,timestamptz,timestamptz,uuid,boolean,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. apply_mcp_record_{create,update}_v1（DROP → CREATE）
--
-- create_record_command_v1 / update_record_command_v1 への呼び出しも位置引数
-- なので、新引数まで必ず渡す。digest（idempotency envelope）にも activityId と
-- 同じ条件付き追記パターンで fulfillment を含める。
-- ---------------------------------------------------------------------------

DROP FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid);

CREATE FUNCTION public.apply_mcp_record_create_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_title text, p_note text, p_tag_id uuid, p_plan_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL, p_fulfillment text DEFAULT NULL)
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
    p_tag_id,
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

DROP FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid);

CREATE FUNCTION public.apply_mcp_record_update_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_record_id uuid, p_expected_updated_at timestamp with time zone, p_title_present boolean, p_title text, p_note_present boolean, p_note text, p_tag_id_present boolean, p_tag_id uuid, p_start_at_present boolean, p_start_at timestamp with time zone, p_end_at_present boolean, p_end_at timestamp with time zone, p_activity_id_present boolean DEFAULT false, p_activity_id uuid DEFAULT NULL, p_fulfillment_present boolean DEFAULT false, p_fulfillment text DEFAULT NULL)
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
    OR p_fulfillment_present IS NULL
    OR p_start_at_present IS NULL
    OR p_end_at_present IS NULL THEN
    RAISE EXCEPTION 'MCP Record update field presence is incomplete'
      USING ERRCODE = '22004';
  END IF;

  IF NOT p_title_present
    AND NOT p_note_present
    AND NOT p_tag_id_present
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
    OR (NOT p_tag_id_present AND p_tag_id IS NOT NULL)
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
  IF p_tag_id_present THEN
    v_normalized_args := v_normalized_args
      || pg_catalog.jsonb_build_object('tagId', p_tag_id);
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
    CASE WHEN p_tag_id_present THEN p_tag_id ELSE v_existing.tag_id END,
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

-- ---------------------------------------------------------------------------
-- 6. DROP で失われた属性の復元（apply_mcp_record 系 2 本）
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid,text)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid,text)
  SET statement_timeout TO '30s';
ALTER FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid,boolean,text)
  SET lock_timeout TO '5s';
ALTER FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid,boolean,text)
  SET statement_timeout TO '30s';

REVOKE ALL ON FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_create_v1(uuid,uuid,uuid,text,text,uuid,uuid,timestamptz,timestamptz,uuid,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid,boolean,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_mcp_record_update_v1(uuid,uuid,uuid,uuid,timestamptz,boolean,text,boolean,text,boolean,uuid,boolean,timestamptz,boolean,timestamptz,boolean,uuid,boolean,text)
  TO service_role;

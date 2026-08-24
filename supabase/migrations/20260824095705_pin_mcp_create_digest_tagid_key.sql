-- 20260824090000（Step 8 tag_id 剥離）の追加修正: MCP create の冪等 digest から
-- 'tagId' キーを完全に落としていたのを訂正する。
--
-- 20260818140100（activityId 追加）は「キー名を変えると deploy 前に発行済みの
-- receipt と digest が一致せず、再送クライアントが DM006 を踏む」という理由で
-- 'tagId' キーを据え置いた。20260824090000 はこの規律を見落とし、apply_mcp_plan_create_v1
-- / apply_mcp_record_create_v1 の digest 対象 jsonb から 'tagId' キーそのものを削除した。
--
-- mcp-mutation-client.ts は常に p_tag_id: null を送っていた（実クライアントの digest は
-- 常に 'tagId': null を含んでいた）ため、'tagId' を固定 NULL のキーとして戻せば
-- 旧シグネチャ時代に発行済みの receipt（保持期間 90 日）の digest と完全に一致する。
-- p_tag_id 引数そのものは Step 8 の設計どおり削除済みのままで復活させない
-- （このキーは now-removed パラメータではなく固定値として digest にだけ残す）。
--
-- apply_mcp_plan_update_v1 / apply_mcp_record_update_v1 は対象外。旧コードでも
-- 'tagId' キーは `IF p_tag_id_present THEN ...` の条件付き結合だったため、
-- mcp-mutation-client.ts が常に p_tag_id_present: false を送っていた実運用では
-- このキーは元から一度も digest に含まれていない。Step 8 のシグネチャ変更は
-- update 系の digest 互換性に影響しない。

CREATE OR REPLACE FUNCTION public.apply_mcp_plan_create_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_title text, p_note text, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL)
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

CREATE OR REPLACE FUNCTION public.apply_mcp_record_create_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_title text, p_note text, p_plan_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL, p_fulfillment text DEFAULT NULL)
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

  -- ★ 'tagId' は now-removed パラメータの固定値（常に NULL）。20260818140100 と
  --   同じ規律で、deploy 前に発行済みの receipt の digest と一致させるためだけに
  --   キー自体は残す。
  v_request_digest := private.digest_mcp_mutation_envelope_v1(
    'records.create'::TEXT,
    pg_catalog.jsonb_build_object(
      'title', p_title,
      'note', p_note,
      'tagId', NULL::UUID,
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

-- CREATE OR REPLACE はシグネチャ不変のため既存 ACL（service_role への GRANT）を
-- 引き継ぐ。DROP を経由しないので ACL の再適用は不要（20260824090000 のような
-- DROP→CREATE パターンとは異なる）。

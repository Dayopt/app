-- tags モデルの物理削除（epic #2162 Step 9 / issue #2175、EXPLICIT AUTHORITY）
--
-- Step 8（20260824090000）が「書き込み経路からの tag_id 剥離」だったのに対し、
-- 本 migration は残りの読み取り経路を剥がし終えた上で物理オブジェクトを落とす
-- 最終段。tags テーブル・plans/records の tag_id 列・tags 専有 10 関数を削除する。
--
-- ⚠️ ROLLBACK FLOOR ⚠️
-- この migration は「同一 PR のビルド以降」としか組み合わせられない。それより古い
-- ビルドは publicRecordSelect / statistics-fetchers が tag_id を明示列挙し、iCal
-- route が tags(name) を embed し、user-service が .from('tags') を叩くため、
-- PostgREST 400（42703 / PGRST200 / PGRST205）になる。**DB は forward-only であり、
-- Vercel の Instant Rollback では復旧しない。** 適用後は必ず promote.yml を dispatch
-- して新ビルドを Production domain へ載せること（#2268 以降 promote は手動）。
--
-- 逆 SQL は無い（不可逆）。復旧は Supabase の日次論理バックアップからの復元のみで、
-- PITR は無効（2026-09-03 実測: pitr_enabled=false / walg_enabled=true）。適用前の
-- production 実データ量: tags 6 行、plans.tag_id 非 NULL 28 行、records.tag_id 非 NULL 39 行。
--
-- 共有関数は落とさない: public.update_updated_at() /
-- private.guard_direct_timeblock_statement_v1() / private.assert_timeblock_writer_row_v1()。
-- tags 上の trigger は DROP TABLE で道連れになるが、意図を明示するため先に個別 DROP する。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. GDPR purge 関数から tags 参照を除去する
-- =============================================================================
-- シグネチャ不変のため CREATE OR REPLACE（ACL / COMMENT を保持する）。本体は
-- 適用前の local DB の pg_get_functiondef から機械的に生成し、`DELETE FROM
-- public.tags` の 1 文だけを除いたもの。SECURITY DEFINER / search_path /
-- timeout の proconfig はそのまま再掲している。

CREATE OR REPLACE FUNCTION public.delete_all_user_data_command_v3(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_generation BIGINT;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);

  INSERT INTO private.user_data_controls (
    user_id,
    generation,
    changed_at
  ) VALUES (
    p_user_id,
    1,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET generation = private.user_data_controls.generation + 1,
      changed_at = v_now
  RETURNING generation INTO v_generation;

  WITH locked_calendar_connections AS (
    SELECT
      connection.user_id,
      connection.id,
      connection.provider,
      connection.refresh_token_enc
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
    FOR UPDATE
  )
  INSERT INTO private.calendar_revoke_outbox (
    user_id,
    source_connection_id,
    provider,
    refresh_token_enc,
    created_at,
    expires_at
  )
  SELECT
    connection.user_id,
    connection.id,
    connection.provider,
    connection.refresh_token_enc,
    v_now,
    v_now + INTERVAL '24 hours'
  FROM locked_calendar_connections AS connection;

  UPDATE public.oauth_authorization_codes AS code
  SET consumed_at = COALESCE(code.consumed_at, v_now)
  WHERE code.user_id = p_user_id;

  UPDATE public.oauth_connections AS connection
  SET revoked_at = COALESCE(connection.revoked_at, v_now),
      revoked_reason = COALESCE(connection.revoked_reason, 'user_data_purge')
  WHERE connection.user_id = p_user_id;

  UPDATE public.oauth_tokens AS token
  SET revoked_at = COALESCE(token.revoked_at, v_now)
  WHERE token.user_id = p_user_id;

  UPDATE public.mcp_mutation_receipts AS receipt
  SET resource_deleted_at = COALESCE(receipt.resource_deleted_at, v_now),
      purged_generation = v_generation,
      purged_at = v_now
  WHERE receipt.user_id = p_user_id
    AND receipt.purged_generation IS NULL;

  -- #2433: undo receipt は before/after image としてユーザー本文（メモ・タイトル等）を
  -- 保持するため、account-preserving purge で必ず消す。effects / field_changes は
  -- 複合 FK の CASCADE で一緒に落ちる。
  -- 先頭に置く: plans / records を先に消すと、その CASCADE で effect 行が落ちてから
  -- receipt を消すことになり無駄が出る。既存の削除順そのものは変えていない。
  DELETE FROM public.undo_receipts
  WHERE user_id = p_user_id;

  DELETE FROM public.records
  WHERE user_id = p_user_id;

  DELETE FROM public.plans
  WHERE user_id = p_user_id;

  DELETE FROM public.reports
  WHERE user_id = p_user_id;

  DELETE FROM public.user_settings
  WHERE user_id = p_user_id;

  DELETE FROM public.calendar_connections
  WHERE user_id = p_user_id;

  DELETE FROM public.external_calendar_events
  WHERE user_id = p_user_id;

  -- #2444: 分類モデル（#2162 で tags を置き換えたもの）が列挙から漏れていた。
  -- `tags` は消しているのに後継の activities / categories / segments が残るため、
  -- アカウントを残してデータだけ消したユーザーの手元にアクティビティ名・
  -- カテゴリー名・セグメント名が残っていた。
  --
  -- 順序に意味がある（余計な CASCADE / SET NULL の churn を避ける）:
  --   segments   → segment_activities を CASCADE で一掃する
  --   activities → plans / records は上で削除済みなので activity_id の SET NULL が走らない
  --   categories → activities は直前で削除済みなので category_id の SET NULL が走らない
  DELETE FROM public.segments
  WHERE user_id = p_user_id;

  DELETE FROM public.activities
  WHERE user_id = p_user_id;

  DELETE FROM public.categories
  WHERE user_id = p_user_id;

  -- `segment_activities` は segments / activities からの複合 FK CASCADE、
  -- `calendar_connection_calendars` は calendar_connections からの複合 FK CASCADE で
  -- それぞれ落ちるため、ここには列挙しない（integration test で実測固定する）。
  --
  -- ★ 以下の 3 テーブルは `user_id` を持つが **意図的に消さない**（2026-08-27 User 裁可、
  --   #2444）。列挙漏れではないので、次に棚卸しする人が拾い直さなくてよい:
  --     mfa_recovery_codes … アカウントを保持するなら資格情報も保持する
  --                          （purge 後もログインできる必要がある）
  --     oauth_audit_log    … 監査ログを削除対象にすると監査の意味が消える
  --     product_events     … 個人データ性が低い分析イベント
  --   `mcp_mutation_receipts` は削除ではなく tombstone 方式（上の UPDATE で
  --   purged_generation / purged_at を打つ）。これも設計どおりで漏れではない。
  --
  -- この列挙が人手で維持される限り漏れは再発する（#2162 で一度、#2444 で二度目）。
  -- 機械側の歯止めは user-data-purge-enumeration.integration.test.ts が持つ。

  INSERT INTO private.integration_security_events (
    user_id,
    event_kind,
    occurred_at
  ) VALUES (
    p_user_id,
    'user_data_purged',
    v_now
  );

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_all_user_data_command_v4(p_project_key text, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET lock_timeout TO '5s'
 SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_generation BIGINT;
  v_project_fence_id UUID;
  v_quarantine_fence_id UUID;
  v_subject_fence_id UUID;
  v_connection RECORD;
  v_operation_id UUID;
  v_request_digest BYTEA;
  v_begin RECORD;
  v_has_calendar_connections BOOLEAN;
  v_now CONSTANT TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_exclusive_v1(p_user_id);
  PERFORM private.assert_calendar_account_not_deleting_v1(p_user_id);

  IF EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
      AND connection.provider <> 'google'
  ) THEN
    RAISE EXCEPTION 'Unsupported Calendar provider cannot be purged safely'
      USING ERRCODE = 'CA017';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
      AND connection.provider = 'google'
  )
  INTO v_has_calendar_connections;

  IF v_has_calendar_connections THEN
    v_project_fence_id :=
      private.resolve_calendar_authority_project_fence_v1(p_project_key);

    PERFORM 1
    FROM private.calendar_authority_fences AS project
    WHERE project.id = v_project_fence_id
    FOR UPDATE;

    SELECT fence.id
    INTO v_quarantine_fence_id
    FROM private.calendar_authority_fences AS fence
    WHERE fence.project_key = p_project_key
      AND fence.scope_kind = 'quarantine'
    FOR UPDATE;

    FOR v_connection IN
      SELECT
        connection.id,
        connection.provider_account_id
      FROM public.calendar_connections AS connection
      WHERE connection.user_id = p_user_id
        AND connection.provider = 'google'
        AND connection.authority_fence_id IS NULL
      ORDER BY connection.provider_account_id, connection.id
    LOOP
      v_subject_fence_id :=
        private.get_or_create_calendar_subject_fence_v1(
          p_project_key,
          v_connection.provider_account_id
        );

      UPDATE public.calendar_connections AS connection
      SET authority_fence_id = v_subject_fence_id,
          authority_epoch = (
            SELECT fence.epoch
            FROM private.calendar_authority_fences AS fence
            WHERE fence.id = v_subject_fence_id
          )
      WHERE connection.id = v_connection.id
        AND connection.user_id = p_user_id
        AND connection.authority_fence_id IS NULL;
    END LOOP;

    FOR v_subject_fence_id IN
      SELECT DISTINCT connection.authority_fence_id
      FROM public.calendar_connections AS connection
      WHERE connection.user_id = p_user_id
        AND connection.provider = 'google'
        AND connection.authority_fence_id IS NOT NULL
      ORDER BY connection.authority_fence_id
    LOOP
      PERFORM 1
      FROM private.calendar_authority_fences AS subject
      WHERE subject.id = v_subject_fence_id
      FOR UPDATE;
    END LOOP;

    PERFORM 1
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
    ORDER BY connection.id
    FOR UPDATE;
  END IF;

  INSERT INTO private.user_data_controls (
    user_id,
    generation,
    changed_at
  ) VALUES (
    p_user_id,
    1,
    v_now
  )
  ON CONFLICT (user_id) DO UPDATE
  SET generation = private.user_data_controls.generation + 1,
      changed_at = v_now
  RETURNING generation INTO v_generation;

  FOR v_connection IN
    SELECT
      connection.id,
      connection.provider,
      connection.refresh_token_enc,
      COALESCE(connection.authority_fence_id, v_quarantine_fence_id)
        AS authority_fence_id
    FROM public.calendar_connections AS connection
    WHERE connection.user_id = p_user_id
      AND connection.provider = 'google'
    ORDER BY connection.id
  LOOP
    v_operation_id := gen_random_uuid();
    v_request_digest := private.digest_calendar_authority_operation_v1(
      'purge',
      pg_catalog.jsonb_build_object(
        'operationId', v_operation_id,
        'projectKey', p_project_key,
        'userId', p_user_id,
        'sourceConnectionId', v_connection.id,
        'provider', v_connection.provider,
        'refreshTokenCiphertext', v_connection.refresh_token_enc,
        'purgedGeneration', v_generation
      )
    );

    SELECT *
    INTO v_begin
    FROM private.begin_calendar_revoke_operation_v1(
      v_operation_id,
      v_project_fence_id,
      v_connection.authority_fence_id,
      p_user_id,
      v_connection.id,
      'purge',
      v_request_digest,
      'queued',
      v_now + INTERVAL '23 hours 59 minutes'
    );

    INSERT INTO private.calendar_revoke_outbox (
      id,
      user_id,
      source_connection_id,
      provider,
      refresh_token_enc,
      created_at,
      expires_at,
      authority_fence_id,
      authority_epoch
    ) VALUES (
      v_operation_id,
      p_user_id,
      v_connection.id,
      v_connection.provider,
      v_connection.refresh_token_enc,
      v_now,
      v_now + INTERVAL '23 hours 59 minutes',
      v_connection.authority_fence_id,
      v_begin.operation_subject_epoch
    );
  END LOOP;

  UPDATE public.oauth_authorization_codes AS code
  SET consumed_at = COALESCE(code.consumed_at, v_now)
  WHERE code.user_id = p_user_id;

  UPDATE public.oauth_connections AS connection
  SET revoked_at = COALESCE(connection.revoked_at, v_now),
      revoked_reason = COALESCE(connection.revoked_reason, 'user_data_purge')
  WHERE connection.user_id = p_user_id;

  UPDATE public.oauth_tokens AS token
  SET revoked_at = COALESCE(token.revoked_at, v_now)
  WHERE token.user_id = p_user_id;

  UPDATE public.mcp_mutation_receipts AS receipt
  SET resource_deleted_at = COALESCE(receipt.resource_deleted_at, v_now),
      purged_generation = v_generation,
      purged_at = v_now
  WHERE receipt.user_id = p_user_id
    AND receipt.purged_generation IS NULL;

  -- #2434: undo_receipts（親）はPIIを持たない（command_name等は固定文字列）。
  -- PIIはundo_receipt_field_changesのbefore_value/after_valueにのみ存在するため、
  -- undo_receipt_effectsをDELETEすればCASCADEでfield_changesも消えPIIが除去される。
  -- undo_receipts親行は残し、UNIQUE(user_id, operation_id)を遅延再送への
  -- 冪等tombstoneとして再利用する（新しいtombstone専用テーブルを作らない）。
  -- 先頭に置く: plans/recordsを先に消すと、そのCASCADEでeffect行が落ちてから
  -- 消すことになり無駄が出る。既存の削除順そのものは変えていない。
  DELETE FROM public.undo_receipt_effects
  WHERE user_id = p_user_id;

  DELETE FROM public.records
  WHERE user_id = p_user_id;

  DELETE FROM public.plans
  WHERE user_id = p_user_id;

  DELETE FROM public.reports
  WHERE user_id = p_user_id;

  DELETE FROM public.user_settings
  WHERE user_id = p_user_id;

  DELETE FROM public.calendar_connections
  WHERE user_id = p_user_id;

  DELETE FROM public.external_calendar_events
  WHERE user_id = p_user_id;

  -- #2444: 分類モデル（#2162 で tags を置き換えたもの）が列挙から漏れていた。
  -- `tags` は消しているのに後継の activities / categories / segments が残るため、
  -- アカウントを残してデータだけ消したユーザーの手元にアクティビティ名・
  -- カテゴリー名・セグメント名が残っていた。
  --
  -- 順序に意味がある（余計な CASCADE / SET NULL の churn を避ける）:
  --   segments   → segment_activities を CASCADE で一掃する
  --   activities → plans / records は上で削除済みなので activity_id の SET NULL が走らない
  --   categories → activities は直前で削除済みなので category_id の SET NULL が走らない
  DELETE FROM public.segments
  WHERE user_id = p_user_id;

  DELETE FROM public.activities
  WHERE user_id = p_user_id;

  DELETE FROM public.categories
  WHERE user_id = p_user_id;

  -- `segment_activities` は segments / activities からの複合 FK CASCADE、
  -- `calendar_connection_calendars` は calendar_connections からの複合 FK CASCADE で
  -- それぞれ落ちるため、ここには列挙しない（integration test で実測固定する）。
  --
  -- ★ 以下の 3 テーブルは `user_id` を持つが **意図的に消さない**（2026-08-27 User 裁可、
  --   #2444）。列挙漏れではないので、次に棚卸しする人が拾い直さなくてよい:
  --     mfa_recovery_codes … アカウントを保持するなら資格情報も保持する
  --     oauth_audit_log    … 監査ログを削除対象にすると監査の意味が消える
  --     product_events     … 個人データ性が低い分析イベント
  --   `mcp_mutation_receipts` は削除ではなく tombstone 方式（上の UPDATE で
  --   purged_generation / purged_at を打つ）。これも設計どおりで漏れではない。

  INSERT INTO private.integration_security_events (
    user_id,
    event_kind,
    occurred_at
  ) VALUES (
    p_user_id,
    'user_data_purged',
    v_now
  );

  RETURN TRUE;
END;
$function$;

-- v4 の COMMENT は削除対象を列挙しており "tags" を含む。同じ内容から tags を外す。
COMMENT ON FUNCTION public.delete_all_user_data_command_v4(TEXT, UUID) IS
  'Account-preserving purge (v4, product entry via v5 delegation). Deletes user-owned plans/records/reports/settings/calendar data/classification model rows and undo_receipt_effects (undo_receipts parent rows are retained as PII-free tombstones, #2434). Revokes OAuth state and tombstones mcp_mutation_receipts. Idempotent per user_data_controls generation.';

-- =============================================================================
-- 2. MCP create の冪等 digest から 'tagId' キーを外す
-- =============================================================================
-- 20260824095705 は「deploy 前に発行済みの receipt と digest を一致させる」ため
-- 固定 NULL のキーを据え置いた。その前提が production 実測で消えたので解除する
-- （2026-09-03 実測: mcp_mutation_receipts = 0 行、oauth_connections = 0 行。
-- 一致させるべき既発行 receipt が 1 件も存在しない）。シグネチャ不変につき
-- CREATE OR REPLACE、ACL 保持。

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

CREATE OR REPLACE FUNCTION public.apply_mcp_record_create_v1(p_connection_id uuid, p_access_token_id uuid, p_operation_id uuid, p_title text, p_note text, p_plan_id uuid, p_start_at timestamp with time zone, p_end_at timestamp with time zone, p_activity_id uuid DEFAULT NULL::uuid, p_fulfillment text DEFAULT NULL::text)
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
-- 3. tags テーブル上の trigger を落とす
-- =============================================================================
-- DROP TABLE でも落ちるが、「どの関数が参照されなくなるか」を監査可能にするため
-- 明示する。後半 2 つが指す private 関数は plans / records でも使う共有関数なので
-- 関数自体は残す（TG_TABLE_NAME の allowlist を持たないため影響なし）。

DROP TRIGGER trigger_update_tags_updated_at ON public.tags;
DROP TRIGGER enforce_tag_hierarchy ON public.tags;
DROP TRIGGER enforce_tag_no_children_as_child ON public.tags;
DROP TRIGGER trigger_serialize_direct_tag_delete ON public.tags;
DROP TRIGGER trigger_assert_tag_delete_writer_user ON public.tags;

-- =============================================================================
-- 4. tags 専有関数を落とす（10 本）
-- =============================================================================
-- 呼び出し元は 0 件（apps/product からの参照は本 PR で除去済み）。IF EXISTS は
-- 付けない — inventory と現実が食い違ったら黙って skip せず失敗させる。
-- ACL の再適用は不要（置き換えではなく消滅。20260604230607 の allowlist は
-- to_regprocedure() ガード付きなので replay も green のまま）。

DROP FUNCTION public.check_tag_hierarchy();
DROP FUNCTION public.check_tag_has_children();
DROP FUNCTION public.batch_rename_tags(uuid, uuid[], text[]);
DROP FUNCTION public.batch_reorder_tags(uuid, uuid[], integer[]);
DROP FUNCTION public.batch_reorder_tags_hierarchy(uuid, uuid[], uuid[], integer[]);
DROP FUNCTION public.increment_tag_sort_orders(uuid);
DROP FUNCTION public.merge_tags_with_hierarchy(uuid, uuid, uuid);
DROP FUNCTION private.merge_tags_with_hierarchy_unserialized_v1(uuid, uuid, uuid);
DROP FUNCTION public.rename_tag_group(uuid, text, text);
DROP FUNCTION public.assert_active_timeblock_tag_v1(uuid, uuid);

-- =============================================================================
-- 5. plans / records の tag_id を落とす
-- =============================================================================
-- FK → index → 列 の順。CASCADE は使わない（想定外の依存があれば失敗させる）。

ALTER TABLE public.plans DROP CONSTRAINT plans_tag_id_fkey;
ALTER TABLE public.records DROP CONSTRAINT records_tag_id_fkey;

DROP INDEX public.plans_user_tag_idx;
DROP INDEX public.records_user_tag_idx;

ALTER TABLE public.plans DROP COLUMN tag_id;
ALTER TABLE public.records DROP COLUMN tag_id;

-- =============================================================================
-- 6. tags テーブル本体を落とす
-- =============================================================================
-- 自身の index・自己参照 FK・RLS policy 4 本・table GRANT が道連れになる。

DROP TABLE public.tags;

-- =============================================================================
-- 7. 事後アサーション
-- =============================================================================
-- 「列挙し忘れた参照」を同一トランザクション内で捕まえる最後の網。
-- pg_depend では見えない関数本体の文字列参照（Codex P2-5）をここで拾う。

DO $$
BEGIN
  IF pg_catalog.to_regclass('public.tags') IS NOT NULL THEN
    RAISE EXCEPTION 'public.tags still exists';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('plans', 'records')
      AND a.attname = 'tag_id'
      AND NOT a.attisdropped
  ) THEN
    RAISE EXCEPTION 'plans/records still expose tag_id';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname IN ('public', 'private')
      AND p.prokind = 'f'
      AND pg_catalog.pg_get_functiondef(p.oid) ~ 'public\.tags'
  ) THEN
    RAISE EXCEPTION 'a function still references public.tags';
  END IF;
END $$;

COMMIT;

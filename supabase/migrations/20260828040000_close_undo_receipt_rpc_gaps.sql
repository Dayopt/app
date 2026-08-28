-- #2434 fix round: 内製クロスレビュー P2 4件のうち3件を閉じる（指揮台コメント、2026-08-28）。
-- P2の4件目（timestamptz/records未検証）はtest側の追加で対応（migration変更なし）。
--
-- 1. field_name allowlistがresource_typeを見ない
--    `records`テーブルに`skipped_at`列は無い。`record`効果へ`skipped_at`のfield_changeを
--    記録すると、record時点のCHECK制約は通り、list_undoable_receipts_v1で「Undo可能」と
--    出た上でapply時にdynamic UPDATE文が42703（undefined_column）で落ちる。
--    trigger（private.enforce_undo_field_change_applicability_v1）で
--    resource_typeとfield_nameの組み合わせをINSERT時に閉じる。
--
-- 2. insert effectのfull-mask契約が散文のみ
--    「insert effectを記録するcommandはfield maskに作成時の全フィールドを含める」という
--    契約が本文コメントのみで、DBでは強制されていなかった。record_undo_receipt_v1側で、
--    effect_kind='insert'のfield_changesの集合がresource_typeのfull mask
--    （private.undo_full_mask_v1）と完全一致することを検証する。
--
-- 3. had_origin_connectionの導出がfail-open
--    p_origin_connection_idの省略（NULL）を「UI由来」と解釈していたため、MCP発行の
--    commandが引数を渡し忘れると、権限交差判定がスキップされ黙って昇格する
--    （fail-openの向き）。record_undo_receipt_v1へ`p_is_mcp_command BOOLEAN`
--    （デフォルト無し、必須引数）を追加し、mcp=true なら origin_connection_id必須、
--    mcp=false なら origin_connection_id禁止、を明示的にRAISEする。
--    シグネチャ変更のためDROP FUNCTION + CREATE FUNCTIONで置き換える
--    （現時点で consumer が0件のため破壊的変更のコストが最安）。
--
-- また、purgeの`COMMENT ON FUNCTION`が旧挙動（undo_receipts全削除）を指したまま
-- 残っていた（P3-1、CREATE OR REPLACEはpg_descriptionを引き継ぐ）ため更新する。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. field_name の resource_type 適用可否
-- =============================================================================

CREATE FUNCTION private.undo_field_applicable_v1(p_field_name TEXT, p_resource_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  -- skipped_at は plans にしか存在しない列（records には無い）。
  -- それ以外のallowlist列（title/note/start_at/end_at/deleted_at）は両resourceに存在する。
  SELECT CASE
    WHEN p_field_name = 'skipped_at' THEN p_resource_type = 'plan'
    ELSE TRUE
  END;
$$;

COMMENT ON FUNCTION private.undo_field_applicable_v1(TEXT, TEXT) IS
  'field_nameがresource_typeの実列として存在するか。skipped_atはplan専用（records列挙に無い）。';

CREATE FUNCTION private.enforce_undo_field_change_applicability_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resource_type TEXT;
BEGIN
  SELECT effect.resource_type INTO v_resource_type
  FROM public.undo_receipt_effects AS effect
  WHERE effect.id = NEW.effect_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'undo_receipt_field_changes.effect_id % does not reference an existing effect',
      NEW.effect_id
      USING ERRCODE = '23503';
  END IF;

  IF NOT private.undo_field_applicable_v1(NEW.field_name, v_resource_type) THEN
    RAISE EXCEPTION 'field % is not applicable to resource_type %', NEW.field_name, v_resource_type
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.enforce_undo_field_change_applicability_v1()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER enforce_undo_field_change_applicability
  BEFORE INSERT ON public.undo_receipt_field_changes
  FOR EACH ROW EXECUTE FUNCTION private.enforce_undo_field_change_applicability_v1();

COMMENT ON TRIGGER enforce_undo_field_change_applicability ON public.undo_receipt_field_changes IS
  '#2434 P2: field_nameがeffectのresource_typeに実在する列であることをINSERT時に強制する。RPC経由以外の直接INSERT（例: service_roleの直接DML）でも閉じる。';

-- =============================================================================
-- 2. insert effect の full-mask 契約
-- =============================================================================

CREATE FUNCTION private.undo_full_mask_v1(p_resource_type TEXT)
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  -- insert effect（undo=DELETE）は行全体を消す操作のため、field maskは
  -- その resource_type が持つ allowlist 対象列を漏れなく含まなければならない。
  -- 1列でも漏れると、その列への正当な事後編集がDELETEに巻き込まれ silent に消える。
  SELECT CASE p_resource_type
    WHEN 'plan' THEN ARRAY['deleted_at', 'end_at', 'note', 'skipped_at', 'start_at', 'title']
    WHEN 'record' THEN ARRAY['deleted_at', 'end_at', 'note', 'start_at', 'title']
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION private.undo_full_mask_v1(TEXT) IS
  'insert effect（undo=DELETE）が備えるべきfield maskの完全集合。record_undo_receipt_v1が記録時にこれと完全一致することを検証する。要素はソート済みで持つ（比較のため）。';

-- =============================================================================
-- 3. record_undo_receipt_v1: p_is_mcp_command を必須引数として追加
-- =============================================================================
-- シグネチャ変更のため置き換える（現時点でconsumerが無いため破壊的変更のコスト最安）。

DROP FUNCTION public.record_undo_receipt_v1(UUID, UUID, TEXT, UUID, INTEGER, JSONB);
DROP FUNCTION private.record_undo_receipt_v1(UUID, UUID, TEXT, UUID, INTEGER, JSONB);

CREATE FUNCTION private.record_undo_receipt_v1(
  p_user_id UUID,
  p_operation_id UUID,
  p_command_name TEXT,
  p_is_mcp_command BOOLEAN,
  p_origin_connection_id UUID,
  p_undo_ttl_seconds INTEGER,
  p_effects JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_receipt_id UUID;
  v_existing_id UUID;
  v_origin_scopes TEXT[];
  v_had_origin BOOLEAN;
  v_effect JSONB;
  v_field JSONB;
  v_effect_id UUID;
  v_plan_id UUID;
  v_record_id UUID;
  v_effect_kind TEXT;
  v_resource_type TEXT;
  v_effect_count SMALLINT := 0;
  v_recorded_count SMALLINT;
  v_field_names TEXT[];
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'record_undo_receipt_v1 requires user_id and operation_id'
      USING ERRCODE = '22004';
  END IF;
  IF p_is_mcp_command IS NULL THEN
    RAISE EXCEPTION 'record_undo_receipt_v1 requires an explicit is_mcp_command flag'
      USING ERRCODE = '22004';
  END IF;
  -- #2434 P2: origin_connection_idの省略を「UI由来」へ暗黙変換しない。
  -- 呼び出し側がsourceを明示することを強制し、引数の渡し忘れをfail-openにしない。
  IF p_is_mcp_command AND p_origin_connection_id IS NULL THEN
    RAISE EXCEPTION 'mcp-originated undo receipts require an origin_connection_id'
      USING ERRCODE = '22004';
  END IF;
  IF NOT p_is_mcp_command AND p_origin_connection_id IS NOT NULL THEN
    RAISE EXCEPTION 'ui-originated undo receipts must not specify an origin_connection_id'
      USING ERRCODE = '22004';
  END IF;
  IF p_undo_ttl_seconds IS NULL OR p_undo_ttl_seconds <= 0 THEN
    RAISE EXCEPTION 'undo_ttl_seconds must be positive'
      USING ERRCODE = '22003';
  END IF;
  IF p_effects IS NULL OR jsonb_typeof(p_effects) <> 'array' OR jsonb_array_length(p_effects) = 0 THEN
    RAISE EXCEPTION 'record_undo_receipt_v1 requires at least one effect'
      USING ERRCODE = '22004';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  -- 冪等性: 同一operation_idの再送は最初の結果をそのまま返す（T3）。
  SELECT receipt.id INTO v_existing_id
  FROM public.undo_receipts AS receipt
  WHERE receipt.user_id = p_user_id
    AND receipt.operation_id = p_operation_id;

  IF FOUND THEN
    RETURN v_existing_id;
  END IF;

  -- 権限snapshot: origin_connection_idがあればその時点のscopesを固定コピーする。
  IF p_origin_connection_id IS NOT NULL THEN
    SELECT connection.scopes INTO v_origin_scopes
    FROM public.oauth_connections AS connection
    WHERE connection.id = p_origin_connection_id
      AND connection.user_id = p_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'origin connection % not found for user', p_origin_connection_id
        USING ERRCODE = '23503';
    END IF;
    v_had_origin := true;
  ELSE
    v_origin_scopes := NULL;
    v_had_origin := false;
  END IF;

  v_receipt_id := gen_random_uuid();

  INSERT INTO public.undo_receipts (
    id, user_id, operation_id, command_name, origin_connection_id,
    origin_scopes_snapshot, had_origin_connection, recorded_effect_count,
    undo_expires_at
  ) VALUES (
    v_receipt_id, p_user_id, p_operation_id, p_command_name, p_origin_connection_id,
    v_origin_scopes, v_had_origin, 0,
    now() + make_interval(secs => p_undo_ttl_seconds)
  );

  FOR v_effect IN SELECT * FROM jsonb_array_elements(p_effects)
  LOOP
    v_plan_id := NULLIF(v_effect ->> 'plan_id', '')::UUID;
    v_record_id := NULLIF(v_effect ->> 'record_id', '')::UUID;
    v_effect_kind := v_effect ->> 'effect_kind';
    v_resource_type := CASE WHEN v_plan_id IS NOT NULL THEN 'plan' ELSE 'record' END;

    IF num_nonnulls(v_plan_id, v_record_id) <> 1 THEN
      RAISE EXCEPTION 'effect must reference exactly one of plan_id/record_id'
        USING ERRCODE = '22004';
    END IF;
    IF v_effect_kind NOT IN ('insert', 'update') THEN
      RAISE EXCEPTION 'effect_kind % is not recordable (delete is structurally unsupported, see migration header)',
        v_effect_kind
        USING ERRCODE = '22023';
    END IF;

    v_effect_id := gen_random_uuid();

    INSERT INTO public.undo_receipt_effects (
      id, user_id, receipt_id, plan_id, record_id, effect_kind
    ) VALUES (
      v_effect_id, p_user_id, v_receipt_id, v_plan_id, v_record_id, v_effect_kind
    );

    IF jsonb_typeof(v_effect -> 'field_changes') <> 'array'
      OR jsonb_array_length(v_effect -> 'field_changes') = 0
    THEN
      RAISE EXCEPTION 'effect requires at least one field_change'
        USING ERRCODE = '22004';
    END IF;

    v_field_names := ARRAY[]::TEXT[];

    FOR v_field IN SELECT * FROM jsonb_array_elements(v_effect -> 'field_changes')
    LOOP
      IF private.undo_field_sql_type_v1(v_field ->> 'field_name') IS NULL THEN
        RAISE EXCEPTION 'field_name % is not in the undo allowlist', v_field ->> 'field_name'
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.undo_receipt_field_changes (
        effect_id, user_id, field_name, before_value, after_value
      ) VALUES (
        v_effect_id, p_user_id, v_field ->> 'field_name',
        v_field -> 'before_value', v_field -> 'after_value'
      );

      v_field_names := array_append(v_field_names, v_field ->> 'field_name');
    END LOOP;

    -- #2434 P2: insert effectはfull mask契約を満たすことを記録時に検証する。
    -- 部分maskで記録すると、mask外への正当な事後編集がundo(=DELETE)に巻き込まれ
    -- silentに消える（issue #2434のCodex P1-3、risk-reviewer/behavior-verifier
    -- 両方が独立に到達した指摘）。
    IF v_effect_kind = 'insert' THEN
      IF (SELECT array_agg(name ORDER BY name) FROM unnest(v_field_names) AS name)
        IS DISTINCT FROM private.undo_full_mask_v1(v_resource_type)
      THEN
        RAISE EXCEPTION
          'insert effect on % must record the full field mask %, got %',
          v_resource_type,
          private.undo_full_mask_v1(v_resource_type),
          (SELECT array_agg(name ORDER BY name) FROM unnest(v_field_names) AS name)
          USING ERRCODE = '22023';
      END IF;
    END IF;

    v_effect_count := v_effect_count + 1;
  END LOOP;

  -- recorded_effect_countはアプリ入力を信頼せず、DB側でCOUNT(*)して確定する
  -- （under-countバグによるsilent no-op対策、plan-critic指摘）。
  SELECT count(*) INTO v_recorded_count
  FROM public.undo_receipt_effects AS effect
  WHERE effect.receipt_id = v_receipt_id;

  IF v_recorded_count <> v_effect_count THEN
    RAISE EXCEPTION 'internal error: inserted % effects but counted %', v_effect_count, v_recorded_count
      USING ERRCODE = 'XX000';
  END IF;

  UPDATE public.undo_receipts
  SET recorded_effect_count = v_recorded_count
  WHERE id = v_receipt_id;

  RETURN v_receipt_id;
END;
$$;

COMMENT ON FUNCTION private.record_undo_receipt_v1(UUID, UUID, TEXT, BOOLEAN, UUID, INTEGER, JSONB) IS
  'domain command が1操作分のUndo receiptを記録する。p_is_mcp_command=true なら p_origin_connection_id 必須（false なら禁止、fail-open防止）。insert effectはfull mask契約を検証する。p_effects形状: [{"plan_id"|"record_id": uuid, "effect_kind": "insert"|"update", "field_changes": [{"field_name","before_value","after_value"}]}]。';

CREATE FUNCTION public.record_undo_receipt_v1(
  p_user_id UUID,
  p_operation_id UUID,
  p_command_name TEXT,
  p_is_mcp_command BOOLEAN,
  p_origin_connection_id UUID,
  p_undo_ttl_seconds INTEGER,
  p_effects JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  RETURN private.record_undo_receipt_v1(
    p_user_id, p_operation_id, p_command_name, p_is_mcp_command, p_origin_connection_id,
    p_undo_ttl_seconds, p_effects
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_undo_receipt_v1(UUID, UUID, TEXT, BOOLEAN, UUID, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_undo_receipt_v1(UUID, UUID, TEXT, BOOLEAN, UUID, INTEGER, JSONB)
  TO service_role;

REVOKE ALL ON FUNCTION private.record_undo_receipt_v1(UUID, UUID, TEXT, BOOLEAN, UUID, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.undo_field_applicable_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.undo_full_mask_v1(TEXT)
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. 権限不変条件（新シグネチャの反映）
-- =============================================================================

DO $$
DECLARE
  new_functions TEXT[] := ARRAY[
    'public.record_undo_receipt_v1(uuid,uuid,text,boolean,uuid,integer,jsonb)',
    'public.apply_undo_receipt_v1(uuid,uuid,uuid)',
    'public.list_undoable_receipts_v1(uuid)'
  ];
  target_function TEXT;
BEGIN
  FOREACH target_function IN ARRAY new_functions LOOP
    IF has_function_privilege('anon', target_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon must not hold EXECUTE on %', target_function
        USING ERRCODE = '42501';
    END IF;
    IF has_function_privilege('authenticated', target_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated must not hold EXECUTE on % (stage 3 keeps writes/reads behind tRPC)',
        target_function
        USING ERRCODE = '42501';
    END IF;
    IF NOT has_function_privilege('service_role', target_function, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role is missing EXECUTE on %', target_function
        USING ERRCODE = '42501';
    END IF;
  END LOOP;
END;
$$;

-- =============================================================================
-- 5. purge の COMMENT ON FUNCTION を現行挙動へ更新（P3-1）
-- =============================================================================
-- CREATE OR REPLACE FUNCTIONはpg_descriptionを引き継ぐため、20260828030000で
-- 挙動を変えた後もコメントが旧挙動（undo_receipts全削除）を指したまま残っていた。

COMMENT ON FUNCTION public.delete_all_user_data_command_v4(TEXT, UUID) IS
  'Account-preserving purge (v4, product entry via v5 delegation). Deletes user-owned plans/records/reports/tags/settings/calendar data/classification model rows and undo_receipt_effects (undo_receipts parent rows are retained as PII-free tombstones, #2434). Revokes OAuth state and tombstones mcp_mutation_receipts. Idempotent per user_data_controls generation.';

COMMIT;

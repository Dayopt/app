-- #2434（台帳 第3段）: Undo receipt substrate に書き込み経路（RPC）を実装する。
--
-- 第2段（20260826234911）が敷いた undo_receipts / undo_receipt_effects /
-- undo_receipt_field_changes は構造のみで、書き込みは service_role の直接 DML すら
-- 閉じている（RLS は SELECT-only policy、GRANT は無し）。本段はこの上に
-- SECURITY DEFINER RPC 3 本（record / apply / list）を実装する。
--
-- 入口4点の裁定（指揮台 Codex A レビュー、issue #2434 コメント 2026-08-28）を
-- そのまま実装へ落とす。各裁定の詳細な理由は
-- docs/projects/time-ledger-redesign/step-3-undo-receipt-rpc.md を正本とし、
-- ここでは実装に必要な要約のみをコメントする。
--
-- 1. 権限 snapshot と inverse capability:
--    - `origin_scopes_snapshot` / `had_origin_connection`（下記 additive 列）で
--      receipt作成時点の権限上限を固定し、TOCTOU（scopes が後で変わる）を防ぐ
--    - `had_origin_connection = true AND origin_connection_id IS NULL` は
--      connection の物理削除（retention cleanup）を revoke 相当として扱う
--    - Undo に要る scope は「元操作の逆操作が要求する scope」
--      （update の undo = write:*、insert の undo(=DELETE) = delete:*）とし、
--      「現在の scopes」∩「origin_scopes_snapshot」の両方に含まれることを要求する
--
-- 2. definer RPC の caller 境界:
--    - 既存 domain command RPC 群（create_plan_command_v1 等）と同型。
--      REVOKE ALL FROM PUBLIC,anon,authenticated + GRANT EXECUTE TO service_role のみ
--    - 内部でも private.assert_timeblock_service_role_request_v1()（既存関数、
--      20260729073122）を呼び、GRANT 片落ちに対する defense-in-depth を持つ
--    - 通常 writer と同じ private.lock_timeblock_user_write_shared_v1(p_user_id)
--      （既存関数、同上）を取り、account purge の exclusive lock と排他する。
--      これを取らないと Undo だけが repo 全体の writer 境界の外に出る
--    - authenticated への EXECUTE は本段でも開けない（読み手が無いまま契約を
--      固定するコストが高い。UI は tRPC 経由でこの RPC を呼ぶ）
--
-- 3. PII payload と冪等 tombstone の分離:
--    - undo_receipts（親）は PII を持たない。account-preserving purge は
--      undo_receipt_effects を DELETE するよう改める（本 migration 末尾）。
--      undo_receipts 親行は tombstone として残り、UNIQUE(user_id, operation_id) が
--      遅延再送の冪等ガードを兼ねる
--
-- 4. insert・delete 固有の CAS 契約:
--    - update: masked field の現在値 == after_value を全 field で確認してから
--      before_value へ戻す（1 つの UPDATE 文の WHERE 句に CAS を埋め込み、
--      行ロックと比較を単一 atomic 操作にする）
--    - insert（undo = 対象行の DELETE）: 同じ CAS チェックを DELETE の WHERE に使う
--    - delete（原操作が物理 DELETE）: 実装しない。
--      undo_receipt_effects → plans/records の複合 FK が ON DELETE CASCADE のため、
--      「effect記録 → 対象行DELETE」の順で書くと、同一トランザクション内で
--      自分がinsertしたeffect行が自分のDELETEでcascade削除され、
--      記録が自身の記録トランザクションを生き残れない（構造的欠陥）。
--      T2（step-1 doc）実測: trim（第4段の最初の consumer）は分裂
--      （update + insert）のみを生成し、物理 DELETE を発生させないため、
--      この欠落は第4段をブロックしない。将来 hard-delete command を作る段で
--      FK 設計ごと再検討する
--
-- 複数resourceにまたがる行ロックは (resource_type, COALESCE(plan_id, record_id))
-- の昇順で取得する（apply RPC 内でこの順に effects を処理する）。
-- 順序を固定しないと、同一 user の複数 Undo が異なる順で行ロックを取り
-- デッドロック（40P01）を起こしうる。
--
-- expand-only: 新規列3つの追加・field_name allowlist CHECK・新規RPC 3本・
-- purge関数のCREATE OR REPLACEのみ。既存テーブルの列の意味やデータは変えない。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. additive 列
-- =============================================================================

ALTER TABLE public.undo_receipts
  ADD COLUMN origin_scopes_snapshot TEXT[],
  ADD COLUMN had_origin_connection BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN recorded_effect_count SMALLINT NOT NULL DEFAULT 0
    CHECK (recorded_effect_count >= 0);

COMMENT ON COLUMN public.undo_receipts.origin_scopes_snapshot IS
  'receipt作成時点のorigin_connectionのscopesを固定コピー。NULL = UI由来（had_origin_connection=false）。oauth_connections.scopesは可変なのでTOCTOU防止のためスナップショットする。';
COMMENT ON COLUMN public.undo_receipts.had_origin_connection IS
  '作成時にorigin_connection_idが非NULLだったかを固定する。origin_connection_idはON DELETE SET NULLで物理削除時にNULLへ落ちるため、この列が無いと「UI由来」と「connection消滅」を区別できない。';
COMMENT ON COLUMN public.undo_receipts.recorded_effect_count IS
  '作成トランザクション内でDB側が算出したeffect件数（アプリ入力は信頼しない）。apply時に現在のeffect数と再照合し、CASCADEによる欠損（他経路の物理削除・account purge後）を検出する。';

-- field_name の allowlist CHECK（第3段で入れる約束、シナリオ6）。
-- plans/records の交差集合のみを許可する。id/user_id/tag_id/source等の
-- FK・trigger制約が絡む列は現時点で必要な consumer が無いため対象外
-- （第4段以降で実需が出たらadditiveに広げる）。
ALTER TABLE public.undo_receipt_field_changes
  ADD CONSTRAINT undo_receipt_field_changes_field_name_allowlist
    CHECK (field_name IN ('title', 'note', 'start_at', 'end_at', 'skipped_at', 'deleted_at'));

COMMENT ON CONSTRAINT undo_receipt_field_changes_field_name_allowlist
  ON public.undo_receipt_field_changes IS
  'Undo対象として許可するフィールドの allowlist。id/user_id/所有権列/trigger制約付き列を除外する。RPCの動的UPDATE/DELETEもこの集合だけを型変換できる（private.undo_field_sql_type_v1参照）。';

-- =============================================================================
-- 2. 型変換ヘルパー（allowlistの各fieldをJSONBから実列型へ変換する）
-- =============================================================================

CREATE FUNCTION private.undo_field_sql_type_v1(p_field_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE p_field_name
    WHEN 'title' THEN 'text'
    WHEN 'note' THEN 'text'
    WHEN 'start_at' THEN 'timestamptz'
    WHEN 'end_at' THEN 'timestamptz'
    WHEN 'skipped_at' THEN 'timestamptz'
    WHEN 'deleted_at' THEN 'timestamptz'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION private.undo_field_sql_type_v1(TEXT) IS
  'field_name -> SQL型名。undo_receipt_field_changes_field_name_allowlistと同じ集合を持つ。NULLを返したらallowlist外（CHECK制約と矛盾しているはずなので呼び出し側はRAISEする）。';

-- resource_type + effect_kind -> Undoに要るscope。
-- updateのundo=書き戻し（write:*）、insertのundo=DELETE（delete:*）。
-- deleteは呼ばれない前提（apply側でCHECK済み）。
CREATE FUNCTION private.undo_required_scope_v1(p_resource_type TEXT, p_effect_kind TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_effect_kind = 'update' AND p_resource_type = 'plan' THEN 'write:plans'
    WHEN p_effect_kind = 'update' AND p_resource_type = 'record' THEN 'write:records'
    WHEN p_effect_kind = 'insert' AND p_resource_type = 'plan' THEN 'delete:plans'
    WHEN p_effect_kind = 'insert' AND p_resource_type = 'record' THEN 'delete:records'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION private.undo_required_scope_v1(TEXT, TEXT) IS
  'Undo実行に要るscope。「元操作より強い権限を得ない」の具体化: insert effectのundoは物理DELETEなので、書き込み時のscopeではなくdelete系scopeを要求する。';

-- =============================================================================
-- 3. record_undo_receipt_v1: 1操作分のreceipt+effects+field_changesを記録する
-- =============================================================================

CREATE FUNCTION private.record_undo_receipt_v1(
  p_user_id UUID,
  p_operation_id UUID,
  p_command_name TEXT,
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
  v_effect_count SMALLINT := 0;
  v_recorded_count SMALLINT;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'record_undo_receipt_v1 requires user_id and operation_id'
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
    END LOOP;

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

COMMENT ON FUNCTION private.record_undo_receipt_v1(UUID, UUID, TEXT, UUID, INTEGER, JSONB) IS
  'domain command が1操作分のUndo receiptを記録する。p_effects形状: [{"plan_id"|"record_id": uuid, "effect_kind": "insert"|"update", "field_changes": [{"field_name","before_value","after_value"}]}]。operation_id冪等・recorded_effect_countのDB側確定込み。';

CREATE FUNCTION public.record_undo_receipt_v1(
  p_user_id UUID,
  p_operation_id UUID,
  p_command_name TEXT,
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
    p_user_id, p_operation_id, p_command_name, p_origin_connection_id,
    p_undo_ttl_seconds, p_effects
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_undo_receipt_v1(UUID, UUID, TEXT, UUID, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_undo_receipt_v1(UUID, UUID, TEXT, UUID, INTEGER, JSONB)
  TO service_role;

-- =============================================================================
-- 4. apply_undo_receipt_v1: 権限交差判定 + CAS + all-or-nothing適用
-- =============================================================================

CREATE FUNCTION private.apply_undo_receipt_v1(
  p_user_id UUID,
  p_receipt_id UUID,
  p_apply_operation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
AS $$
DECLARE
  v_receipt public.undo_receipts%ROWTYPE;
  v_current_effect_count SMALLINT;
  v_connection RECORD;
  v_effective_scopes TEXT[];
  v_effect RECORD;
  v_required_scope TEXT;
  v_set_clauses TEXT[];
  v_where_clauses TEXT[];
  v_field RECORD;
  v_field_type TEXT;
  v_field_sql TEXT;
  v_table_name TEXT;
  v_resource_id UUID;
  v_row_count INTEGER;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();

  IF p_user_id IS NULL OR p_receipt_id IS NULL OR p_apply_operation_id IS NULL THEN
    RAISE EXCEPTION 'apply_undo_receipt_v1 requires user_id, receipt_id, apply_operation_id'
      USING ERRCODE = '22004';
  END IF;

  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  -- receipt自体をロックする（同一receiptへの同時apply/二重undoを防ぐ）。
  SELECT * INTO v_receipt
  FROM public.undo_receipts
  WHERE id = p_receipt_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'undo receipt % not found' , p_receipt_id
      USING ERRCODE = 'DR001';
  END IF;

  IF v_receipt.undone_at IS NOT NULL THEN
    IF v_receipt.undone_operation_id = p_apply_operation_id THEN
      -- 同一apply操作の再送。冪等に成功を返す。
      RETURN;
    END IF;
    RAISE EXCEPTION 'undo receipt % was already undone' , p_receipt_id
      USING ERRCODE = 'DR002';
  END IF;

  IF v_receipt.undo_expires_at <= now() THEN
    RAISE EXCEPTION 'undo receipt % has expired', p_receipt_id
      USING ERRCODE = 'DR003';
  END IF;

  -- 欠損検査: 記録時のeffect数と現在のeffect数を再照合する。
  -- CASCADEによる部分/全部欠損（単発の物理削除・account purge後のtombstone）を
  -- silent no-op / silent partial applyにしない。
  SELECT count(*) INTO v_current_effect_count
  FROM public.undo_receipt_effects
  WHERE receipt_id = p_receipt_id;

  IF v_current_effect_count <> v_receipt.recorded_effect_count THEN
    RAISE EXCEPTION 'undo receipt % effect count mismatch (recorded %, current %); resource(s) were removed by another path',
      p_receipt_id, v_receipt.recorded_effect_count, v_current_effect_count
      USING ERRCODE = 'DR004';
  END IF;

  -- 権限交差判定（UI由来はスキップ、origin_connection由来は現在scopes ∩ snapshot）。
  IF v_receipt.had_origin_connection THEN
    IF v_receipt.origin_connection_id IS NULL THEN
      -- connectionが物理削除された（retention cleanup）。revoke相当として拒否する。
      RAISE EXCEPTION 'undo receipt % origin connection no longer exists (treated as revoked)',
        p_receipt_id
        USING ERRCODE = 'DR005';
    END IF;

    -- FOR UPDATEでconnection行をロックし、権限判定と同時進行のrevokeのTOCTOUを防ぐ。
    SELECT connection.revoked_at, connection.reauth_required_at, connection.scopes
    INTO v_connection
    FROM public.oauth_connections AS connection
    WHERE connection.id = v_receipt.origin_connection_id AND connection.user_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'undo receipt % origin connection not found', p_receipt_id
        USING ERRCODE = 'DR005';
    END IF;
    IF v_connection.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'undo receipt % origin connection is revoked', p_receipt_id
        USING ERRCODE = 'DR006';
    END IF;
    IF v_connection.reauth_required_at <= now() THEN
      RAISE EXCEPTION 'undo receipt % origin connection requires reauth', p_receipt_id
        USING ERRCODE = 'DR007';
    END IF;

    SELECT ARRAY(
      SELECT unnest(v_connection.scopes)
      INTERSECT
      SELECT unnest(v_receipt.origin_scopes_snapshot)
    ) INTO v_effective_scopes;
  END IF;

  -- 対象resourceを正準順（resource_type, resource_id昇順）で処理し、
  -- 複数effectをまたぐFOR UPDATEのロック順序をUndo呼び出し間で一貫させる
  -- （デッドロック防止）。
  FOR v_effect IN
    SELECT effect.id, effect.plan_id, effect.record_id, effect.resource_type, effect.effect_kind
    FROM public.undo_receipt_effects AS effect
    WHERE effect.receipt_id = p_receipt_id
    ORDER BY effect.resource_type, COALESCE(effect.plan_id, effect.record_id)
  LOOP
    IF v_effect.effect_kind = 'delete' THEN
      RAISE EXCEPTION 'undo receipt % contains an unsupported delete effect', p_receipt_id
        USING ERRCODE = 'DR008';
    END IF;

    IF v_receipt.had_origin_connection THEN
      v_required_scope := private.undo_required_scope_v1(v_effect.resource_type, v_effect.effect_kind);
      IF v_required_scope IS NULL OR NOT (v_required_scope = ANY(v_effective_scopes)) THEN
        RAISE EXCEPTION 'undo receipt % lacks required scope % for % effect on %',
          p_receipt_id, v_required_scope, v_effect.effect_kind, v_effect.resource_type
          USING ERRCODE = 'DR009';
      END IF;
    END IF;

    v_table_name := v_effect.resource_type || 's'; -- 'plan' -> 'plans', 'record' -> 'records'
    v_resource_id := COALESCE(v_effect.plan_id, v_effect.record_id);
    v_set_clauses := ARRAY[]::TEXT[];
    v_where_clauses := ARRAY[]::TEXT[];

    FOR v_field IN
      SELECT field_name, before_value, after_value
      FROM public.undo_receipt_field_changes
      WHERE effect_id = v_effect.id
      ORDER BY field_name
    LOOP
      v_field_type := private.undo_field_sql_type_v1(v_field.field_name);
      IF v_field_type IS NULL THEN
        RAISE EXCEPTION 'internal error: field % has no known SQL type', v_field.field_name
          USING ERRCODE = 'XX000';
      END IF;

      -- CAS: 現在値 == after_value（mask内フィールドが元操作後に変更されていないか）。
      v_where_clauses := array_append(
        v_where_clauses,
        format('%I IS NOT DISTINCT FROM %L::%s', v_field.field_name, v_field.after_value #>> '{}', v_field_type)
      );

      IF v_effect.effect_kind = 'update' THEN
        -- 復元先はbefore_value。
        v_field_sql := format('%I = %L::%s', v_field.field_name, v_field.before_value #>> '{}', v_field_type);
        v_set_clauses := array_append(v_set_clauses, v_field_sql);
      END IF;
    END LOOP;

    IF v_effect.effect_kind = 'update' THEN
      EXECUTE format(
        'UPDATE public.%I SET %s WHERE id = %L AND user_id = %L AND %s',
        v_table_name,
        array_to_string(v_set_clauses, ', '),
        v_resource_id,
        p_user_id,
        array_to_string(v_where_clauses, ' AND ')
      );
    ELSE
      -- insert effect の undo = 対象行のDELETE。
      EXECUTE format(
        'DELETE FROM public.%I WHERE id = %L AND user_id = %L AND %s',
        v_table_name,
        v_resource_id,
        p_user_id,
        array_to_string(v_where_clauses, ' AND ')
      );
    END IF;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count <> 1 THEN
      RAISE EXCEPTION 'undo receipt % CAS failed for % % (masked fields changed since original operation, or resource missing)',
        p_receipt_id, v_effect.resource_type, v_resource_id
        USING ERRCODE = 'DR010';
    END IF;
  END LOOP;

  UPDATE public.undo_receipts
  SET undone_at = now(), undone_operation_id = p_apply_operation_id
  WHERE id = p_receipt_id;
END;
$$;

COMMENT ON FUNCTION private.apply_undo_receipt_v1(UUID, UUID, UUID) IS
  '権限交差判定 -> 欠損検査 -> 正準順でのCAS適用（all-or-nothing）。deleteのeffect_kindは構造的に来ない前提でRAISEする。';

CREATE FUNCTION public.apply_undo_receipt_v1(
  p_user_id UUID,
  p_receipt_id UUID,
  p_apply_operation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.apply_undo_receipt_v1(p_user_id, p_receipt_id, p_apply_operation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_undo_receipt_v1(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_undo_receipt_v1(UUID, UUID, UUID)
  TO service_role;

-- =============================================================================
-- 5. list_undoable_receipts_v1: TTL内・未Undo・欠損なしの一覧
-- =============================================================================

CREATE FUNCTION private.list_undoable_receipts_v1(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  operation_id UUID,
  command_name TEXT,
  created_at TIMESTAMPTZ,
  undo_expires_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT receipt.id, receipt.operation_id, receipt.command_name,
    receipt.created_at, receipt.undo_expires_at
  FROM public.undo_receipts AS receipt
  WHERE receipt.user_id = p_user_id
    AND receipt.undone_at IS NULL
    AND receipt.undo_expires_at > now()
    AND receipt.recorded_effect_count > 0
    AND receipt.recorded_effect_count = (
      SELECT count(*) FROM public.undo_receipt_effects AS effect
      WHERE effect.receipt_id = receipt.id
    )
  ORDER BY receipt.created_at DESC;
$$;

COMMENT ON FUNCTION private.list_undoable_receipts_v1(UUID) IS
  '一覧でも欠損検査（recorded_effect_count照合）を適用し、CASCADEで欠けたreceipt（tombstone・単発物理削除）をUndo可能一覧から除外する。';

CREATE FUNCTION public.list_undoable_receipts_v1(p_user_id UUID)
RETURNS TABLE (
  id UUID,
  operation_id UUID,
  command_name TEXT,
  created_at TIMESTAMPTZ,
  undo_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  RETURN QUERY SELECT * FROM private.list_undoable_receipts_v1(p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.list_undoable_receipts_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_undoable_receipts_v1(UUID)
  TO service_role;

-- private関数はservice_roleからも直接呼べないようにする（既存パターン踏襲）。
REVOKE ALL ON FUNCTION private.record_undo_receipt_v1(UUID, UUID, TEXT, UUID, INTEGER, JSONB)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.apply_undo_receipt_v1(UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.list_undoable_receipts_v1(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION private.undo_field_sql_type_v1(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.undo_required_scope_v1(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 6. 権限不変条件（機械チェック、第2段のtable版DOブロックをfunctionへ拡張）
-- =============================================================================
-- 第2段のtable向けDOブロックには対応する function-level EXECUTE権限の
-- 機械チェックが無かった（risk-reviewer指摘）。ここで新設3関数について
-- anon/authenticatedがEXECUTEを持たないことを機械的に固定する。

DO $$
DECLARE
  new_functions TEXT[] := ARRAY[
    'public.record_undo_receipt_v1(uuid,uuid,text,uuid,integer,jsonb)',
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
-- 7. purge: undo_receipts の全削除をundo_receipt_effectsのみへ変更する
-- =============================================================================
-- #2434の入口3（PII/tombstone分離）。20260827014215で敷いたv4の該当行を、
-- 親行（PIIを持たない）を残しeffects（PIIを持つ）だけ消す形へ変える。
-- **既存statementは一字も変えていない（20260827014215自身の expand-only 方針の
-- 継承）。変更は対象DELETE文の1行とその直前コメントのみ。**
-- CREATE OR REPLACE FUNCTIONはREVOKE/GRANTを引き継ぐため（20260827014215自身も
-- 再宣言していない）、ここでも再宣言しない。

CREATE OR REPLACE FUNCTION public.delete_all_user_data_command_v4(
  p_project_key TEXT,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
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

  DELETE FROM public.tags
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
$$;

COMMIT;

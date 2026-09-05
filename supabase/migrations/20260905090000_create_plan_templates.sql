-- #2567: テンプレート（型）を実データへ配線する。
--
-- v1.0 §5.4 の契約: テンプレートが保存するのは**組成・順序・錨位置のみ**。寸法（各ブロックの
-- 長さ）は持たず、適用時に activity 別の実績中央値（Record の実時間）を着て具現化する。
-- 順序は錨位置（anchor_minute）の昇順そのもので、独立した sort_order 列は持たない
-- （「一日の並び」で順序と錨位置は同じものであり、二重に持つと不整合が生まれる）。
--
-- 所有者整合は segments / plans と同じく**複合 FK** で守る（トリガー不要）:
--   plan_template_blocks.(template_id, user_id) → plan_templates.(id, user_id)
--   plan_template_blocks.(activity_id, user_id) → activities.(id, user_id)
-- 他人の template_id へ自分の子行を混ぜる・他人の activity を保存する経路を構造で塞ぐ。
--
-- activity を hard delete した時は activity_id だけ NULL になり block（組成）は残る
-- （plans_activity_owner_fkey と同形）。archive 時の扱いは app 層（activity_id = null で
-- title を保って具現化）で決める。
--
-- 適用（apply）は N 件の Plan を 1 transaction で置く必要があるため、汎用の bulk command
-- `create_plans_bulk_command_v1` を足す。中身は既存 `private.create_plan_unserialized_v1`
-- のループ呼び出しで、検証（content / active activity / source shape）と overlap
-- （plans_no_overlap EXCLUDE）は既存の 1 件 command と完全に同じ規則が効く。
--
-- 旧案 `_archive/20260221100000_create_plan_templates.sql` は duration を持ち tags 参照で
-- 現行規約（複合 FK / REVOKE→GRANT / preamble）も欠くため、設計ごと捨てて書き起こした。
-- archive ファイル自体は触らない。
--
-- 依存: activities_id_user_id_unique（20260818120000）、private.create_plan_unserialized_v1
-- （20260824090000）、public.update_updated_at（baseline）。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- =============================================================================
-- 1. plan_templates
-- =============================================================================

CREATE TABLE public.plan_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- plan_template_blocks からの複合 FK 参照先
  CONSTRAINT plan_templates_id_user_id_unique UNIQUE (id, user_id),
  -- 空白のみの名前を弾く（segments_name_not_blank と同形）。上限は Sidebar 1 行に収まる長さ
  CONSTRAINT plan_templates_name_length CHECK (
    length(btrim(name)) > 0 AND length(name) <= 100
  )
);

-- Sidebar 一覧（user_id で絞って作成順）
CREATE INDEX plan_templates_user_id_created_at_idx
  ON public.plan_templates (user_id, created_at);

-- =============================================================================
-- 2. plan_template_blocks（組成・順序・錨位置。寸法列は持たない）
-- =============================================================================

CREATE TABLE public.plan_template_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- NULL = 未分類（activity 無し）。activity 削除時も NULL へ落ちて block は残る
  activity_id UUID,
  -- 保存時点の Plan title のスナップショット。activity が消えても名前が残る
  title TEXT NOT NULL,
  -- 錨位置: 適用先ユーザー timezone の local midnight からの分（0..1439）。
  -- 比率で持つと DST の 23h / 25h 日で錨がずれるため分で持つ
  anchor_minute SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plan_template_blocks_template_owner_fkey
    FOREIGN KEY (template_id, user_id)
    REFERENCES public.plan_templates (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT plan_template_blocks_activity_owner_fkey
    FOREIGN KEY (activity_id, user_id)
    REFERENCES public.activities (id, user_id)
    ON DELETE SET NULL (activity_id),
  -- 順序 = 錨位置の昇順。同じ錨に 2 つ置けないので順序は全順序になる
  CONSTRAINT plan_template_blocks_template_anchor_unique UNIQUE (template_id, anchor_minute),
  CONSTRAINT plan_template_blocks_anchor_minute_range CHECK (
    anchor_minute BETWEEN 0 AND 1439
  ),
  -- plans.title と同じ上限（assert_timeblock_content_v1 の 200）
  CONSTRAINT plan_template_blocks_title_length CHECK (
    length(title) > 0 AND length(title) <= 200
  )
);

-- template_id からの引き当ては UNIQUE (template_id, anchor_minute) の先頭列で賄える。
-- 「この activity を参照する template」の逆引き（activity 削除の影響確認）だけ索引を足す。
CREATE INDEX plan_template_blocks_activity_id_idx
  ON public.plan_template_blocks (activity_id);

-- =============================================================================
-- 3. RLS
-- =============================================================================

ALTER TABLE public.plan_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_template_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plan_templates" ON public.plan_templates
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own plan_templates" ON public.plan_templates
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can update own plan_templates" ON public.plan_templates
  FOR UPDATE USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own plan_templates" ON public.plan_templates
  FOR DELETE USING ((select auth.uid()) = user_id);

-- plan_template_blocks は **UPDATE を持たない**。組成の変更は「消して入れ直す」
-- （型を一日として開いて上書き保存する将来の経路も同じ）。
CREATE POLICY "Users can view own plan_template_blocks" ON public.plan_template_blocks
  FOR SELECT USING ((select auth.uid()) = user_id);
CREATE POLICY "Users can insert own plan_template_blocks" ON public.plan_template_blocks
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);
CREATE POLICY "Users can delete own plan_template_blocks" ON public.plan_template_blocks
  FOR DELETE USING ((select auth.uid()) = user_id);

-- =============================================================================
-- 4. GRANT（REVOKE を先に打つ。理由は 20260818130000 参照 — production の
--    pg_default_acl は新規 public テーブルへ anon / authenticated に arwdDxtm を既定付与する）
-- =============================================================================

REVOKE ALL ON TABLE public.plan_templates, public.plan_template_blocks
  FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.plan_templates
  TO authenticated;

GRANT SELECT, INSERT, DELETE
  ON TABLE public.plan_template_blocks
  TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.plan_templates
  TO service_role;

GRANT SELECT, INSERT, DELETE
  ON TABLE public.plan_template_blocks
  TO service_role;

-- =============================================================================
-- 5. Privilege invariants
-- =============================================================================

DO $$
DECLARE
  new_tables TEXT[] := ARRAY['public.plan_templates', 'public.plan_template_blocks'];
  dml_privileges TEXT[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  target_table TEXT;
  privilege TEXT;
BEGIN
  FOREACH target_table IN ARRAY new_tables LOOP
    FOREACH privilege IN ARRAY dml_privileges LOOP
      IF has_table_privilege('anon', target_table, privilege) THEN
        RAISE EXCEPTION 'anon must not hold % on %', privilege, target_table;
      END IF;
    END LOOP;

    IF has_table_privilege('anon', target_table, 'TRUNCATE')
      OR has_table_privilege('authenticated', target_table, 'TRUNCATE')
    THEN
      RAISE EXCEPTION 'browser roles must not hold TRUNCATE on %', target_table;
    END IF;
  END LOOP;

  FOREACH privilege IN ARRAY dml_privileges LOOP
    IF NOT has_table_privilege('authenticated', 'public.plan_templates', privilege) THEN
      RAISE EXCEPTION 'authenticated is missing % on public.plan_templates', privilege;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.plan_templates', privilege) THEN
      RAISE EXCEPTION 'service_role is missing % on public.plan_templates', privilege;
    END IF;
  END LOOP;

  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'DELETE'] LOOP
    IF NOT has_table_privilege('authenticated', 'public.plan_template_blocks', privilege) THEN
      RAISE EXCEPTION 'authenticated is missing % on public.plan_template_blocks', privilege;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.plan_template_blocks', privilege) THEN
      RAISE EXCEPTION 'service_role is missing % on public.plan_template_blocks', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.plan_template_blocks', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated must not hold UPDATE on public.plan_template_blocks';
  END IF;
END;
$$;

-- =============================================================================
-- 6. updated_at
-- =============================================================================

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.plan_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- 7. 適用用の bulk command（N 件の Plan を 1 transaction で置く）
-- =============================================================================
-- TS service が template から start_at / end_at / activity_id / title を計算し、
-- ここへ配列で渡す。1 件でも検証・overlap（plans_no_overlap → 23P01）で落ちれば
-- 全件 rollback される。template の所有者検証は service が RLS client で template を
-- 読む段階で済む（他人の id は行が返らず NOT_FOUND）。この command 自体は
-- template を知らない汎用の「複数 Plan 作成」で、activity の所有者・archive 検証は
-- private.create_plan_unserialized_v1 が 1 件ずつ行う。
--
-- 業務計算（中央値・DST・clip）は TS 側にあり、ここは原子的 write 境界だけを担う。

CREATE FUNCTION public.create_plans_bulk_command_v1(
  p_user_id UUID,
  p_plans JSONB
)
RETURNS SETOF public.plans
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '30s'
AS $$
DECLARE
  v_plan JSONB;
BEGIN
  PERFORM private.assert_timeblock_service_role_request_v1();
  PERFORM private.lock_timeblock_user_write_shared_v1(p_user_id);

  IF p_plans IS NULL OR pg_catalog.jsonb_typeof(p_plans) <> 'array' THEN
    RAISE EXCEPTION 'Bulk plan input must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_array_length(p_plans) < 1
    OR pg_catalog.jsonb_array_length(p_plans) > 50 THEN
    RAISE EXCEPTION 'Bulk plan input must contain 1 to 50 plans' USING ERRCODE = '22023';
  END IF;

  FOR v_plan IN
    SELECT element.value FROM pg_catalog.jsonb_array_elements(p_plans) AS element
  LOOP
    RETURN QUERY
    SELECT implementation.*
    FROM private.create_plan_unserialized_v1(
      p_user_id,
      v_plan ->> 'title',
      NULL,
      NULL,
      'manual',
      (v_plan ->> 'start_at')::TIMESTAMPTZ,
      (v_plan ->> 'end_at')::TIMESTAMPTZ,
      (v_plan ->> 'activity_id')::UUID
    ) AS implementation;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.create_plans_bulk_command_v1(UUID, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_plans_bulk_command_v1(UUID, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.create_plans_bulk_command_v1(UUID, JSONB) IS
  'Create up to 50 Plans atomically through the same validation as create_plan_command_v1 (#2567 template apply). Rolls back all rows on the first failure.';

-- =============================================================================
-- 8. account-preserving purge へ plan_templates を列挙する
-- =============================================================================
-- user_id を持つ public table は purge チェーンが直接 DELETE するか CASCADE で到達できる
-- 必要がある（user-data-purge-enumeration.integration.test.ts が機械で止める）。
-- plan_templates は auth.users からしか CASCADE されず、account-preserving purge は
-- auth.users を消さないので、v4 本体（20260903120000 の最新定義）に DELETE を 1 つ足す。
-- 本体の他の部分は変えていない。

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

  -- #2567: テンプレート（型）。plan_template_blocks は plan_templates からの複合 FK
  -- CASCADE で落ちる。activities より先に消すことで、activity 削除時の
  -- activity_id SET NULL が blocks に走らない（segments と同じ順序の理由）。
  DELETE FROM public.plan_templates
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


COMMENT ON FUNCTION public.delete_all_user_data_command_v4(TEXT, UUID) IS
  'Account-preserving purge (v4, product entry via v5 delegation). Deletes user-owned plans/records/reports/settings/calendar data/classification model rows/plan templates and undo_receipt_effects (undo_receipts parent rows are retained as PII-free tombstones, #2434). Revokes OAuth state and tombstones mcp_mutation_receipts. Idempotent per user_data_controls generation.';

COMMIT;

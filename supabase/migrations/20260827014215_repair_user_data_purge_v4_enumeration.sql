-- #2444 の修復を **製品が実際に通る経路** へ適用する（Codex C の P1 指摘、2026-08-27）。
--
-- 直前の migration 20260826235012 は `delete_all_user_data_command_v3` を修復したが、
-- **v3 には生きた呼び出し元が無い**。製品の削除経路は次のとおり:
--
--   apps/product/src/features/external-calendar/server/account-deletion.ts:21
--     DELETE_ALL_DATA_RPC = 'delete_all_user_data_command_v5'
--   → v5（20260730090020:139）が PERFORM public.delete_all_user_data_command_v4(...)
--   → v4（20260730090014）が自前の DELETE 列挙を持つ（v3 を呼ばない独立実装）
--
-- つまり v3 だけを直しても、**製品経路では activities / categories / segments /
-- undo_receipts が消えないまま**だった。列挙 test も v3 を見ていたため green を返し、
-- 「直った」と誤認したまま出荷する寸前だった。
--
-- **なぜ 4 者のレビューを通り抜けたか**: #2444 の起票時に `rg` で見つけた関数名（v3）を
-- 起点にし、**呼び出し元から辿らなかった**。以後の検証（レーン・指揮台・risk-reviewer・
-- behavior-verifier）はすべてその前提を共有したまま行われた。呼び出し元から逆に辿ったのは
-- 別系統の Codex だけだった。
--
-- 再発防止は test 側にある（user-data-purge-enumeration.integration.test.ts）:
-- 関数名をハードコードするのをやめ、**製品コードの RPC 定数から委譲チェーンを辿って**
-- 検査対象を決めるようにした。関数名を固定する限り、また同じ形で死んだ関数を検査しうる。
--
-- expand-only: 関数の置き換えのみ。schema の形もシグネチャも変えない。追加は 4 DELETE と
-- コメントだけで、既存 statement は一字も変えていない（旧版の厳密な superset）。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

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


-- v3 はレガシー。製品経路（v5 → v4）からは呼ばれない。#2444 の修復は履歴として
-- 残してあるが、**enumeration の正本は v4** であり、新しい削除対象は v4 へ足すこと。
COMMENT ON FUNCTION public.delete_all_user_data_command_v3(UUID) IS
  'LEGACY (no live callers; the product path is v5 -> v4). Kept for history and for user-data-purge-generation.integration.test.ts. Account-preserving purge with generation advance, Calendar revoke capture, MCP revocation, reports, mirrors, undo receipts, and the activity / category / segment classification model; service role only. Intentionally retained (not a gap): mfa_recovery_codes, oauth_audit_log, product_events, and mcp_mutation_receipts (tombstoned instead).';

COMMENT ON FUNCTION public.delete_all_user_data_command_v4(TEXT, UUID) IS
  'Account-preserving purge reached by the product (account-deletion.ts -> v5 -> v4). Deletes undo receipts, Plan / Record data, reports, tags, user settings, Calendar connections, external events, and the activity / category / segment classification model. Intentionally retained (not a gap): mfa_recovery_codes, oauth_audit_log, product_events, and mcp_mutation_receipts (tombstoned instead).';

COMMIT;

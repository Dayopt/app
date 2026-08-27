-- #2444（+ #2433 同乗）: account-preserving purge の列挙漏れを直す。
--
-- `public.delete_all_user_data_command_v3` は `auth.users` を消さずにユーザーデータだけを
-- 消す GDPR 相当の purge で、**消す対象を関数本文に列挙している**。列挙から漏れたテーブルの
-- 行は purge 後もそのまま残る。
--
-- 2 つの漏れを同時に塞ぐ:
--
--   1. #2444（既存バグ）— 2026-08-18 の #2162 で `tags` を `activities` / `categories` /
--      `segments` へ置き換えた際、新モデルを列挙へ追加し忘れた。旧 `tags` は消えるのに
--      後継が残るという逆転状態だった
--   2. #2433（本 PR で新設）— `undo_receipts` 系。before/after image としてユーザー本文を
--      持つため、漏らすと「データを消した」と言えなくなる
--
-- **意図的に消さないもの**（2026-08-27 User 裁可）は関数本文のコメントに明記した。
-- 「漏れ」と「意図的な保持」が見分けられない状態そのものが再発の温床なので、
-- 次に棚卸しする人が同じ 3 件を拾い直さずに済む形にする。
--
-- 再発防止の本体は test 側にある（`user-data-purge-enumeration.integration.test.ts`）。
-- 「`user_id` を持つ public table は、purge に列挙されているか allowlist に載っているかの
-- どちらか」を機械で強制するので、新規テーブルの追加漏れはその時点で落ちる。
-- 列挙を人が維持する限り漏れは再発する（#2162 で一度、#2444 で二度目）ため、
-- 点を塞ぐのではなく class を閉じる。
--
-- expand-only: 関数の置き換えのみ。schema の形は変えない。旧アプリから見た呼び出し
-- シグネチャ・戻り値も同一なので、mixed-version deploy で壊れる経路が無い。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.delete_all_user_data_command_v3(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET lock_timeout = '5s'
SET statement_timeout = '60s'
AS $$
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
$$;


COMMIT;

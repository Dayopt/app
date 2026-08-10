-- cleanup_oauth_connections_v1 の候補から「残存する子行を持つ親」を外す。
--
-- 20260810070002 の p_limit が縛るのは親 connection の件数だけで、削除が起動する
-- public.oauth_tokens / public.oauth_authorization_codes の ON DELETE CASCADE は
-- 無制限に走る。子行を大量に抱えた親が 1 個あるだけで 1 回の DELETE が RPC timeout
-- （dispatcher の DB_RPC_TIMEOUT_MS）を超え、transaction ごと rollback して cron が
-- 恒久的に失敗しうる。
--
-- 子は必ず親より先に due になる。token の expires_at は発行時に
-- connection.reauth_required_at でクランプされる
-- （20260729062430_oauth_refresh_rotation_hardening.sql の
-- LEAST(v_now + INTERVAL '30 days', v_connection.reauth_required_at)）ため、
-- 親が 90 日超過で due になる時点で配下の token / code は自身の期限（24h / 30d）を
-- とうに過ぎている。dispatcher は codes → access → refresh → connections の順で
-- 呼ぶので、先行 step が排出し終えた次の実行でこの親も消える。
--
-- 結果として cleanup は status RPC の connections_due 判定より**一時的に狭く**なるが、
-- 収束は保証される（due flag は排出が終わるまで残り、fail closed の報告は維持される）。
-- mcp_mutation_receipts.origin_connection_id の ON DELETE SET NULL は引き続き
-- cascade に任せる。1 connection あたりの receipt 数が RPC timeout に届く水準
-- （10^5 行規模）は現実的な利用では発生しない。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.cleanup_oauth_connections_v1(
  p_limit INTEGER DEFAULT 1000
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cutoff CONSTANT TIMESTAMPTZ :=
    pg_catalog.clock_timestamp() - INTERVAL '90 days';
  v_deleted INTEGER;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 10000 THEN
    RAISE EXCEPTION 'OAuth connection cleanup limit must be between 1 and 10000'
      USING ERRCODE = '22023';
  END IF;

  -- NOTE (customer-visible): 時刻の述語は
  -- get_external_authority_maintenance_status_v1() の connections_due と逐語一致させて
  -- ある。未 revoke のまま reauth_required_at を 90 日超過した connection も含むため、
  -- Settings 一覧（revoked_at IS NULL）に見えている行を消しうる。これは status RPC の
  -- 契約どおりで、どの connection を due とするかの変更はこの RPC の scope 外。
  WITH candidates AS MATERIALIZED (
    SELECT connection.id
    FROM public.oauth_connections AS connection
    WHERE (
      CASE
        WHEN connection.revoked_at IS NULL THEN connection.reauth_required_at
        WHEN connection.revoked_at < connection.reauth_required_at THEN connection.revoked_at
        ELSE connection.reauth_required_at
      END
    ) <= v_cutoff
      AND NOT EXISTS (
        SELECT 1
        FROM public.oauth_tokens AS token
        WHERE token.connection_id = connection.id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.oauth_authorization_codes AS code
        WHERE code.connection_id = connection.id
      )
    ORDER BY (
      CASE
        WHEN connection.revoked_at IS NULL THEN connection.reauth_required_at
        WHEN connection.revoked_at < connection.reauth_required_at THEN connection.revoked_at
        ELSE connection.reauth_required_at
      END
    ), connection.id
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.oauth_connections AS connection
  USING candidates
  WHERE connection.id = candidates.id
    AND (
      CASE
        WHEN connection.revoked_at IS NULL THEN connection.reauth_required_at
        WHEN connection.revoked_at < connection.reauth_required_at THEN connection.revoked_at
        ELSE connection.reauth_required_at
      END
    ) <= v_cutoff;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.cleanup_oauth_connections_v1(INTEGER) IS
  'Deletes connections whose effective revoke/reauth deadline passed at least 90 days ago and that have no bound tokens/codes left, in a bounded batch; detaches mcp_mutation_receipts.origin_connection_id. Callable only by service_role.';

COMMIT;

-- #2050: sync-service.ts / connection-service.ts の fenced writer 移行が安全に使える
-- schema 版を明示するための terminal marker。既存の get_external_lifecycle_app_version_v2
-- は Candidate 3（authority fence / generation）lifecycle chain 専用の marker で、
-- fenced calendar sync writer RPC 群（20260730090017_fenced_calendar_sync_writers.sql）の
-- 存在を保証する設計ではない。現状 v2 が両方を正しく含意しているのは migration 適用順の
-- 偶然（090017 が v1/v2 marker より前）にすぎないため、専用の _v3 marker を切って gate を
-- 明示的にする（plan-critic 指摘、docs/projects/external-calendar-fenced-writer-migration/
-- overview.md §0）。この migration は #2078 の allowlist 追加より後に適用する
-- （20260820120000_extend_calendar_sync_error_allowlist.sql）。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.get_external_lifecycle_app_version_v3()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT 2;
$$;

REVOKE ALL ON FUNCTION public.get_external_lifecycle_app_version_v3()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_external_lifecycle_app_version_v3()
  TO service_role;

COMMENT ON FUNCTION public.get_external_lifecycle_app_version_v3() IS
  'Returns external lifecycle schema version 2 only after the fenced calendar sync writer RPCs (20260730090017) and the partial_timeout allowlist entry (#2078) are both installed; service role only.';

COMMIT;

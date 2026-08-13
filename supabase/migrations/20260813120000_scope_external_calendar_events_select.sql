-- #1992: external_calendar_events.description の SELECT を DB 側で封じる。
--
-- risk-reviewer が #1962（PR #1991）で指摘（2026-08-12）: ghost 表示の読み取り経路
-- （event-query-service.ts）は select 句で description を確実に除外しているが、GRANT が
-- テーブル単位なので、将来誰かが select('*') を書くと外部カレンダーの本文が client へ出る。
-- 設計意図（本文は client に流さない）がコード規約でしか守られていない。
--
-- 20260723233814（calendar_connections.refresh_token_enc）と同じ列限定 SELECT パターンを
-- 適用する。REVOKE ALL ではなく REVOKE SELECT だけを使う: このテーブルには
-- `GRANT UPDATE(dismissed_at) ON public.external_calendar_events TO authenticated`
-- （20260708232500）が既に存在し、REVOKE ALL は列権限を含めテーブルへの全権限を落とすため、
-- その UPDATE grant も道連れに消してしまう。SELECT だけを revoke すれば UPDATE(dismissed_at)
-- は無傷で残る。
--
-- 除外するのは description だけ。他の列（provider / provider_event_id 等）は現状の
-- authenticated からの可視性を変えない -- 今回の脅威は「本文の漏出」に限定されており、
-- 関係ない列まで絞ると event-query-service.ts 以外の未把握の読み取り経路を壊すリスクが増える。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- =============================================================================
-- 1. GRANT
-- =============================================================================

REVOKE SELECT ON public.external_calendar_events FROM authenticated;

GRANT SELECT (
  id,
  user_id,
  provider,
  provider_calendar_id,
  provider_event_id,
  title,
  calendar_name,
  start_at,
  end_at,
  status,
  dismissed_at,
  last_synced_at,
  connection_id,
  created_at,
  updated_at
) ON public.external_calendar_events TO authenticated;

-- =============================================================================
-- 2. Privilege invariants
-- =============================================================================

DO $$
DECLARE
  visible_columns TEXT[] := ARRAY[
    'id',
    'user_id',
    'provider',
    'provider_calendar_id',
    'provider_event_id',
    'title',
    'calendar_name',
    'start_at',
    'end_at',
    'status',
    'dismissed_at',
    'last_synced_at',
    'connection_id',
    'created_at',
    'updated_at'
  ];
  target_column TEXT;
BEGIN
  -- external_calendar_events is column-scoped for SELECT: no table-level SELECT at all.
  IF has_table_privilege('authenticated', 'public.external_calendar_events', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated must not hold table-level SELECT on external_calendar_events';
  END IF;

  IF has_column_privilege(
    'authenticated', 'public.external_calendar_events', 'description', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'authenticated must not read external_calendar_events.description';
  END IF;

  FOREACH target_column IN ARRAY visible_columns LOOP
    IF NOT has_column_privilege(
      'authenticated', 'public.external_calendar_events', target_column, 'SELECT'
    ) THEN
      RAISE EXCEPTION 'authenticated is missing SELECT on external_calendar_events.%', target_column;
    END IF;
  END LOOP;

  -- 20260708232500 で付与した UPDATE(dismissed_at) は REVOKE SELECT の影響を受けない
  -- (REVOKE ALL ではなく REVOKE SELECT を使ったことの直接の検証)。
  IF NOT has_column_privilege(
    'authenticated', 'public.external_calendar_events', 'dismissed_at', 'UPDATE'
  ) THEN
    RAISE EXCEPTION 'authenticated lost UPDATE(dismissed_at) on external_calendar_events';
  END IF;
END;
$$;

COMMIT;

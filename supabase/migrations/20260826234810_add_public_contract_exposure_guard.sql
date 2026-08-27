-- #2433（台帳 第2段）: `public` 契約露出の canonical audit view と assertion を敷く。
--
-- 第7段（canonical projection）は「旧 view と新 view の並存 → 切替 → 旧撤去」で可逆に
-- cutover する。その前提になる**命名と ACL の規約を、docs ではなく機械で**固定する。
--
-- 塞ぐのは Codex B の攻撃シナリオ 9・10
-- （#2433 のコメント https://github.com/Dayopt/dayopt/issues/2433#issuecomment-5432218386）:
--
--   9. canonical projection view が RLS を迂回する — `security_invoker = true` なしで
--      公開する、または UNION の一枝が tenant 条件を欠く
--   10. 旧 version の RPC / overload が expand-only で残存する — v2 だけ安全化し、
--       v1 が `PUBLIC` / `anon` の EXECUTE を持ったまま残る
--
-- **これは今ある穴を塞ぐ修正ではない。** 適用時点で違反は 0 件（`public` に view が
-- 1 つも無く、`public` の SECURITY DEFINER 関数を `anon` が EXECUTE できるものも無い。
-- 実測済み）。第7段の実装が入ってから規約を書いても、その実装自体は検査されないまま
-- 通ってしまう。**規約は、それが守るべき対象より先に置く。**
--
-- なぜ `security_invoker` を機械で見るのか: `docs/engineering/data/db/rls-snapshot.md`
-- は view の **GRANT** は記録するが **`security_invoker` の設定は記録しない**（実測）。
-- GRANT と RLS は別々に判定され、view は既定で RLS を迂回しうるため、GRANT だけを
-- 見ていても「definer 権限で他人の行を返す view」は素通りする。
--
-- 二層で検出する:
--   1 層目 = この migration 末尾の assertion（適用時点のスナップショット）
--   2 層目 = `pnpm rls:snapshot:check`（本 view を snapshot の section として読むので、
--            以後の drift が CI で継続的に検出される）

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- =============================================================================
-- 1. canonical audit view
-- =============================================================================

-- 1 違反 = 1 行。空であることが唯一の正しい状態。
CREATE VIEW private.public_contract_exposure_v1
WITH (security_invoker = true)
AS
WITH public_views AS (
  SELECT
    relation.oid,
    relation.relname,
    relation.relkind,
    (
      SELECT reloption.option_value
      FROM pg_catalog.pg_options_to_table(relation.reloptions) AS reloption
      WHERE reloption.option_name = 'security_invoker'
    ) AS security_invoker
  FROM pg_catalog.pg_class AS relation
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public'
    AND relation.relkind IN ('v', 'm')
),
-- view に対して `anon` が持ちうる権限。PG のバージョン差（17 の MAINTAIN）を避けるため、
-- 全対応バージョンに存在する 7 種だけを見る。MAINTAIN は matview 専用で、matview 自体を
-- 下の `materialized_view_in_public` で禁じているため取りこぼしにならない。
view_privileges(privilege_type) AS (
  SELECT pg_catalog.unnest(
    ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']::TEXT[]
  )
)

-- (1) security_invoker が立っていない view。definer（= view の所有者）権限で実行され、
--     参照先テーブルの RLS を丸ごと迂回する。
SELECT
  'view_missing_security_invoker'::TEXT AS violation_kind,
  'view'::TEXT AS object_type,
  ('public.' || public_views.relname)::TEXT AS object_name,
  (
    'security_invoker is '
    || coalesce(public_views.security_invoker, '<unset>')
    || ' (must be true, or the view runs with owner privileges and bypasses RLS)'
  )::TEXT AS detail
FROM public_views
WHERE public_views.relkind = 'v'
  AND coalesce(public_views.security_invoker, 'false') <> 'true'

UNION ALL

-- (2) matview は `security_invoker` を持てず、内容が所有者権限で焼き固められた
--     スナップショットになる。`public` に置くこと自体を禁じる（必要なら `private` へ）。
SELECT
  'materialized_view_in_public'::TEXT,
  'materialized view'::TEXT,
  ('public.' || public_views.relname)::TEXT,
  'materialized views cannot be security_invoker; keep them in the private schema'::TEXT
FROM public_views
WHERE public_views.relkind = 'm'

UNION ALL

-- (3) version 付きでない名前。旧 view と新 view を並存させられないと、第7段の cutover が
--     「一気に置き換える」以外に選べなくなり、可逆性を失う。
SELECT
  'view_unversioned_name'::TEXT,
  CASE public_views.relkind WHEN 'm' THEN 'materialized view' ELSE 'view' END::TEXT,
  ('public.' || public_views.relname)::TEXT,
  'name must end with _v<N> so an old and a new version can coexist during cutover'::TEXT
FROM public_views
WHERE public_views.relname !~ '_v[0-9]+$'

UNION ALL

-- (4) `anon` が view に対して持つ権限。`has_table_privilege` は PUBLIC への付与と
--     role 継承も含めた**実効**権限を見るので、`GRANT ... TO PUBLIC` も同時に捕まる。
SELECT
  'view_anon_privilege'::TEXT,
  CASE public_views.relkind WHEN 'm' THEN 'materialized view' ELSE 'view' END::TEXT,
  ('public.' || public_views.relname)::TEXT,
  ('anon holds ' || view_privileges.privilege_type)::TEXT
FROM public_views
CROSS JOIN view_privileges
WHERE pg_catalog.has_table_privilege('anon', public_views.oid, view_privileges.privilege_type)

UNION ALL

-- (5) `anon` が EXECUTE できる SECURITY DEFINER 関数。旧 version の RPC を安全化し忘れた
--     時の典型形（シナリオ 10）。`authenticated` は対象にしない — 既存の正当な RPC が
--     持っており、禁じると現行機能を壊す。version ごとの exact signature での
--     REVOKE / GRANT 明示は cutover 手順（docs/engineering/invariants.md）で担保する。
SELECT
  'definer_function_anon_executable'::TEXT,
  'function'::TEXT,
  (
    'public.' || routine.proname
    || '(' || pg_catalog.pg_get_function_identity_arguments(routine.oid) || ')'
  )::TEXT,
  'anon can EXECUTE a SECURITY DEFINER function (it runs with owner privileges)'::TEXT
FROM pg_catalog.pg_proc AS routine
JOIN pg_catalog.pg_namespace AS namespace
  ON namespace.oid = routine.pronamespace
WHERE namespace.nspname = 'public'
  AND routine.prosecdef
  AND pg_catalog.has_function_privilege('anon', routine.oid, 'EXECUTE');

COMMENT ON VIEW private.public_contract_exposure_v1 IS
  'One row per public-schema contract exposure violation (view RLS bypass, unversioned name, anon reachability). Empty is the only correct state.';

REVOKE ALL ON TABLE private.public_contract_exposure_v1
  FROM PUBLIC, anon, authenticated, service_role;

-- =============================================================================
-- 2. assertion
-- =============================================================================

CREATE FUNCTION private.assert_public_contract_exposure_v1()
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_violation RECORD;
  v_total BIGINT;
BEGIN
  SELECT pg_catalog.count(*) INTO v_total
  FROM private.public_contract_exposure_v1;

  IF v_total = 0 THEN
    RETURN;
  END IF;

  SELECT violation.*
  INTO v_violation
  FROM private.public_contract_exposure_v1 AS violation
  ORDER BY violation.violation_kind, violation.object_name, violation.detail
  LIMIT 1;

  RAISE EXCEPTION 'public schema contract exposure detected (% violation(s))', v_total
    USING
      ERRCODE = '42501',
      DETAIL = pg_catalog.format(
        '%s on %s %s: %s',
        v_violation.violation_kind,
        v_violation.object_type,
        v_violation.object_name,
        v_violation.detail
      ),
      HINT = 'Public views must be security_invoker, named _v<N>, and unreachable by anon. See docs/engineering/invariants.md.';
END;
$$;

COMMENT ON FUNCTION private.assert_public_contract_exposure_v1() IS
  'Raises 42501 when a public-schema view or SECURITY DEFINER function breaks the versioned-contract exposure rules.';

REVOKE ALL ON FUNCTION private.assert_public_contract_exposure_v1()
  FROM PUBLIC, anon, authenticated, service_role;

-- 適用時点で違反ゼロであることを固定する。以後の drift は rls:snapshot:check が拾う。
SELECT private.assert_public_contract_exposure_v1();

COMMIT;

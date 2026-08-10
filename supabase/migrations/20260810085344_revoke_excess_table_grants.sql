-- #1715: production の anon/authenticated が service-role 専用テーブルに table grant を
-- 保持していた。20260713121911 は「local/Preview で grant が足りずクライアントが RLS 以前に
-- permission denied で落ちる」問題への production パリティ復元だったが、その復元は
-- email_suppressions / stripe_webhook_events のように "No browser client access" policy
-- だけが実質的な防御になっているテーブルにも SELECT/INSERT/UPDATE/DELETE を戻していた。
-- table grant 自体を外し、防御を RLS policy 単独に依存させない。
--
-- mfa_recovery_codes / reports / tags / user_settings は authenticated の RLS-backed な
-- 正当な用途があるため SELECT/INSERT/UPDATE/DELETE はそのまま維持する。外すのは TRUNCATE
-- だけ -- RLS は TRUNCATE を制御できないため、policy がどれだけ正しくても anon/authenticated
-- が TRUNCATE 権限を持てば防げない（20260730090022 で profiles に適用したのと同じクラスの
-- 穴）。SELECT/INSERT/UPDATE/DELETE まで外すと 20260713121911 が直した障害を再発させる。
--
-- PUBLIC を明示するのは、pg_default_acl が PUBLIC 経由で権限を付与していた場合に
-- anon/authenticated だけを対象にすると継承分が残るため（PostgreSQL の全ロールは暗黙に
-- PUBLIC の権限を継承する）。Tier 2 でも PUBLIC を含める: 下の invariant は
-- has_table_privilege() で判定しており、これは PUBLIC 経由の権限も true として数える。
-- REVOKE 側だけ PUBLIC を外すと、production で PUBLIC が TRUNCATE を持っていた場合に
-- 「REVOKE では消せないのに invariant は落ちる」という自分で満たせない guard になり、
-- migration が production で確実に失敗する。20260730090021 / 20260730090022 は PUBLIC を
-- 含めていないが、あちらは invariant を持たないので同じ問題が起きない。前例の踏襲より
-- 「自分の guard を満たせること」を優先する。PUBLIC が権限を持たない環境では no-op。
--
-- pnpm rls:snapshot は privilege_type を絞っていないため TRUNCATE も snapshot に出るが、
-- 生成元は local DB であり、production の pg_default_acl（新規 public テーブルに
-- anon/authenticated へ arwdDxtm を既定付与）とは非対称になりうる。この非対称は
-- .claude/skills/supabase/SKILL.md に別途記録する（issue #1715 item 5）。

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- =============================================================================
-- 1. Tier 1 -- service-role 専用テーブル: table grant を全て外す
-- =============================================================================

REVOKE ALL ON TABLE public.email_suppressions, public.stripe_webhook_events
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. Tier 2 -- RLS-backed な正当用途があるテーブル: TRUNCATE だけを外す
-- =============================================================================

REVOKE TRUNCATE ON TABLE
  public.mfa_recovery_codes, public.reports, public.tags, public.user_settings
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 3. Privilege invariants
-- =============================================================================
-- 20260723233814 と同じ理由でこの migration 自体に invariant を埋め込む: production は
-- 新規 public テーブルに anon/authenticated = arwdDxtm を既定付与するが local/Preview は
-- Dxtm のみで、pnpm rls:snapshot は local の状態しか見ない。REVOKE が production で
-- 黙って効かなかった場合に気づく唯一のゲートがこのブロック。
--
-- has_table_privilege() にカンマ区切りで複数 privilege を渡すと OR 判定になる
-- （has_table_privilege('service_role', tbl, 'SELECT, INSERT, UPDATE, DELETE') は
-- どれか 1 つ持っていれば true を返し、4 つ全部の証明にならない。ローカル DB で実測して
-- 確認した）。service_role の DML 4 種が全部揃っていることを保証するため、下の
-- service_role チェックは 1 privilege ずつ個別に呼んで AND で結合する。
--
-- Tier 1 では has_any_column_privilege() も併せて見る。REVOKE ALL ON TABLE は
-- pg_attribute.attacl（列レベル ACL）を消さず、has_table_privilege() は列レベルの
-- 権限を数えない。両方欠けると「REVOKE は成功・invariant も pass、しかし
-- authenticated は列単位で SELECT できたまま」という、この migration が塞ごうとしている
-- 漏れそのものを "修正済み" と誤報告しうる。20260723233814 が has_column_privilege を
-- 使っているのと同じ理由。

DO $$
DECLARE
  no_access_tables TEXT[] := ARRAY[
    'public.email_suppressions',
    'public.stripe_webhook_events'
  ];
  no_truncate_tables TEXT[] := ARRAY[
    'public.mfa_recovery_codes',
    'public.reports',
    'public.tags',
    'public.user_settings'
  ];
  all_guarded_tables TEXT[] := ARRAY[
    'public.email_suppressions',
    'public.stripe_webhook_events',
    'public.mfa_recovery_codes',
    'public.reports',
    'public.tags',
    'public.user_settings'
  ];
  target_table TEXT;
  browser_role TEXT;
BEGIN
  -- Tier 1: anon/authenticated は table 単位でも列単位でも権限を持ってはいけない。
  FOREACH target_table IN ARRAY no_access_tables LOOP
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(browser_role, target_table, 'SELECT')
        OR has_table_privilege(browser_role, target_table, 'INSERT')
        OR has_table_privilege(browser_role, target_table, 'UPDATE')
        OR has_table_privilege(browser_role, target_table, 'DELETE')
        OR has_table_privilege(browser_role, target_table, 'TRUNCATE')
        OR has_any_column_privilege(browser_role, target_table, 'SELECT')
        OR has_any_column_privilege(browser_role, target_table, 'INSERT')
        OR has_any_column_privilege(browser_role, target_table, 'UPDATE')
        OR has_any_column_privilege(browser_role, target_table, 'REFERENCES')
      THEN
        RAISE EXCEPTION
          '% must not hold SELECT/INSERT/UPDATE/DELETE/TRUNCATE (table or column level) on %',
          browser_role, target_table
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END LOOP;

  -- Tier 2: anon/authenticated は TRUNCATE だけを持ってはいけない
  -- （SELECT/INSERT/UPDATE/DELETE は意図的に維持するため、ここではチェックしない）。
  -- TRUNCATE は列レベルでは付与できないので has_any_column_privilege は不要。
  FOREACH target_table IN ARRAY no_truncate_tables LOOP
    FOREACH browser_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF has_table_privilege(browser_role, target_table, 'TRUNCATE') THEN
        RAISE EXCEPTION '% must not hold TRUNCATE on %', browser_role, target_table
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END LOOP;

  -- 過剰 REVOKE のガード: service_role の SELECT/INSERT/UPDATE/DELETE は 6 テーブルすべてで
  -- 健在でなければならない（4 privilege を個別に AND 結合。理由は上のコメント参照）。
  FOREACH target_table IN ARRAY all_guarded_tables LOOP
    IF NOT (
      has_table_privilege('service_role', target_table, 'SELECT')
      AND has_table_privilege('service_role', target_table, 'INSERT')
      AND has_table_privilege('service_role', target_table, 'UPDATE')
      AND has_table_privilege('service_role', target_table, 'DELETE')
    ) THEN
      RAISE EXCEPTION 'service_role is missing at least one of SELECT/INSERT/UPDATE/DELETE on %',
        target_table;
    END IF;
  END LOOP;
END;
$$;

COMMIT;

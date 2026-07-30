#!/usr/bin/env node

/**
 * RLS / schema snapshot 生成スクリプト（I-16）
 *
 * 「現在有効な RLS ポリシー / GRANT / Realtime publication」を migration を全部読まずに
 * 把握できるよう、DB の pg_policies / RLS 有効状態 / 権限 / publication を
 * 1 コマンドで deterministic な markdown に書き出す。
 * `api:spec` と同型で、--check で CI ドリフト検出を行う。
 *
 * 入力 DB:
 *   DATABASE_URL（無ければ local Supabase の既定接続先）
 *   migration から構築された DB を読むため、「migration が定義する RLS」を反映する。
 *
 * Usage:
 *   pnpm rls:snapshot          # docs を生成/更新
 *   pnpm rls:snapshot:check    # 既存 snapshot と比較（CI 用ドリフト検出。差分で exit 1）
 */

import { execFileSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import { format as formatWithPrettier } from 'prettier';

import { escapeMarkdownTableCell as cell } from './lib/markdown-table';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = resolve(ROOT, 'docs/engineering/data/db/rls-snapshot.md');
const CHECK_MODE = process.argv.includes('--check');
const LOCAL_SUPABASE_DATABASE_URL = [
  'postgresql://postgres',
  ':',
  'postgres',
  '@127.0.0.1:54322/postgres',
].join('');
const DATABASE_URL = process.env.DATABASE_URL ?? LOCAL_SUPABASE_DATABASE_URL;

type PolicyRow = {
  tablename: string;
  policyname: string;
  cmd: string;
  permissive: string;
  roles: string;
  using_expr: string;
  check_expr: string;
};

type RlsRow = { table: string; rls: boolean; forced: boolean };
type GrantRow = { object_type: string; object_name: string; grantee: string; privileges: string };
type RealtimePublicationRow = { schemaname: string; tablename: string };
type EffectiveTimeblockWritePrivilegeRow = {
  object_type: string;
  grantee: string;
  object_name: string;
  privilege_type: string;
};

/** psql で 1 行 JSON を取り出す（複数行・特殊文字に強い） */
function queryJson<T>(sql: string): T {
  const out = execFileSync('psql', [DATABASE_URL, '-t', '-A', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  }).trim();
  return JSON.parse(out || 'null') as T;
}

function fetchPolicies(): PolicyRow[] {
  return (
    queryJson<PolicyRow[] | null>(
      `SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.tablename, t.cmd, t.policyname), '[]'::json)
       FROM (
         SELECT tablename, policyname, cmd, permissive, roles::text AS roles,
                coalesce(qual, '') AS using_expr, coalesce(with_check, '') AS check_expr
         FROM pg_policies WHERE schemaname = 'public'
       ) t;`,
    ) ?? []
  );
}

function fetchRlsTables(): RlsRow[] {
  return (
    queryJson<RlsRow[] | null>(
      `SELECT coalesce(json_agg(json_build_object(
                'table', c.relname, 'rls', c.relrowsecurity, 'forced', c.relforcerowsecurity
              ) ORDER BY c.relname), '[]'::json)
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r';`,
    ) ?? []
  );
}

function fetchGrants(): GrantRow[] {
  return (
    queryJson<GrantRow[] | null>(
      `WITH relation_grants AS (
         SELECT
           CASE c.relkind
             WHEN 'r' THEN 'table'
             WHEN 'p' THEN 'table'
             WHEN 'v' THEN 'view'
             WHEN 'm' THEN 'materialized view'
             ELSE c.relkind::text
           END AS object_type,
           n.nspname || '.' || c.relname AS object_name,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
           string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type) AS privileges
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(c.relacl) acl
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p', 'v', 'm')
           AND (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END)
             IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
         GROUP BY object_type, object_name, grantee
       ),
       column_grants AS (
         SELECT
           'column' AS object_type,
           n.nspname || '.' || c.relname || '.' || a.attname AS object_name,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
           string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type) AS privileges
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         CROSS JOIN LATERAL aclexplode(a.attacl) acl
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p', 'v', 'm')
           AND a.attnum > 0
           AND NOT a.attisdropped
           AND (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END)
             IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
         GROUP BY object_type, object_name, grantee
       ),
       routine_grants AS (
         SELECT
           'routine' AS object_type,
           n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' AS object_name,
           CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
           string_agg(acl.privilege_type, ', ' ORDER BY acl.privilege_type) AS privileges
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         CROSS JOIN LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
         WHERE n.nspname = 'public'
           AND (CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END)
             IN ('PUBLIC', 'anon', 'authenticated', 'service_role', 'supabase_auth_admin')
           AND acl.privilege_type = 'EXECUTE'
         GROUP BY object_type, object_name, grantee
       )
       SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.object_type, t.object_name, t.grantee), '[]'::json)
       FROM (
         SELECT * FROM column_grants
         UNION ALL
         SELECT * FROM relation_grants
         UNION ALL
         SELECT * FROM routine_grants
       ) t;`,
    ) ?? []
  );
}

function fetchRealtimePublication(): RealtimePublicationRow[] {
  return (
    queryJson<RealtimePublicationRow[] | null>(
      `SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.schemaname, t.tablename), '[]'::json)
       FROM (
         SELECT schemaname, tablename
         FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
       ) t;`,
    ) ?? []
  );
}

/**
 * Plan / Record の effective write 境界（`anon` / `authenticated`）を DB 側の
 * canonical audit view から読む。1 行でも返れば Candidate 6 の cutover が崩れている。
 */
function fetchEffectiveTimeblockWritePrivileges(): EffectiveTimeblockWritePrivilegeRow[] {
  return (
    queryJson<EffectiveTimeblockWritePrivilegeRow[] | null>(
      `SELECT coalesce(json_agg(row_to_json(violation) ORDER BY
                violation.grantee,
                violation.object_type,
                violation.object_name,
                violation.privilege_type
              ), '[]'::json)
       FROM private.timeblock_effective_write_privileges_v1 AS violation;`,
    ) ?? []
  );
}

function render(
  policies: PolicyRow[],
  rlsTables: RlsRow[],
  grants: GrantRow[],
  realtimePublication: RealtimePublicationRow[],
  effectiveTimeblockWritePrivileges: EffectiveTimeblockWritePrivilegeRow[],
): string {
  const policyByTable = new Map<string, PolicyRow[]>();
  for (const p of policies) {
    const list = policyByTable.get(p.tablename) ?? [];
    list.push(p);
    policyByTable.set(p.tablename, list);
  }

  const lines: string[] = [];
  lines.push('# RLS / schema snapshot（自動生成）');
  lines.push('');
  lines.push(
    '> **生成元**: `scripts/generate-rls-snapshot.ts`（`pnpm rls:snapshot`）。DB の `pg_policies` /',
  );
  lines.push(
    '> RLS 有効状態 / GRANT / Realtime publication を deterministic に書き出した snapshot。',
  );
  lines.push(
    '> **手で編集しない**。migration 変更時は CI（`pnpm rls:snapshot:check`）が drift を検出する。',
  );
  lines.push('> 再生成で更新すること。');
  lines.push('>');
  lines.push(
    `> 集計: public スキーマの policy ${policies.length} 件 / RLS 対象テーブル ${rlsTables.length} 件 / GRANT ${grants.length} 件 / Realtime publication ${realtimePublication.length} 件。`,
  );
  lines.push('');

  lines.push('## RLS 有効状態（public テーブル）');
  lines.push('');
  lines.push('| table | RLS enabled | forced |');
  lines.push('| --- | --- | --- |');
  for (const r of rlsTables) {
    lines.push(`| ${r.table} | ${r.rls ? '✅' : '❌'} | ${r.forced ? '✅' : '—'} |`);
  }
  lines.push('');

  lines.push('## ポリシー一覧（table 別）');
  lines.push('');
  for (const table of [...policyByTable.keys()].sort()) {
    lines.push(`### ${table}`);
    lines.push('');
    lines.push('| policy | cmd | permissive | roles | USING | WITH CHECK |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const p of policyByTable.get(table) ?? []) {
      lines.push(
        `| ${cell(p.policyname)} | ${p.cmd} | ${p.permissive} | ${cell(p.roles)} | ${cell(p.using_expr)} | ${cell(p.check_expr)} |`,
      );
    }
    lines.push('');
  }

  lines.push('## GRANT 一覧（public schema）');
  lines.push('');
  lines.push('| object type | object | grantee | privileges |');
  lines.push('| --- | --- | --- | --- |');
  for (const grant of grants) {
    lines.push(
      `| ${grant.object_type} | ${cell(grant.object_name)} | ${cell(grant.grantee)} | ${cell(grant.privileges)} |`,
    );
  }
  lines.push('');

  lines.push('## Plan / Record effective write境界');
  lines.push('');
  lines.push(
    effectiveTimeblockWritePrivileges.length === 0
      ? '- ✅ `anon` / `authenticated`のeffective table / column write権限なし'
      : '- ❌ effective write権限あり（snapshot生成を停止する）',
  );
  lines.push('');

  lines.push('## Realtime publication');
  lines.push('');
  lines.push('`supabase_realtime` に含まれる public table。空なら Realtime 公開なし。');
  lines.push('');
  if (realtimePublication.length === 0) {
    lines.push('- なし');
  } else {
    lines.push('| schema | table |');
    lines.push('| --- | --- |');
    for (const row of realtimePublication) {
      lines.push(`| ${cell(row.schemaname)} | ${cell(row.tablename)} |`);
    }
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  let content: string;
  try {
    const effectiveTimeblockWritePrivileges = fetchEffectiveTimeblockWritePrivileges();
    if (effectiveTimeblockWritePrivileges.length > 0) {
      const violation = effectiveTimeblockWritePrivileges[0]!;
      throw new Error(
        `${violation.grantee} has effective ${violation.privilege_type} on ${violation.object_type} ${violation.object_name}`,
      );
    }

    const raw = render(
      fetchPolicies(),
      fetchRlsTables(),
      fetchGrants(),
      fetchRealtimePublication(),
      effectiveTimeblockWritePrivileges,
    );
    // commit 時の lint-staged prettier と同一整形を施し、--check の drift を防ぐ
    // （raw のままだと prettier がテーブルを整列して常に差分になる）
    content = await formatWithPrettier(raw, { parser: 'markdown', printWidth: 100 });
  } catch (error) {
    console.error(
      '❌ RLS snapshot 生成に失敗しました。DATABASE_URL と DB 起動を確認してください。',
    );
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }

  if (CHECK_MODE) {
    const existing = existsSync(OUTPUT_PATH) ? readFileSync(OUTPUT_PATH, 'utf8') : '';
    if (existing.trim() !== content.trim()) {
      console.error('❌ RLS snapshot が最新ではありません。');
      console.error('   pnpm rls:snapshot を実行して更新してください。');
      process.exit(1);
    }
    console.log('✅ RLS snapshot は最新です。');
    return;
  }

  writeFileSync(OUTPUT_PATH, content);
  console.log(`✅ RLS snapshot を生成しました: ${OUTPUT_PATH}`);
}

void main();

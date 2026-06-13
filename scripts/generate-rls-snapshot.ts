#!/usr/bin/env node

/**
 * RLS / schema snapshot 生成スクリプト（I-16）
 *
 * 「現在有効な RLS ポリシー」を migration を全部読まずに把握できるよう、
 * DB の pg_policies / RLS 有効状態を 1 コマンドで deterministic な markdown に
 * 書き出す。`api:spec` と同型で、--check で CI ドリフト検出を行う。
 *
 * 入力 DB:
 *   DATABASE_URL（無ければ local supabase の既定 postgresql://postgres:postgres@127.0.0.1:54322/postgres）
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const OUTPUT_PATH = resolve(ROOT, 'apps/storybook/docs/dev/db/rls-snapshot.md');
const CHECK_MODE = process.argv.includes('--check');
const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

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

/** markdown 1 セル用に改行・パイプを無害化 */
function cell(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || '—';
}

function render(policies: PolicyRow[], rlsTables: RlsRow[]): string {
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
    '> RLS 有効状態を deterministic に書き出した snapshot。**手で編集しない**。migration 変更時は',
  );
  lines.push('> CI（`pnpm rls:snapshot:check`）が drift を検出する。再生成で更新すること。');
  lines.push('>');
  lines.push(
    `> 集計: public スキーマの policy ${policies.length} 件 / RLS 対象テーブル ${rlsTables.length} 件。`,
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

  return lines.join('\n');
}

function main(): void {
  let content: string;
  try {
    content = render(fetchPolicies(), fetchRlsTables());
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

  writeFileSync(OUTPUT_PATH, content + '\n');
  console.log(`✅ RLS snapshot を生成しました: ${OUTPUT_PATH}`);
}

main();

/**
 * production Storage RLS Audit の実行経路の契約を固定する（#2323）。
 *
 * production-auth-config-audit-contract.test.ts と同じ思想: この audit は production の
 * DB へ Management API 経由で接続する scoped token を持って走る。渡す経路が仕様どおりで
 * あることを、workflow と script の中身から機械的に固定する。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { STORAGE_OBJECTS_APP_POLICY_NAMES } from '../lib/storage-objects-app-policy-names.mjs';
import { buildQuery } from '../production-storage-rls-audit.mjs';

const auditScript = readFileSync(
  fileURLToPath(new URL('../production-storage-rls-audit.mjs', import.meta.url)),
  'utf8',
);
const workflow = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/production-config-audit.yml', import.meta.url)),
  'utf8',
);

describe('production storage RLS audit contract', () => {
  it('allow-list はリテラルで固定する', () => {
    // generate-rls-snapshot.ts と production-storage-rls-audit.mjs の両方がこの配列を
    // 単一の正本として共有する（#2323）。値を変える PR は必ずこの test の diff を伴わせ、
    // 対応する migration 変更（supabase/migrations/20260730090027_fence_account_storage.sql）
    // が伴っているかのレビューを強制する。
    expect(STORAGE_OBJECTS_APP_POLICY_NAMES).toEqual([
      'Users can delete own attachments',
      'Users can delete own avatar',
      'Users can update own attachments',
      'Users can update own avatar',
      'Users can upload own attachments',
      'Users can upload own avatar',
      'Users can view own attachments',
      'Users can view own avatar',
    ]);
  });

  it('script が import するのは想定した 2 つの shared module だけ', () => {
    // production-auth-config-audit.mjs は「他ファイルを import しない」設計だが、この
    // script は STORAGE_OBJECTS_APP_POLICY_NAMES の二重管理を避けるため意図的に import
    // する（#2323）。token は database_read 権限のみ + API 側の read_only フラグの
    // 二重で書き込み不可能なため、auth audit ほどの trust boundary の懸念は無い。
    // ただし import 先が無制限に増えるのは防ぐため、許可する 2 件だけをここで固定する。
    const relativeImports = [...auditScript.matchAll(/from\s+'(\.[^']+)'/gu)].map((m) => m[1]);

    expect(relativeImports.sort()).toEqual(
      ['./lib/storage-objects-app-policy-names.mjs', './production-auth-config-audit.mjs'].sort(),
    );
  });

  it('直接実行の判定は realpath で正規化する', () => {
    // production-auth-config-audit.mjs と同じ fail-open 対策（symlink 経由の path 不一致）。
    expect(auditScript).toContain('pathToFileURL(realpathSync(process.argv[1]))');
  });

  it('storage-rls job は PR / workflow_dispatch では走らない', () => {
    // auth-config job と同じ理由: token を PR の branch code の実行経路へ渡さない。
    const jobIndex = workflow.indexOf('storage-rls:');
    expect(jobIndex).toBeGreaterThanOrEqual(0);
    const job = workflow.slice(jobIndex);
    expect(job).toContain("if: github.event_name == 'push' || github.event_name == 'schedule'");
  });

  it('SUPABASE_STORAGE_RLS_AUDIT_TOKEN は job ではなく step の env に置く', () => {
    // job 単位に置くと同 job の他 step にも token が乗る。
    const jobLevelEnv = /^ {4}env:\n(?:^ {6}.*\n)*^ {6}SUPABASE_STORAGE_RLS_AUDIT_TOKEN:/mu;
    expect(workflow).not.toMatch(jobLevelEnv);
    expect(workflow).toMatch(/^ {10}SUPABASE_STORAGE_RLS_AUDIT_TOKEN: \$\{\{ secrets\./mu);
  });

  it('audit token を参照する workflow は production-config-audit.yml だけ', () => {
    const workflowDir = fileURLToPath(new URL('../../.github/workflows', import.meta.url));
    const offenders = readdirSync(workflowDir)
      .filter((name) => /\.ya?ml$/u.test(name) && name !== 'production-config-audit.yml')
      .filter((name) =>
        readFileSync(join(workflowDir, name), 'utf8').includes('SUPABASE_STORAGE_RLS_AUDIT_TOKEN'),
      );

    expect(offenders).toEqual([]);
  });

  it('storage-rls job の結果は commit status を経由しない', () => {
    // 「Production Config Audit」status は finish-branch.sh の merge gate 判定に使う。
    // storage.objects の drift は PR diff と無関係な production 由来なので、これを
    // status に載せると無関係な全 PR の merge が止まる。
    const jobIndex = workflow.indexOf('storage-rls:');
    expect(jobIndex).toBeGreaterThanOrEqual(0);
    const job = workflow.slice(jobIndex);
    expect(job).not.toContain('statuses/');
  });

  it('token 未設定時は fail ではなく ::notice:: を出す（missing token を drift failure と誤読させない）', () => {
    expect(auditScript).toContain('::notice title=Production Storage RLS Audit is inactive::');
    expect(auditScript).toContain('process.exitCode = 0');
  });

  it('production への書き込みを行うキーワードを含まない（read-only 経路のみ、検出のみ）', () => {
    // INSERT/UPDATE/DELETE/ALTER/DROP/TRUNCATE/GRANT/REVOKE 等の書き込み系 SQL キーワードを
    // 実際に実行される SQL（buildQuery の出力）が含まないことを機械的に確認する。ファイル
    // 全体を対象にしないのは、コメント中のプローズ（「DROP する migration を作る」等の
    // 説明文）が正当に該当語を含むため。read_only: true は API 側の強制だが、SQL 本文も
    // 書き込みを試みる文字列を持たないことを二重に固定する。
    // 大文字小文字を区別する: policy 名の英文（"Users can update own attachments" 等）に
    // 小文字の "update"/"delete" が正当に含まれるため、大文字の SQL キーワードだけを狙う。
    expect(buildQuery()).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/u,
    );
    expect(auditScript).toContain('read_only: true');
  });
});

/**
 * production Auth Config Audit の実行経路の契約を固定する（#1926）。
 *
 * この audit は account 単位 read-write の Supabase PAT を持って走る。渡す経路と
 * 依存の広がりが仕様どおりであることを、workflow と script の中身から機械的に固定する。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { AUTH_CONFIG_CONTRACT } from '../production-auth-config-audit.mjs';

const auditScript = readFileSync(
  fileURLToPath(new URL('../production-auth-config-audit.mjs', import.meta.url)),
  'utf8',
);
const workflow = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/production-config-audit.yml', import.meta.url)),
  'utf8',
);

describe('production auth config audit contract', () => {
  it('監視対象と期待値はリテラルで固定する', () => {
    // production-auth-config-audit.test.ts の fixture は AUTH_CONFIG_CONTRACT から
    // 生成されるため、期待値を反転しても key を消しても green のままになる。この
    // audit は contract 変更検出（workflow の regex）の対象外なので、弱体化を可視化
    // する層がここ以外に無い。値を変える PR は必ずこの test の diff を伴わせる。
    expect(AUTH_CONFIG_CONTRACT.map(({ key, expected }) => [key, expected])).toEqual([
      ['security_update_password_require_reauthentication', false],
      ['mailer_secure_email_change_enabled', true],
      ['security_captcha_enabled', true],
      ['security_captcha_provider', 'turnstile'],
      ['security_manual_linking_enabled', false],
      ['external_anonymous_users_enabled', false],
      ['mailer_autoconfirm', false],
    ]);
  });

  it('script は repo 内の他ファイルを import しない', () => {
    // contract 保護は列挙した path にしか効かない。import 先が増えると、保護外の
    // ファイルが PAT 付きの実行経路に混ざる。
    const relativeImports = auditScript.match(/from\s+['"]\.{1,2}\//gu) ?? [];
    expect(relativeImports).toEqual([]);
  });

  it('直接実行の判定は realpath で正規化する', () => {
    // Node は entry point を realpath へ解決してから `import.meta.url` を決める。
    // 素の path と比較すると symlink 経由（macOS の /tmp -> /private/tmp）で一致せず、
    // audit が「何も実行せず exit 0」になる。2026-08-11 の dry-run で実測した fail open。
    expect(auditScript).toContain('pathToFileURL(realpathSync(process.argv[1]))');
  });

  it('auth audit job は PR / workflow_dispatch では走らない', () => {
    // `pull_request_target` と `workflow_dispatch --ref <branch>` の checkout は
    // それぞれ base.sha と **branch head**。後者は branch の code を実行するため、
    // Vercel token より権限の広い Supabase PAT をこの経路へ渡さない。
    expect(workflow).toContain(
      "if: github.event_name == 'push' || github.event_name == 'schedule'",
    );
  });

  it('SUPABASE_AUTH_AUDIT_TOKEN は job ではなく step の env に置く', () => {
    // job 単位に置くと同 job の他 step にも token が乗る。
    const jobLevelEnv = /^ {4}env:\n(?:^ {6}.*\n)*^ {6}SUPABASE_AUTH_AUDIT_TOKEN:/mu;
    expect(workflow).not.toMatch(jobLevelEnv);
    expect(workflow).toMatch(/^ {10}SUPABASE_AUTH_AUDIT_TOKEN: \$\{\{ secrets\./mu);
  });

  it('audit token を参照する workflow は production-config-audit.yml だけ', () => {
    // Management API の PAT は account 単位 read-write（production DB への任意 SQL を
    // 含む）。参照する workflow が増えるほど、PR 側の code を実行する job へ渡る経路が
    // 生まれる。integration.yml が実際に `pull_request` + workflow レベル env の形で
    // この token を配っていた（2026-08-11 に削除）ので、参照先を 1 file に固定する。
    // この file 内での job / step の限定は上下の 2 test が担う。
    const workflowDir = fileURLToPath(new URL('../../.github/workflows', import.meta.url));
    const offenders = readdirSync(workflowDir)
      .filter((name) => /\.ya?ml$/u.test(name) && name !== 'production-config-audit.yml')
      .filter((name) =>
        readFileSync(join(workflowDir, name), 'utf8').includes('SUPABASE_AUTH_AUDIT_TOKEN'),
      );

    expect(offenders).toEqual([]);
  });

  it('auth audit の結果は commit status を経由しない', () => {
    // status context「Production Config Audit」は finish-branch.sh が merge gate の
    // 解除判定に使う。auth audit（PR diff と無関係な Dashboard 由来の drift）の
    // 失敗をここへ載せると、全 PR の merge が止まる。
    const authJob = workflow.slice(workflow.indexOf('auth-config:'));
    expect(authJob).not.toContain('statuses/');
  });
});

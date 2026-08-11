/**
 * production Auth Config Audit の実行経路の契約を固定する（#1926）。
 *
 * この audit は account 単位 read-write の Supabase PAT を持って走る。渡す経路と
 * 依存の広がりが仕様どおりであることを、workflow と script の中身から機械的に固定する。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const auditScript = readFileSync(
  fileURLToPath(new URL('../production-auth-config-audit.mjs', import.meta.url)),
  'utf8',
);
const workflow = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/production-config-audit.yml', import.meta.url)),
  'utf8',
);

describe('production auth config audit contract', () => {
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

  it('SUPABASE_ACCESS_TOKEN は job ではなく step の env に置く', () => {
    // job 単位に置くと同 job の他 step にも token が乗る。
    const jobLevelEnv = /^ {4}env:\n(?:^ {6}.*\n)*^ {6}SUPABASE_ACCESS_TOKEN:/mu;
    expect(workflow).not.toMatch(jobLevelEnv);
    expect(workflow).toMatch(/^ {10}SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\./mu);
  });

  it('auth audit の結果は commit status を経由しない', () => {
    // status context「Production Config Audit」は finish-branch.sh が merge gate の
    // 解除判定に使う。auth audit（PR diff と無関係な Dashboard 由来の drift）の
    // 失敗をここへ載せると、全 PR の merge が止まる。
    const authJob = workflow.slice(workflow.indexOf('auth-config:'));
    expect(authJob).not.toContain('statuses/');
  });
});

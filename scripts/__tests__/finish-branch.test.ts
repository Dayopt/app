import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * `finish-branch.sh` は Claude / Codex / 人間で共通のマージゲートで、判定を誤ると
 * 「失敗を見落としてマージする」方向に倒れる。実スクリプトを子プロセスで動かし、
 * `gh` だけ stub して check 判定の分岐を固定する。
 *
 * とくに **同一 head SHA に複数 run が積まれた rollup** を正しく畳めているかを見る。
 * `gh pr view --json statusCheckRollup` は同名 check を畳まないため（`gh pr checks` は畳む）、
 * 畳まずに数えると再実行で解決済みの failure を永久に数え続けてマージ不能になる。
 */

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = join(rootDir, 'scripts/git/finish-branch.sh');
const temporaryDirectories: string[] = [];

const BRANCH = 'claude/example-branch-1';

type RollupEntry = Record<string, unknown>;

function checkRun(
  name: string,
  conclusion: string | null,
  startedAt: string | null,
  status = 'COMPLETED',
  workflowName = 'CI',
): RollupEntry {
  return {
    __typename: 'CheckRun',
    name,
    workflowName,
    conclusion,
    status,
    startedAt,
    completedAt: startedAt,
    detailsUrl: 'https://example.test/run',
  };
}

function statusContext(context: string, state: string, startedAt: string): RollupEntry {
  return {
    __typename: 'StatusContext',
    context,
    state,
    startedAt,
    targetUrl: 'https://example.test',
  };
}

function runScript(rollup: RollupEntry[]): { status: number | null; stderr: string } {
  // repo 直下ではなく os の temp に作る。プロセスが afterEach 前に落ちると untracked な
  // ディレクトリが repo に残り、まさにこのスクリプトの dirty ゲートが以後の掃除を止める。
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'finish-branch-test-'));
  temporaryDirectories.push(temporaryDirectory);

  const binDirectory = join(temporaryDirectory, 'bin');
  mkdirSync(binDirectory);

  const payloadPath = join(temporaryDirectory, 'pr.json');
  writeFileSync(
    payloadPath,
    JSON.stringify({
      state: 'OPEN',
      headRefName: BRANCH,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      statusCheckRollup: rollup,
    }),
  );

  // `gh` だけ差し替える。git は temp repo 上で本物を動かす（worktree / show-ref の判定を
  // 実挙動に任せる方が、stub の作り込みより契約に近い）。
  const ghStub = join(binDirectory, 'gh');
  writeFileSync(
    ghStub,
    `#!/bin/bash
set -euo pipefail
case "$1" in
  pr)
    case "\${2:-}" in
      view) cat "$FINISH_BRANCH_PR_JSON" ;;
      *) exit 2 ;;
    esac
    ;;
  api)
    # up-to-date gate: compare の .status だけを返す
    case "\${2:-}" in
      *compare*) echo ahead ;;
      *) exit 2 ;;
    esac
    ;;
  *) exit 2 ;;
esac
`,
  );
  chmodSync(ghStub, 0o755);

  const git = (...args: string[]) =>
    spawnSync('git', args, { cwd: temporaryDirectory, encoding: 'utf8' });

  git('init', '--initial-branch=main');
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  writeFileSync(join(temporaryDirectory, 'seed.txt'), 'seed\n');
  git('add', 'seed.txt');
  git('commit', '-m', 'seed');

  const result = spawnSync('bash', [scriptPath, '123', '--dry-run'], {
    cwd: temporaryDirectory,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
      FINISH_BRANCH_PR_JSON: payloadPath,
    },
  });

  return { status: result.status, stderr: result.stderr ?? '' };
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    const directory = temporaryDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe('同一 SHA に積まれた重複 check の畳み込み', () => {
  it('古い failure が新しい success に置き換わっていればマージへ進む', () => {
    // ラベル付与 / draft→ready / 手動 re-run で 2 本目が走った後の形。
    // 畳まないと解決済みの failure を数えて永久にマージ不能になる。
    const { status, stderr } = runScript([
      checkRun('CI', 'FAILURE', '2026-07-30T10:00:00Z'),
      checkRun('CI', 'SUCCESS', '2026-07-30T10:10:00Z'),
    ]);
    expect(stderr).not.toContain('失敗している check');
    expect(status).toBe(0);
  });

  it('cancelled になった古い run も新しい success で解消される', () => {
    // cancel-in-progress で 1 本目が cancelled になる経路（draft→ready 等）。
    const { status, stderr } = runScript([
      checkRun('CI', 'CANCELLED', '2026-07-30T10:00:00Z'),
      checkRun('CI', 'SUCCESS', '2026-07-30T10:10:00Z'),
    ]);
    expect(stderr).not.toContain('失敗している check');
    expect(status).toBe(0);
  });

  it('新しい run が failure なら止める（古い success で上書きしない）', () => {
    const { status, stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z'),
      checkRun('CI', 'FAILURE', '2026-07-30T10:10:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });

  it('実行中の run が 1 つでもあれば止める（startedAt が無くても）', () => {
    // queued な run は startedAt を持たないことがある。「最新」を startedAt だけで
    // 決めると古い完了 run が勝ち、実行中を見落として素通りする（fail-open）。
    const { status, stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z'),
      checkRun('CI', null, null, 'QUEUED'),
    ]);
    expect(stderr).toContain('実行中の check');
    expect(status).toBe(1);
  });

  it('StatusContext と CheckRun が混在しても名前ごとに畳む', () => {
    const { status, stderr } = runScript([
      checkRun('CI', 'FAILURE', '2026-07-30T10:00:00Z'),
      checkRun('CI', 'SUCCESS', '2026-07-30T10:10:00Z'),
      statusContext('Vercel – product', 'SUCCESS', '2026-07-30T10:11:00Z'),
    ]);
    expect(stderr).not.toContain('失敗している check');
    expect(status).toBe(0);
  });
});

describe('畳み込みが失敗を消さないこと', () => {
  it('後から積まれた skipped で古い failure を消さない', () => {
    // job-level `if:` で skip された run は同一 SHA に conclusion: skipped の check run を
    // 作る（ai-review は draft PR で skip する）。skipped は失敗にも成功にも数えないため、
    // これを代表に選ぶと blocking な赤が消える。実在する経路:
    // ready で FAILURE → draft へ戻す → close → reopen（draft なので skip）。
    const { status, stderr } = runScript([
      checkRun('🔍 AI Review', 'FAILURE', '2026-07-30T10:00:00Z', 'COMPLETED', 'AI Review'),
      checkRun('🔍 AI Review', 'SKIPPED', '2026-07-30T10:10:00Z', 'COMPLETED', 'AI Review'),
      checkRun('docs guard', 'SUCCESS', '2026-07-30T10:01:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });

  it('後から積まれた skipped で古い success も消さない', () => {
    // 逆方向。skipped を代表にすると「成功 1 件以上」を割って別の理由で止まる。
    const { status, stderr } = runScript([
      checkRun('🔍 AI Review', 'SUCCESS', '2026-07-30T10:00:00Z', 'COMPLETED', 'AI Review'),
      checkRun('🔍 AI Review', 'SKIPPED', '2026-07-30T10:10:00Z', 'COMPLETED', 'AI Review'),
    ]);
    expect(stderr).not.toContain('成功した check が 1 件もありません');
    expect(status).toBe(0);
  });

  it('別名の古い failure を新しい success で畳まない', () => {
    // 「name を見ずに rollup 全体から startedAt 最大の 1 件だけ残す」実装だと
    // ここで failure が消える。group key が効いていることを固定する。
    const { status, stderr } = runScript([
      checkRun('CI', 'FAILURE', '2026-07-30T10:00:00Z'),
      checkRun('E2E', 'SUCCESS', '2026-07-30T10:10:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });

  it('同名でも workflow が違えば畳まない', () => {
    // gh pr checks の dedupe は name + workflow。name だけで畳むと、別 workflow の
    // 同名 job の failure が新しい成功に隠れる。
    const { status, stderr } = runScript([
      checkRun('Integration Tests', 'FAILURE', '2026-07-30T10:00:00Z', 'COMPLETED', 'A'),
      checkRun('Integration Tests', 'SUCCESS', '2026-07-30T10:10:00Z', 'COMPLETED', 'B'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });
});

describe('実データの rollup（PR #1765）', () => {
  it('gh pr checks と同じ件数まで畳み、失敗ゼロと判定する', () => {
    // 2026-07-30 に実測した本物の rollup。21 件・8 名前が重複し、gh pr checks は 13 行。
    // stub で作った JSON は shape を仮定してしまうので、実出力で固定する。
    const fixture = JSON.parse(
      readFileSync(
        join(rootDir, 'scripts/__tests__/fixtures/status-check-rollup-duplicated.json'),
        'utf8',
      ),
    ) as { statusCheckRollup: RollupEntry[] };
    expect(fixture.statusCheckRollup).toHaveLength(21);

    const { status, stderr } = runScript(fixture.statusCheckRollup);
    expect(stderr).not.toContain('失敗している check');
    expect(stderr).not.toContain('実行中の check');
    expect(status).toBe(0);
  });
});

describe('畳み込みで緩めてはいけない判定', () => {
  it('単発の failure は従来どおり止める', () => {
    const { status, stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z'),
      checkRun('E2E', 'FAILURE', '2026-07-30T10:01:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });

  it('success が 1 件も無ければ止める（全 skip / check 未登録）', () => {
    const { status, stderr } = runScript([
      checkRun('CI', 'SKIPPED', '2026-07-30T10:00:00Z'),
      checkRun('E2E', 'SKIPPED', '2026-07-30T10:01:00Z'),
    ]);
    expect(stderr).toContain('成功した check が 1 件もありません');
    expect(status).toBe(1);
  });

  it('rollup が空でも止める', () => {
    const { status, stderr } = runScript([]);
    expect(stderr).toContain('成功した check が 1 件もありません');
    expect(status).toBe(1);
  });

  it('StatusContext の failure も止める', () => {
    const { status, stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z'),
      statusContext('Vercel – product', 'FAILURE', '2026-07-30T10:01:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });
});

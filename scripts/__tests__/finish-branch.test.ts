import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

/**
 * merge gate は Vercel の 2 context が **存在すること** を要求する（Actions 側の
 * 無条件 build を撤去し、product / web の build 検証が Vercel にしか無いため）。
 * 合格を期待するケースの rollup には必ず足す。
 */
function vercelChecks(): RollupEntry[] {
  return [
    statusContext('Vercel – product', 'SUCCESS', '2026-07-30T10:00:00Z'),
    statusContext('Vercel – web', 'SUCCESS', '2026-07-30T10:00:00Z'),
  ];
}

function runScript(
  rollup: RollupEntry[],
  options: { compare?: string; isDraft?: boolean } = {},
): { status: number | null; stderr: string } {
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
      isDraft: options.isDraft ?? false,
      headRefName: BRANCH,
      headRefOid: '0'.repeat(40),
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
      *compare*) echo "$FINISH_BRANCH_COMPARE" ;;
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
      FINISH_BRANCH_COMPARE: options.compare ?? 'ahead',
    },
  });

  return { status: result.status, stderr: result.stderr ?? '' };
}

/**
 * 実 git 上で step 3-9 を動かす harness（`--dry-run` なし）。
 *
 * 上の `runScript` は check ゲートの分岐を見るためのもので、掃除本体は dry-run のまま
 * 素通りする。#1771 の 3 症状（gh が実行元 worktree を切り替える / `checkout main` が
 * 別セッションの作業を奪う / `branch -d` が HEAD 基準で偽陰性を出す）は **実 git の
 * worktree 構成でしか再現しない**ため、bare origin + 複数 worktree を組んで実挙動を固定する。
 *
 * PR state は MERGED / CLOSED を返してマージ手順ごと skip させる。ここで見たいのは
 * マージ判定ではなく掃除側の挙動で、`gh api` が呼ばれたら stub が落ちて気づける。
 */
type RepoScenario = {
  /** MERGED ならマージ済み、CLOSED なら「未マージのまま閉じた」経路、OPEN ならマージから走る */
  prState: 'OPEN' | 'MERGED' | 'CLOSED';
  /** OPEN のとき、マージ API を失敗させる */
  mergeFails?: boolean;
  /** origin/main に feature を merge --no-ff 済みにするか */
  mergeIntoMain: boolean;
  /** MAIN_ROOT の HEAD。'other' は別セッションが作業中の状態を表す */
  mainRootHead: 'main' | 'other';
  /** main を MAIN_ROOT 以外の worktree が checkout している状態にする */
  addMainWorktree?: boolean;
  /** feature branch の worktree を作る */
  addFeatureWorktree?: boolean;
  /** script の実行位置 */
  runFrom?: 'main-root' | 'feature-worktree';
};

function runScriptOnRepo(scenario: RepoScenario) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'finish-branch-repo-')));
  temporaryDirectories.push(root);

  const originPath = join(root, 'origin.git');
  const seeder = join(root, 'seeder');
  const mainRoot = join(root, 'mainroot');
  const mainWorktree = join(root, 'wt-main');
  const featureWorktree = join(root, 'wt-feature');

  const git = (cwd: string, ...args: string[]) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    if (result.status !== 0) {
      throw new Error(`git ${args.join(' ')} @ ${cwd}\n${result.stderr}`);
    }
    return (result.stdout ?? '').trim();
  };
  const gitStatus = (cwd: string, ...args: string[]) =>
    spawnSync('git', args, { cwd, encoding: 'utf8' }).status;

  git(root, 'init', '--bare', '--initial-branch=main', originPath);

  git(root, 'clone', originPath, seeder);
  git(seeder, 'config', 'user.email', 'test@example.com');
  git(seeder, 'config', 'user.name', 'test');
  writeFileSync(join(seeder, 'seed.txt'), 'seed\n');
  git(seeder, 'add', 'seed.txt');
  git(seeder, 'commit', '-m', 'seed');
  git(seeder, 'push', 'origin', 'main');

  git(seeder, 'checkout', '-b', BRANCH);
  writeFileSync(join(seeder, 'feature.txt'), 'feature\n');
  git(seeder, 'add', 'feature.txt');
  git(seeder, 'commit', '-m', 'feature');
  git(seeder, 'push', 'origin', BRANCH);
  git(seeder, 'checkout', 'main');

  // MAIN_ROOT はマージ前に clone する。「リモートはマージ済みだがローカル main は古い」
  // という実運用の状態を作るため。
  git(root, 'clone', originPath, mainRoot);
  git(mainRoot, 'config', 'user.email', 'test@example.com');
  git(mainRoot, 'config', 'user.name', 'test');
  // Claude Code が作る worktree branch は upstream 追跡を持たないことが多い。同じ形にする。
  git(mainRoot, 'fetch', 'origin', `${BRANCH}:${BRANCH}`);

  if (scenario.mainRootHead === 'other') {
    git(mainRoot, 'checkout', '-b', 'other');
  }
  if (scenario.addMainWorktree) {
    git(mainRoot, 'worktree', 'add', mainWorktree, 'main');
  }
  if (scenario.addFeatureWorktree) {
    git(mainRoot, 'worktree', 'add', featureWorktree, BRANCH);
  }

  if (scenario.mergeIntoMain) {
    git(seeder, 'merge', '--no-ff', BRANCH, '-m', `Merge pull request #123 from ${BRANCH}`);
    git(seeder, 'push', 'origin', 'main');
  }

  const binDirectory = join(root, 'bin');
  mkdirSync(binDirectory);
  const payloadPath = join(root, 'pr.json');
  writeFileSync(
    payloadPath,
    JSON.stringify({
      state: scenario.prState,
      isDraft: false,
      headRefName: BRANCH,
      headRefOid: git(seeder, 'rev-parse', BRANCH),
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      statusCheckRollup:
        scenario.prState === 'OPEN'
          ? [checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z'), ...vercelChecks()]
          : [],
    }),
  );

  // OPEN 以外ではマージ手順が skip される。gh api が呼ばれたら失敗させて気づけるようにする。
  const ghStub = join(binDirectory, 'gh');
  writeFileSync(
    ghStub,
    `#!/bin/bash
set -euo pipefail
case "$1" in
  pr) cat "$FINISH_BRANCH_PR_JSON" ;;
  api)
    if [[ "\${FINISH_BRANCH_EXPECT_MERGE:-0}" != "1" ]]; then
      echo "unexpected gh api call: $*" >&2
      exit 2
    fi
    case "$*" in
      *compare*) echo ahead ;;
      */merge*) exit "\${FINISH_BRANCH_MERGE_EXIT:-0}" ;;
      *) exit 0 ;;
    esac
    ;;
  *) echo "unexpected gh call: $*" >&2; exit 2 ;;
esac
`,
  );
  chmodSync(ghStub, 0o755);

  const result = spawnSync('bash', [scriptPath, '123'], {
    cwd: scenario.runFrom === 'feature-worktree' ? featureWorktree : mainRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
      FINISH_BRANCH_PR_JSON: payloadPath,
      FINISH_BRANCH_EXPECT_MERGE: scenario.prState === 'OPEN' ? '1' : '0',
      FINISH_BRANCH_MERGE_EXIT: scenario.mergeFails ? '1' : '0',
    },
  });

  return {
    status: result.status,
    stderr: result.stderr ?? '',
    mainRoot,
    mainWorktree,
    featureWorktree,
    branchExists: () =>
      gitStatus(mainRoot, 'show-ref', '--verify', '--quiet', `refs/heads/${BRANCH}`) === 0,
    currentBranch: (cwd: string) => git(cwd, 'branch', '--show-current'),
    localMainMatchesRemote: () =>
      git(mainRoot, 'rev-parse', 'main') === git(mainRoot, 'rev-parse', 'origin/main'),
    remoteBranchExists: () => git(mainRoot, 'ls-remote', '--heads', 'origin', BRANCH) !== '',
  };
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
      ...vercelChecks(),
    ]);
    expect(stderr).not.toContain('失敗している check');
    expect(status).toBe(0);
  });

  it('cancelled になった古い run も新しい success で解消される', () => {
    // cancel-in-progress で 1 本目が cancelled になる経路（draft→ready 等）。
    const { status, stderr } = runScript([
      checkRun('CI', 'CANCELLED', '2026-07-30T10:00:00Z'),
      checkRun('CI', 'SUCCESS', '2026-07-30T10:10:00Z'),
      ...vercelChecks(),
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
      statusContext('Vercel – web', 'SUCCESS', '2026-07-30T10:11:00Z'),
    ]);
    expect(stderr).not.toContain('失敗している check');
    expect(status).toBe(0);
  });
});

describe('畳み込みが失敗を消さないこと', () => {
  it('後から積まれた skipped で古い failure を消さない', () => {
    // job-level `if:` で skip された run は同一 SHA に conclusion: skipped の check run を
    // 作る（ci.yml の重量 job は draft PR で skip する）。skipped は失敗にも成功にも数えないため、
    // これを代表に選ぶと blocking な赤が消える。実在する経路:
    // ready で FAILURE → draft へ戻す → close → reopen（draft なので skip）。
    const { status, stderr } = runScript([
      checkRun('🎭 E2E Tests', 'FAILURE', '2026-07-30T10:00:00Z', 'COMPLETED', 'CI'),
      checkRun('🎭 E2E Tests', 'SKIPPED', '2026-07-30T10:10:00Z', 'COMPLETED', 'CI'),
      checkRun('docs guard', 'SUCCESS', '2026-07-30T10:01:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });

  it('後から積まれた skipped で古い success も消さない', () => {
    // 逆方向。skipped を代表にすると「成功 1 件以上」を割って別の理由で止まる。
    const { status, stderr } = runScript([
      checkRun('🎭 E2E Tests', 'SUCCESS', '2026-07-30T10:00:00Z', 'COMPLETED', 'CI'),
      checkRun('🎭 E2E Tests', 'SKIPPED', '2026-07-30T10:10:00Z', 'COMPLETED', 'CI'),
      ...vercelChecks(),
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

describe('trusted dispatch で解除された audit guard の免除', () => {
  // production-config-audit.yml は audit contract 保護対象を変更する PR で
  // check run「Audit Vercel metadata (trusted)」を設計として必ず failure にする。
  // 解除は trusted dispatch（workflow_dispatch）で、成功すると commit status
  // 「Production Config Audit」だけが head SHA へ success で発行される。
  // dispatch run の check run は rollup に紐づかないため、畳み込みでは解消できない。
  const guardFailure = () =>
    checkRun(
      'Audit Vercel metadata (trusted)',
      'FAILURE',
      '2026-08-03T00:25:00Z',
      'COMPLETED',
      'Production Config Audit',
    );

  it('status「Production Config Audit」が success なら guard の failure を免除する', () => {
    // PR #1799 で実測した形: guard の FAILURE と status の SUCCESS が共存する。
    const { status, stderr } = runScript([
      guardFailure(),
      statusContext('Production Config Audit', 'SUCCESS', '2026-08-03T00:25:36Z'),
      checkRun('CI', 'SUCCESS', '2026-08-03T00:20:00Z'),
      ...vercelChecks(),
    ]);
    expect(stderr).toContain('trusted dispatch により解除済み');
    expect(stderr).not.toContain('失敗している check');
    expect(status).toBe(0);
  });

  it('status が failure なら免除しない（dispatch 未実行 / audit 実失敗）', () => {
    // (a) audit が本当に落ちた PR も (b) dispatch 未実行の contract 変更 PR も、
    // status は failure のまま。免除は発動せず従来どおり止まる。
    const { status, stderr } = runScript([
      guardFailure(),
      statusContext('Production Config Audit', 'FAILURE', '2026-08-03T00:25:36Z'),
      checkRun('CI', 'SUCCESS', '2026-08-03T00:20:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });

  it('別名の check run の failure は status success があっても免除しない', () => {
    // 免除が「guard 1 check の完全一致」に閉じていること。status success を
    // 見ただけで他の failure まで握りつぶす実装だとここで緩む。
    const { status, stderr } = runScript([
      checkRun('E2E', 'FAILURE', '2026-08-03T00:25:00Z'),
      statusContext('Production Config Audit', 'SUCCESS', '2026-08-03T00:25:36Z'),
      checkRun('CI', 'SUCCESS', '2026-08-03T00:20:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });

  it('同名 check でも workflow が違えば免除しない', () => {
    // 照合は 型 + workflow 名 + check 名。name だけの一致で免除すると、
    // 別 workflow が同名 job を持った時に本物の failure が消える。
    const { status, stderr } = runScript([
      checkRun(
        'Audit Vercel metadata (trusted)',
        'FAILURE',
        '2026-08-03T00:25:00Z',
        'COMPLETED',
        'CI',
      ),
      statusContext('Production Config Audit', 'SUCCESS', '2026-08-03T00:25:36Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });

  it('guard が cancelled なら status success があっても免除しない', () => {
    // 免除対象は設計上の意図的 failure（enforce step の exit 1）だけ。cancelled /
    // timed_out は「監査が完走していない」状態で、古い run の success status が残った
    // まま再発火 run が publish 前に cancel された場合に免除すると fail-open になる。
    const { status, stderr } = runScript([
      checkRun(
        'Audit Vercel metadata (trusted)',
        'CANCELLED',
        '2026-08-03T00:25:00Z',
        'COMPLETED',
        'Production Config Audit',
      ),
      statusContext('Production Config Audit', 'SUCCESS', '2026-08-03T00:24:00Z'),
      checkRun('CI', 'SUCCESS', '2026-08-03T00:20:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
    expect(status).toBe(1);
  });

  it('免除が効いても、同居する他の failure は止める', () => {
    const { status, stderr } = runScript([
      guardFailure(),
      statusContext('Production Config Audit', 'SUCCESS', '2026-08-03T00:25:36Z'),
      checkRun('CI', 'FAILURE', '2026-08-03T00:20:00Z'),
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

  it('Vercel – product の status が無ければ止める', () => {
    // Actions 側の無条件 build を撤去したため、product の build 検証は Vercel の
    // status にしか存在しない。status が付かない経路（integration 切断・障害、
    // Ignored Build Step、project rename）では「成功 1 件以上」を Static / Unit /
    // Docs Guard だけで満たしてしまい、build を一度も走らせず merge できる。
    const { status, stderr } = runScript([
      checkRun('🔍 Static Checks', 'SUCCESS', '2026-08-03T10:00:00Z'),
      checkRun('📦 Unit Tests', 'SUCCESS', '2026-08-03T10:01:00Z'),
      checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-03T10:02:00Z'),
      statusContext('Vercel – web', 'SUCCESS', '2026-08-03T10:03:00Z'),
    ]);
    expect(stderr).toContain('必須 check「Vercel – product」');
    expect(status).toBe(1);
  });

  it('Vercel – web の status が無ければ止める', () => {
    const { status, stderr } = runScript([
      checkRun('🔍 Static Checks', 'SUCCESS', '2026-08-03T10:00:00Z'),
      statusContext('Vercel – product', 'SUCCESS', '2026-08-03T10:03:00Z'),
    ]);
    expect(stderr).toContain('必須 check「Vercel – web」');
    expect(status).toBe(1);
  });

  it('Vercel の context は en dash で照合する（hyphen では一致させない）', () => {
    // context 名は project 名由来で、区切りは U+2013。hyphen を許すと
    // 別名の check を必須扱いしてしまい、検出の意味が消える。
    const { status, stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-08-03T10:00:00Z'),
      statusContext('Vercel - product', 'SUCCESS', '2026-08-03T10:03:00Z'),
      statusContext('Vercel - web', 'SUCCESS', '2026-08-03T10:03:00Z'),
    ]);
    expect(stderr).toContain('必須 check「Vercel – product」');
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

describe('gate は REST 直叩きでも緩まない', () => {
  it('branch が main の最新を含んでいなければ止める', () => {
    // up-to-date gate。マージ対象 SHA を compare に pin した後も判定が生きていること。
    const { status, stderr } = runScript([checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z')], {
      compare: 'behind',
    });
    expect(stderr).toContain('branch が main の最新を含んでいません');
    expect(status).toBe(1);
  });

  it('diverged でも止める', () => {
    const { status } = runScript([checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z')], {
      compare: 'diverged',
    });
    expect(status).toBe(1);
  });

  it('draft PR は止める', () => {
    // `gh pr merge` のクライアント側 draft ガードを REST 直叩きで失わないこと。
    const { status, stderr } = runScript([checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z')], {
      isDraft: true,
    });
    expect(stderr).toContain('draft です');
    expect(status).toBe(1);
  });
});

describe('マージ経路（#1771 症状①）', () => {
  it('gh pr merge ではなく gh api でマージする', () => {
    // `gh pr merge --delete-branch` は「削除対象 branch が current」だと実行元 worktree を
    // main へ切り替える。REST 直叩きならローカル git に触れない。
    const { status, stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z'),
      ...vercelChecks(),
    ]);
    expect(status).toBe(0);
    expect(stderr).toContain('gh api -X PUT');
    expect(stderr).not.toContain('gh pr merge 123');
  });

  it('head SHA を指定してマージする（gate 通過後の push を弾く）', () => {
    const { stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z'),
      ...vercelChecks(),
    ]);
    expect(stderr).toContain(`-f sha=${'0'.repeat(40)}`);
  });
});

describe('main checkout に触らない掃除（#1771）', () => {
  it('通常系（MAIN_ROOT が main）は従来どおり branch -d で削除する', () => {
    const repo = runScriptOnRepo({
      prState: 'MERGED',
      mergeIntoMain: true,
      mainRootHead: 'main',
    });

    expect(repo.status).toBe(0);
    expect(repo.branchExists()).toBe(false);
    expect(repo.localMainMatchesRemote()).toBe(true);
    // rescue に落ちず -d で成功していること（通常系の挙動を変えていない）
    expect(repo.stderr).not.toContain('main への到達を確認');
    // step 8 の backstop がリモート branch を消していること
    expect(repo.remoteBranchExists()).toBe(false);
  });

  it('MAIN_ROOT の HEAD が別 branch でも branch を削除でき、HEAD を奪わない', () => {
    // 症状②③。`branch -d` は HEAD 基準でマージ済みを見るため、main へ完全に
    // マージ済みでも not fully merged になる。main 基準の判定で救う。
    const repo = runScriptOnRepo({
      prState: 'MERGED',
      mergeIntoMain: true,
      mainRootHead: 'other',
    });

    expect(repo.status).toBe(0);
    expect(repo.branchExists()).toBe(false);
    expect(repo.stderr).toContain('main への到達を確認');
    // 別セッションの作業（other）を奪っていないこと
    expect(repo.currentBranch(repo.mainRoot)).toBe('other');
    expect(repo.localMainMatchesRemote()).toBe(true);
  });

  it('main が別 worktree で checkout 中でも失敗せず、その worktree で fast-forward する', () => {
    // 症状①②。従来は `checkout main` が
    // 「main is already used by worktree」で落ちるか、別セッションの HEAD を奪っていた。
    const repo = runScriptOnRepo({
      prState: 'MERGED',
      mergeIntoMain: true,
      mainRootHead: 'other',
      addMainWorktree: true,
    });

    expect(repo.status).toBe(0);
    expect(repo.stderr).toContain('checkout 中です');
    expect(repo.branchExists()).toBe(false);
    expect(repo.localMainMatchesRemote()).toBe(true);
    // main を持つ worktree も MAIN_ROOT も checkout 先が変わっていないこと
    expect(repo.currentBranch(repo.mainWorktree)).toBe('main');
    expect(repo.currentBranch(repo.mainRoot)).toBe('other');
  });

  it('feature worktree の中から実行しても完走する', () => {
    // 症状①の実環境。自分が立っている worktree を削除しても後続が壊れないこと。
    const repo = runScriptOnRepo({
      prState: 'MERGED',
      mergeIntoMain: true,
      mainRootHead: 'other',
      addFeatureWorktree: true,
      runFrom: 'feature-worktree',
    });

    expect(repo.status).toBe(0);
    expect(existsSync(repo.featureWorktree)).toBe(false);
    expect(repo.branchExists()).toBe(false);
  });
});

describe('掃除で緩めてはいけない判定（#1771）', () => {
  it('マージに失敗したら掃除へ進まない', () => {
    // REST 直叩きは失敗しても fallback しない。worktree も branch も残ること。
    const repo = runScriptOnRepo({
      prState: 'OPEN',
      mergeFails: true,
      mergeIntoMain: false,
      mainRootHead: 'other',
      addFeatureWorktree: true,
    });

    expect(repo.status).toBe(1);
    expect(repo.stderr).toContain('マージに失敗しました');
    expect(existsSync(repo.featureWorktree)).toBe(true);
    expect(repo.branchExists()).toBe(true);
  });

  it('main に到達していない branch は rescue せず停止する', () => {
    // main 基準の判定を入れたことで「未マージでも -D で消える」方向へ倒れていないこと。
    // HEAD が別 branch = -d の偽陰性が起きる条件そのもので確認する。
    const repo = runScriptOnRepo({
      prState: 'CLOSED',
      mergeIntoMain: false,
      mainRootHead: 'other',
    });

    expect(repo.status).toBe(1);
    expect(repo.stderr).toContain('main に到達しておらず');
    expect(repo.branchExists()).toBe(true);
  });
});

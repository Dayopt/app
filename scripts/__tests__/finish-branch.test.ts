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

import {
  buildIssueReviewMarkerBody,
  computeIssueFingerprintFromIssue,
} from '../lib/issue-review-core.mjs';

/**
 * `finish-branch.sh` は Claude / 人間で共通のマージゲートで、判定を誤ると
 * 「失敗を見落としてマージする」方向に倒れる。実スクリプトを子プロセスで動かし、
 * `gh` だけ stub して check 判定の分岐を固定する。
 *
 * とくに **同一 head SHA に複数 run が積まれた rollup** を正しく畳めているかを見る。
 * `gh pr view --json statusCheckRollup` は同名 check を畳まないため（`gh pr checks` は畳む）、
 * 畳まずに数えると再実行で解決済みの failure を永久に数え続けてマージ不能になる。
 */

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const scriptPath = join(rootDir, 'scripts/tasks/finish-branch.sh');
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
 * merge gate が **名前で存在と success を要求する** check 一式。合格を期待する
 * ケースの rollup には必ず足す。
 *
 * - Vercel の 2 context: Actions 側の無条件 build を撤去し、product / web の
 *   build 検証が Vercel にしか無いため（#1813）
 * - Static Checks / Unit Tests: draft 中は ci.yml が skip するため、skipped の
 *   まま merge へ抜ける経路を塞ぐ（#2415）。**Static Checks は docs-only でも
 *   免除しない**（#2483 で secret/docs 検査が static job へ吸収され、docs-only
 *   PR でも唯一の実行経路になったため。内製クロスレビュー risk-reviewer
 *   指摘、P1、PR #2484）。Unit Tests だけ docs-only PR で免除される
 */
function requiredChecks(): RollupEntry[] {
  return [
    statusContext('Vercel – product', 'SUCCESS', '2026-07-30T10:00:00Z'),
    statusContext('Vercel – web', 'SUCCESS', '2026-07-30T10:00:00Z'),
    ...ciChecks(),
  ];
}

/** ci.yml の軽量層 2 job。draft skip（#2415）で名前指定の要求対象になった。 */
function ciChecks(conclusion = 'SUCCESS'): RollupEntry[] {
  return [
    checkRun('🔍 Static Checks', conclusion, '2026-07-30T10:00:00Z'),
    checkRun('📦 Unit Tests', conclusion, '2026-07-30T10:00:00Z'),
  ];
}

/** レビュー thread の GraphQL レスポンスを組み立てる（shape は gh api graphql の実出力） */
function threadsPayload(
  threads: Array<{ isResolved: boolean; path?: string; author?: string }>,
  hasNextPage = false,
  endCursor: string | null = null,
): unknown {
  return {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage, endCursor },
            nodes: threads.map((thread) => ({
              isResolved: thread.isResolved,
              path: thread.path ?? 'src/example.ts',
              comments: {
                nodes: [{ author: { login: thread.author ?? 'chatgpt-codex-connector' } }],
              },
            })),
          },
        },
      },
    },
  };
}

/** PR JSON が常に申告する headRefOid（このテストファイル内で固定値として扱う） */
const DEFAULT_HEAD_SHA = '0'.repeat(40);

/** 通過する `[internal-review]` marker 本文を組み立てる（head / agent 行込み） */
function internalReviewMarkerBody(
  overrides: { head?: string; agent?: string; p1?: string; p2?: string } = {},
): string {
  const head = overrides.head ?? DEFAULT_HEAD_SHA;
  const agent = overrides.agent ?? 'risk-reviewer';
  const p1 = overrides.p1 ?? 'none';
  const p2 = overrides.p2 ?? 'none';
  return `[internal-review]\nhead: ${head}\nagent: ${agent}\nP1: ${p1}\nP2: ${p2}`;
}

/** Codex GitHub 連携 bot の login（GraphQL 表記。REST は `[bot]` 付き） */
const CODEX_BOT_LOGIN = 'chatgpt-codex-connector';

type CodexReviewFixture = { login?: string; state?: string; commitOid?: string };

/**
 * 内製クロスレビュー痕跡クエリのレスポンスを組み立てる。
 *
 * 1 回のクエリで 2 系統の証跡を取る（`scripts/tasks/finish-branch.sh` 参照）:
 * - `comments`: 内製レビューの `[internal-review]` marker（1 層目）
 * - `reviews`: Codex の独立レビュー object（#2529、2 系統目）
 */
function reviewEvidencePayload(evidence: {
  comments?: Array<{ author: string; body?: string; association?: string }>;
  /** 窓（last: 100）より多い総件数を申告させる。省略時は nodes 件数 = 切り詰めなし */
  commentsTotalCount?: number;
  /** Codex review object。省略時は現 HEAD の有効なレビュー 1 件（既存ケースの前提を維持） */
  codexReviews?: CodexReviewFixture[];
  reviewsTotalCount?: number;
}): unknown {
  const comments = evidence.comments ?? [];
  const reviews = evidence.codexReviews ?? [{}];
  return {
    data: {
      repository: {
        pullRequest: {
          comments: {
            totalCount: evidence.commentsTotalCount ?? comments.length,
            nodes: comments.map((comment) => ({
              author: { login: comment.author },
              // 実測: 人間の repo member は MEMBER、bot は NONE を返す。
              authorAssociation:
                comment.association ?? (comment.author === 't3-nico' ? 'MEMBER' : 'NONE'),
              body: comment.body ?? '',
            })),
          },
          reviews: {
            totalCount: evidence.reviewsTotalCount ?? reviews.length,
            nodes: reviews.map((review) => ({
              author: { login: review.login ?? CODEX_BOT_LOGIN },
              state: review.state ?? 'COMMENTED',
              commit: { oid: review.commitOid ?? DEFAULT_HEAD_SHA },
            })),
          },
        },
      },
    },
  };
}

/** PR の closing issue references（`Closes #N`）のレスポンスを組み立てる。 */
function closingIssuesPayload(
  issues: Array<{ number: number; labels?: string[]; repo?: string }>,
  totalCount?: number,
): unknown {
  return {
    data: {
      repository: {
        pullRequest: {
          closingIssuesReferences: {
            totalCount: totalCount ?? issues.length,
            nodes: issues.map((issue) => ({
              number: issue.number,
              repository: { nameWithOwner: issue.repo ?? 'Dayopt/dayopt' },
              labels: { nodes: (issue.labels ?? []).map((name) => ({ name })) },
            })),
          },
        },
      },
    },
  };
}

/** N 件の resolve 済み thread を作る（ページング境界の件数合わせ用） */
function resolvedThreads(count: number): Array<{ isResolved: boolean }> {
  return Array.from({ length: count }, () => ({ isResolved: true }));
}

function runScript(
  rollup: RollupEntry[],
  options: {
    compare?: string;
    isDraft?: boolean;
    /** PR の変更ファイル一覧。省略時は product / web 両方に触れる形（従来テストの前提を維持） */
    files?: string[];
    /** rename の移動元（previous_filename）。API は移動先を filename で返す */
    previousFiles?: string[];
    /** PR の changedFiles 申告値。省略時は files の件数（= 一致して gate を通る） */
    changedFilesCount?: number;
    /** 変更ファイル一覧 API を失敗させる（fail closed 経路の検証） */
    filesUnavailable?: boolean;
    /** 一覧を部分的に出力した後で失敗させる（pagination 途中失敗の再現） */
    filesPartialFailure?: boolean;
    /** レビュー thread の状態（1 ページ目のみ）。省略時は 0 件（gate を通す） */
    threads?: Array<{ isResolved: boolean; path?: string; author?: string }>;
    /** thread 取得 API を失敗させる（fail closed 経路の検証） */
    threadsUnavailable?: boolean;
    /** reviewThreads の 1 ページ目が hasNextPage: true で終わり、2 ページ目を用意しない状態にする */
    threadsTruncated?: boolean;
    /**
     * reviewThreads を複数ページに分けてレスポンスを組み立てる。指定時は `threads` /
     * `threadsTruncated` より優先する。各要素が 1 ページ分。`hasNextPage` を省略した
     * 要素は「最後の要素以外は true、最後は false」として扱う（20 ページ上限の
     * テストのように全ページ true にしたい場合だけ明示する）。
     */
    threadPages?: Array<{
      threads?: Array<{ isResolved: boolean; path?: string; author?: string }>;
      hasNextPage?: boolean;
    }>;
    /**
     * 内製クロスレビューの痕跡（comments）。省略時は `[internal-review]` marker
     * （head / agent 行込み）が 1 件ある状態にして gate を通す（既存ケースの
     * 前提を変えないため）。
     */
    reviewEvidence?: {
      comments?: Array<{ author: string; body?: string; association?: string }>;
      commentsTotalCount?: number;
      /** Codex review object（#2529）。省略時は現 HEAD の有効レビュー 1 件 */
      codexReviews?: CodexReviewFixture[];
      reviewsTotalCount?: number;
    };
    /** 痕跡クエリを失敗させる（fail closed 経路の検証） */
    reviewEvidenceUnavailable?: boolean;
    /**
     * PR の closing issue references（`Closes #N`）。省略時は 0 件。
     * `review:full` を持つ issue が 1 件でもあれば review gate が required になる（#2530）。
     */
    linkedIssues?: Array<{ number: number; labels?: string[]; repo?: string }>;
    /** closing issue references の申告総件数（窓超過の検証用） */
    linkedIssuesTotalCount?: number;
    /** closing issue references の取得を失敗させる（fail closed 経路の検証） */
    linkedIssuesUnavailable?: boolean;
    /**
     * linked issue ごとの Issue Review 証跡（issue-review-gate.mjs が読む GraphQL 応答）。
     * 省略した issue は「証跡なし」として gate が停止する。
     */
    issueFixtures?: Record<
      number,
      {
        title?: string;
        body?: string;
        labels?: string[];
        /** 過去に剥がされたラベル（UNLABELED_EVENT）。review:full を含めると降格しない */
        removedLabels?: string[];
        lastEditedAt?: string;
        comments?: Array<{
          author: string;
          body?: string;
          association?: string;
          createdAt?: string;
          url?: string;
        }>;
      }
    >;
    /**
     * PR に付与されたラベル名一覧。`review:full` を含めると保護対象 path に
     * 該当しなくても内製クロスレビュー marker gate を要求する（#2478）。
     * 省略時はラベル無し。
     */
    labels?: string[];
  } = {},
): { status: number | null; stderr: string } {
  // repo 直下ではなく os の temp に作る。プロセスが afterEach 前に落ちると untracked な
  // ディレクトリが repo に残り、まさにこのスクリプトの dirty ゲートが以後の掃除を止める。
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'finish-branch-test-'));
  temporaryDirectories.push(temporaryDirectory);

  const binDirectory = join(temporaryDirectory, 'bin');
  mkdirSync(binDirectory);

  const changedFiles = options.files ?? ['apps/product/src/app.ts', 'apps/web/src/page.tsx'];
  const previousFiles = options.previousFiles ?? [];

  const payloadPath = join(temporaryDirectory, 'pr.json');
  writeFileSync(
    payloadPath,
    JSON.stringify({
      state: 'OPEN',
      isDraft: options.isDraft ?? false,
      headRefName: BRANCH,
      headRefOid: DEFAULT_HEAD_SHA,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      statusCheckRollup: rollup,
      changedFiles: options.changedFilesCount ?? changedFiles.length,
      labels: (options.labels ?? []).map((name) => ({ name })),
    }),
  );

  // PR の変更ファイル一覧（impact 判定の入力）。既定は product / web 両方に触れる形。
  // 実際の gh は `F<TAB>filename` / `P<TAB>previous_filename` の形で出す（rename の
  // 移動元を落とさず、かつ「ファイル件数」を数えられるようにするため）。
  const filesPath = join(temporaryDirectory, 'files.txt');
  writeFileSync(
    filesPath,
    options.filesUnavailable
      ? ''
      : `${[
          ...changedFiles.map((file) => `F\t${file}`),
          ...previousFiles.map((file) => `P\t${file}`),
        ].join('\n')}\n`,
  );

  // レビュー thread の GraphQL レスポンス（ページ単位）。gh スタブは cursor 引数
  // （page-N.json の N）でページを選ぶため、実際のディレクトリに 1..N の
  // page-*.json を並べる。threadsUnavailable は実在しないディレクトリを指させて
  // cat を失敗させる（API 不通の再現）。
  const threadsDirectory = join(temporaryDirectory, 'threads');
  mkdirSync(threadsDirectory);

  const pages =
    options.threadPages ??
    ([
      { threads: options.threads ?? [], hasNextPage: options.threadsTruncated ?? false },
    ] satisfies Array<{
      threads: Array<{ isResolved: boolean; path?: string; author?: string }>;
      hasNextPage: boolean;
    }>);

  pages.forEach((page, index) => {
    const pageNumber = index + 1;
    const isLast = index === pages.length - 1;
    const hasNextPage = page.hasNextPage ?? !isLast;
    // 次ページの cursor はそのページ番号の文字列にする。gh スタブはこの値を
    // そのまま `page-<cursor>.json` の解決に使う。
    const endCursor = hasNextPage ? String(pageNumber + 1) : null;
    writeFileSync(
      join(threadsDirectory, `page-${pageNumber}.json`),
      JSON.stringify(threadsPayload(page.threads ?? [], hasNextPage, endCursor)),
    );
  });

  // 内製クロスレビュー痕跡クエリのレスポンス。既定は通過する [internal-review] marker が 1 件ある状態。
  const reviewEvidencePath = join(temporaryDirectory, 'review-evidence.json');
  writeFileSync(
    reviewEvidencePath,
    JSON.stringify(
      reviewEvidencePayload(
        options.reviewEvidence ?? {
          comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }],
        },
      ),
    ),
  );

  // PR の closing issue references（`Closes #N`）のレスポンス。既定は 0 件。
  const closingIssuesPath = join(temporaryDirectory, 'closing-issues.json');
  writeFileSync(
    closingIssuesPath,
    JSON.stringify(
      closingIssuesPayload(options.linkedIssues ?? [], options.linkedIssuesTotalCount),
    ),
  );

  // linked issue ごとの Issue Review 証跡（issue-review-gate.mjs が読む形）。
  const issueDirectory = join(temporaryDirectory, 'issues');
  mkdirSync(issueDirectory);
  for (const [numberKey, fixture] of Object.entries(options.issueFixtures ?? {})) {
    const comments = fixture.comments ?? [];
    writeFileSync(
      join(issueDirectory, `issue-${numberKey}.json`),
      JSON.stringify({
        data: {
          repository: {
            issue: {
              number: Number(numberKey),
              title: fixture.title ?? 'linked issue',
              body: fixture.body ?? '本文',
              lastEditedAt: fixture.lastEditedAt ?? null,
              labels: { nodes: (fixture.labels ?? ['review:full']).map((name) => ({ name })) },
              renames: { nodes: [] },
              unlabeled: {
                nodes: (fixture.removedLabels ?? []).map((name) => ({ label: { name } })),
              },
              comments: {
                totalCount: comments.length,
                nodes: comments.map((comment) => ({
                  authorAssociation:
                    comment.association ?? (comment.author === 't3-nico' ? 'MEMBER' : 'NONE'),
                  author: { login: comment.author },
                  body: comment.body ?? '',
                  createdAt: comment.createdAt ?? '2026-09-01T00:00:00Z',
                  url: comment.url,
                })),
              },
            },
          },
        },
      }),
    );
  }

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
    shift
    if [[ "\${1:-}" == graphql ]]; then
      # graphql は 4 用途ある。判定順は「限定的なクエリから先に」— issue クエリも
      # comments(last:) を含むため、先に issue / closingIssues を振り分ける。
      if [[ "$*" == *"closingIssuesReferences"* ]]; then
        cat "$FINISH_BRANCH_CLOSING_ISSUES"
        exit 0
      fi
      if [[ "$*" == *"issue(number:"* ]]; then
        issue_number=""
        for arg in "$@"; do
          case "$arg" in
            number=*) issue_number="\${arg#number=}" ;;
          esac
        done
        cat "$FINISH_BRANCH_ISSUE_DIR/issue-\${issue_number}.json"
        exit 0
      fi
      # reviewThreads のページングと、クロスレビュー痕跡の取得（comments last: +
      # reviews last:）。thread クエリ側は comments(first: 1) を使うため衝突しない。
      if [[ "$*" == *"comments(last:"* ]]; then
        cat "$FINISH_BRANCH_REVIEW_EVIDENCE"
        exit 0
      fi
      # cursor 引数（-f cursor=VALUE）を argv から拾う。無ければ 1 ページ目。
      cursor=""
      for arg in "$@"; do
        case "$arg" in
          cursor=*) cursor="\${arg#cursor=}" ;;
        esac
      done
      if [[ -n "$cursor" ]]; then
        cat "$FINISH_BRANCH_THREADS_DIR/page-\${cursor}.json"
      else
        cat "$FINISH_BRANCH_THREADS_DIR/page-1.json"
      fi
    else
      case "$*" in
        *pulls/123/files*)
          cat "$FINISH_BRANCH_PR_FILES"
          if [[ "\${FINISH_BRANCH_FILES_EXIT:-0}" != "0" ]]; then exit 1; fi
          ;;
        *compare*) echo "$FINISH_BRANCH_COMPARE" ;;
        *full_name*) echo "Dayopt/dayopt" ;;
        *) exit 2 ;;
      esac
    fi
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
      FINISH_BRANCH_PR_FILES: options.filesUnavailable
        ? join(temporaryDirectory, 'missing-files.txt')
        : filesPath,
      FINISH_BRANCH_THREADS_DIR: options.threadsUnavailable
        ? join(temporaryDirectory, 'missing-threads-dir')
        : threadsDirectory,
      FINISH_BRANCH_FILES_EXIT: options.filesPartialFailure ? '1' : '0',
      FINISH_BRANCH_REVIEW_EVIDENCE: options.reviewEvidenceUnavailable
        ? join(temporaryDirectory, 'missing-review-evidence.json')
        : reviewEvidencePath,
      FINISH_BRANCH_CLOSING_ISSUES: options.linkedIssuesUnavailable
        ? join(temporaryDirectory, 'missing-closing-issues.json')
        : closingIssuesPath,
      FINISH_BRANCH_ISSUE_DIR: issueDirectory,
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
  const headSha = git(seeder, 'rev-parse', BRANCH);
  const payloadPath = join(root, 'pr.json');
  writeFileSync(
    payloadPath,
    JSON.stringify({
      state: scenario.prState,
      isDraft: false,
      headRefName: BRANCH,
      headRefOid: headSha,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      statusCheckRollup:
        scenario.prState === 'OPEN'
          ? [checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z'), ...requiredChecks()]
          : [],
      changedFiles: 2,
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
      *closingIssuesReferences*) echo '{"data":{"repository":{"pullRequest":{"closingIssuesReferences":{"totalCount":0,"nodes":[]}}}}}' ;;
      *"comments(last:"*) echo '{"data":{"repository":{"pullRequest":{"comments":{"totalCount":1,"nodes":[{"author":{"login":"t3-nico"},"authorAssociation":"MEMBER","body":"[internal-review]\\nhead: ${headSha}\\nagent: risk-reviewer\\nP1: none"}]},"reviews":{"totalCount":1,"nodes":[{"author":{"login":"chatgpt-codex-connector"},"state":"COMMENTED","commit":{"oid":"${headSha}"}}]}}}}}' ;;
      *graphql*) echo '{"data":{"repository":{"pullRequest":{"reviewThreads":{"pageInfo":{"hasNextPage":false},"nodes":[]}}}}}' ;;
      *full_name*) echo "Dayopt/dayopt" ;;
      *pulls/123/files*) printf 'F\\tapps/product/src/x.ts\\nF\\tapps/web/src/y.ts\\n' ;;
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
      ...requiredChecks(),
    ]);
    expect(stderr).not.toContain('失敗している check');
    expect(status).toBe(0);
  });

  it('cancelled になった古い run も新しい success で解消される', () => {
    // cancel-in-progress で 1 本目が cancelled になる経路（draft→ready 等）。
    const { status, stderr } = runScript([
      checkRun('CI', 'CANCELLED', '2026-07-30T10:00:00Z'),
      checkRun('CI', 'SUCCESS', '2026-07-30T10:10:00Z'),
      ...requiredChecks(),
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
      ...ciChecks(),
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
      ...requiredChecks(),
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
      ...requiredChecks(),
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

    // fixture は 2026-07-30 の実測なので、当時まだ分割前だった `📦 Build & Test`
    // を含み、現行の `📦 Unit Tests` を持たない。実データ側は改変せず、名前指定の
    // 要求（#2415）を満たす分だけを足して畳み込みの検証に集中させる。
    const { status, stderr } = runScript([
      ...fixture.statusCheckRollup,
      checkRun('📦 Unit Tests', 'SUCCESS', '2026-07-30T10:20:00Z'),
    ]);
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

  it('Vercel – product が EXPECTED のままなら止める（存在だけでは通さない）', () => {
    // GitHub の StatusState には EXPECTED（status 到着待ち）があり、これは
    // is_failed にも is_pending にも該当しない。存在だけを見る実装だと
    // 「context はあるが build 未完了」で merge できてしまう。
    const { status, stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-08-03T10:00:00Z'),
      statusContext('Vercel – product', 'EXPECTED', '2026-08-03T10:03:00Z'),
      statusContext('Vercel – web', 'SUCCESS', '2026-08-03T10:03:00Z'),
    ]);
    expect(stderr).toContain('実行中の check');
    expect(status).toBe(1);
  });

  it('Vercel – product が FAILURE なら止める', () => {
    const { status, stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-08-03T10:00:00Z'),
      statusContext('Vercel – product', 'FAILURE', '2026-08-03T10:03:00Z'),
      statusContext('Vercel – web', 'SUCCESS', '2026-08-03T10:03:00Z'),
    ]);
    expect(stderr).toContain('失敗している check');
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

describe('affected-aware な Vercel context 要求（Impact Resolver 連携）', () => {
  it('product のみの変更なら Vercel – web が無くても merge へ進む', () => {
    // Vercel skip 導入後の通常状態。unaffected な project の context 欠落は正常。
    const { status, stderr } = runScript(
      [
        checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
        statusContext('Vercel – product', 'SUCCESS', '2026-08-04T10:01:00Z'),
        ...ciChecks(),
      ],
      { files: ['apps/product/src/features/tags/ui/TagList.tsx'] },
    );
    expect(stderr).toContain('必須 Vercel context: Vercel – product');
    expect(stderr).not.toContain('必須 check「Vercel – web」');
    expect(status).toBe(0);
  });

  it('product のみの変更でも Vercel – product の欠落は止める', () => {
    // affected な project の context 欠落は従来どおり fail closed。
    const { status, stderr } = runScript([checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z')], {
      files: ['apps/product/src/features/tags/ui/TagList.tsx'],
    });
    expect(stderr).toContain('必須 check「Vercel – product」');
    expect(status).toBe(1);
  });

  it('web のみの変更なら Vercel – product が無くても merge へ進む', () => {
    const { status, stderr } = runScript(
      [
        checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
        statusContext('Vercel – web', 'SUCCESS', '2026-08-04T10:01:00Z'),
        ...ciChecks(),
      ],
      { files: ['apps/web/src/app/page.tsx'] },
    );
    expect(stderr).toContain('必須 Vercel context: Vercel – web');
    expect(status).toBe(0);
  });

  it('docs のみの変更なら Vercel context を要求しない', () => {
    const { status, stderr } = runScript(
      [
        checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-04T10:00:00Z'),
        // Static Checks は docs-only でも要求される（#2483 P1 修正後）ため、
        // このテストの主眼（Vercel context の免除）を検証するには別途足す必要がある。
        checkRun('🔍 Static Checks', 'SUCCESS', '2026-08-04T10:00:00Z'),
      ],
      { files: ['docs/product/specs/calendar.md', 'AGENTS.md'] },
    );
    expect(stderr).toContain('Vercel context は要求しません');
    expect(status).toBe(0);
  });

  it('共通 package の変更は両方の context を要求する', () => {
    const { status, stderr } = runScript(
      [
        checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
        statusContext('Vercel – product', 'SUCCESS', '2026-08-04T10:01:00Z'),
      ],
      { files: ['packages/config/src/env.ts'] },
    );
    expect(stderr).toContain('必須 check「Vercel – web」');
    expect(status).toBe(1);
  });

  it('変更ファイル一覧を取得できなければ両方を必須にする（fail closed）', () => {
    // files API 不通で「影響なし」に倒れると、build 未検証のまま merge できてしまう。
    const { status, stderr } = runScript(
      [
        checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
        statusContext('Vercel – product', 'SUCCESS', '2026-08-04T10:01:00Z'),
      ],
      { filesUnavailable: true },
    );
    expect(stderr).toContain('影響判定を実行できませんでした');
    expect(stderr).toContain('必須 check「Vercel – web」');
    expect(status).toBe(1);
  });

  it('rename では移動元の app の context も必須にする', () => {
    // API は移動先を filename、移動元を previous_filename で返す。移動先だけを見ると
    // apps/product → docs の rename が docs-only 判定になり、ファイルが消えた側の
    // build を検証しないまま merge できてしまう。
    const { status, stderr } = runScript([checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z')], {
      files: ['docs/moved.md'],
      previousFiles: ['apps/product/src/moved.ts'],
    });
    expect(stderr).toContain('必須 check「Vercel – product」');
    expect(status).toBe(1);
  });

  it('rename の移動元は件数に数えない（changedFiles と一致させる）', () => {
    // previous_filename を件数に含めると申告件数と食い違い、正常な rename PR が
    // truncation 扱いで止まる（fail closed の過剰発動）。
    const { status, stderr } = runScript(
      [
        checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
        statusContext('Vercel – product', 'SUCCESS', '2026-08-04T10:01:00Z'),
        ...ciChecks(),
      ],
      {
        files: ['apps/product/src/moved.ts'],
        previousFiles: ['apps/product/src/old.ts'],
        changedFilesCount: 1,
      },
    );
    expect(stderr).not.toContain('truncation');
    expect(status).toBe(0);
  });

  it('取得件数が PR の申告件数に足りなければ両方を必須にする（3,000 件上限などの truncation）', () => {
    // files endpoint は --paginate でも 3,000 件で打ち切られ、その状態で成功終了する。
    // 打ち切りを完全な一覧と扱うと、後半にだけ現れる app の context が要求されない。
    const { status, stderr } = runScript(
      [
        checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
        statusContext('Vercel – web', 'SUCCESS', '2026-08-04T10:01:00Z'),
      ],
      { files: ['apps/web/src/page.tsx'], changedFilesCount: 3000 },
    );
    expect(stderr).toContain('truncation');
    expect(stderr).toContain('必須 check「Vercel – product」');
    expect(status).toBe(1);
  });

  it('一覧が部分的に取れて失敗した場合も両方を必須にする（pagination 途中失敗）', () => {
    // `gh api --paginate` はページごとに stdout へ流すため、後半ページの失敗は
    // 「部分的な一覧 + 非 0 終了」になる。部分出力を「取得成功」と扱うと、
    // 後半ページにだけ含まれる app の context を要求しないまま merge できてしまう。
    const { status, stderr } = runScript(
      [
        checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
        statusContext('Vercel – web', 'SUCCESS', '2026-08-04T10:01:00Z'),
      ],
      { files: ['apps/web/src/app/page.tsx'], filesPartialFailure: true },
    );
    expect(stderr).toContain('影響判定を実行できませんでした');
    expect(stderr).toContain('必須 check「Vercel – product」');
    expect(status).toBe(1);
  });

  it('未知の path は両方を必須にする（fail closed）', () => {
    const { status, stderr } = runScript(
      [
        checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
        statusContext('Vercel – product', 'SUCCESS', '2026-08-04T10:01:00Z'),
      ],
      { files: ['mystery.config.xyz'] },
    );
    expect(stderr).toContain('必須 check「Vercel – web」');
    expect(status).toBe(1);
  });
});

/**
 * Draft CI 廃止（#2415）に伴い、軽量層（Static Checks / Unit Tests）は draft の間
 * skip される。skipped は失敗にも成功にも実行中にも数えないため、集約判定
 * （失敗 0 / 実行中 0 / success 1 件以上）だけでは「一度も実走しないまま merge」
 * を通してしまう（success 1 件は draft guard を持たない docs guard が満たす）。
 * 名前で success を要求してその class を閉じているかを固定する。
 */
describe('軽量層（Static Checks / Unit Tests）の実走要求（#2415）', () => {
  // Vercel context を要求されない docs 以外の path で、CI check の有無だけを見る。
  // `scripts/**` は product / web いずれにも影響しないが docs-only でもない。
  const SCRIPTS_ONLY = { files: ['scripts/ci/impact.mjs'] };

  it('draft 中の skipped が残ったままなら止める（ready 直後の窓で merge しない）', () => {
    const { status, stderr } = runScript(
      [
        checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-26T10:00:00Z'),
        ...ciChecks('SKIPPED'),
      ],
      SCRIPTS_ONLY,
    );
    expect(stderr).toContain('必須 check「🔍 Static Checks」');
    expect(status).toBe(1);
  });

  it('check が 1 件も登録されていなければ止める（workflow が発火しなかった場合）', () => {
    const { status, stderr } = runScript(
      [checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-26T10:00:00Z')],
      SCRIPTS_ONLY,
    );
    expect(stderr).toContain('必須 check「🔍 Static Checks」が 1 件も見つかりません');
    expect(status).toBe(1);
  });

  it('Unit Tests だけが欠けていても止める', () => {
    const { status, stderr } = runScript(
      [
        checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-26T10:00:00Z'),
        checkRun('🔍 Static Checks', 'SUCCESS', '2026-08-26T10:00:00Z'),
      ],
      SCRIPTS_ONLY,
    );
    expect(stderr).toContain('必須 check「📦 Unit Tests」');
    expect(status).toBe(1);
  });

  it('両方 success なら通す', () => {
    const { status, stderr } = runScript(
      [checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-26T10:00:00Z'), ...ciChecks()],
      SCRIPTS_ONLY,
    );
    expect(stderr).not.toContain('必須 check「🔍 Static Checks」');
    expect(stderr).not.toContain('必須 check「📦 Unit Tests」');
    expect(status).toBe(0);
  });

  it('docs-only PR では Unit Tests の skipped だけを許容する（Static Checks は引き続き要求する）', () => {
    const { status, stderr } = runScript(
      [
        checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-26T10:00:00Z'),
        checkRun('🔍 Static Checks', 'SUCCESS', '2026-08-26T10:00:00Z'),
        checkRun('📦 Unit Tests', 'SKIPPED', '2026-08-26T10:00:00Z'),
      ],
      { files: ['docs/product/specs/calendar.md'] },
    );
    expect(stderr).toContain('docs-only の変更のため');
    expect(status).toBe(0);
  });

  it('docs-only PR でも Static Checks が skipped のままなら止める（#2483 P1: secret scan bypass の再発防止）', () => {
    const { status, stderr } = runScript(
      [
        checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-26T10:00:00Z'),
        ...ciChecks('SKIPPED'),
      ],
      { files: ['docs/product/specs/calendar.md'] },
    );
    expect(stderr).toContain('必須 check「🔍 Static Checks」');
    expect(status).toBe(1);
  });

  // 未知の path は docs でも app でもない。docsOnly=false 側（要求する側）へ倒る
  // ことを、Vercel context ではなくこの gate で直接固定する（既存の
  // 「未知の path は両方を必須にする」は Vercel gate で先に止まるため、
  // 軽量層の要求が未知 path で効くことまでは証明していない）。
  it('未知の path でも docs-only 扱いにせず要求する', () => {
    const { status, stderr } = runScript(
      [
        checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-26T10:00:00Z'),
        statusContext('Vercel – product', 'SUCCESS', '2026-08-26T10:01:00Z'),
        statusContext('Vercel – web', 'SUCCESS', '2026-08-26T10:01:00Z'),
      ],
      { files: ['mystery.config.xyz'] },
    );
    expect(stderr).toContain('必須 check「🔍 Static Checks」');
    expect(status).toBe(1);
  });

  // 影響判定が不能なとき docsOnly を true 側へ倒すと、判定不能がそのまま免除に
  // なってしまう。Vercel context が fail closed で両方必須になるのと同じ向きに揃える。
  it('影響判定に失敗したら docs-only 扱いにせず要求する（fail closed）', () => {
    const { status, stderr } = runScript(
      [
        checkRun('🛡️ docs & secrets guard', 'SUCCESS', '2026-08-26T10:00:00Z'),
        ...requiredChecks(),
      ].filter((entry) => (entry.name as string) !== '🔍 Static Checks'),
      { filesUnavailable: true },
    );
    expect(stderr).toContain('影響判定を実行できませんでした');
    expect(stderr).toContain('必須 check「🔍 Static Checks」');
    expect(status).toBe(1);
  });
});

describe('レビュー thread の必須解決 gate', () => {
  const greenRollup = () => [
    checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
    ...requiredChecks(),
  ];

  it('未解決 thread が 1 件でもあれば止め、一覧を表示する', () => {
    const { status, stderr } = runScript(greenRollup(), {
      threads: [
        { isResolved: true, path: 'src/resolved.ts' },
        {
          isResolved: false,
          path: 'scripts/tasks/finish-branch.sh',
          author: 'chatgpt-codex-connector',
        },
      ],
    });
    expect(stderr).toContain('未解決のレビュー thread が 1 件');
    expect(stderr).toContain('scripts/tasks/finish-branch.sh');
    expect(status).toBe(1);
  });

  it('全 thread が resolve 済みなら merge へ進む', () => {
    const { status, stderr } = runScript(greenRollup(), {
      threads: [{ isResolved: true }, { isResolved: true }],
    });
    expect(stderr).toContain('未解決のレビュー thread はありません');
    expect(status).toBe(0);
  });

  it('thread の取得に失敗したら止める（fail closed）', () => {
    // 「未確認のまま通す」を許すと、API 障害のたびに gate が消える。
    const { status, stderr } = runScript(greenRollup(), { threadsUnavailable: true });
    expect(stderr).toContain('レビュー thread の状態を取得できませんでした');
    expect(status).toBe(1);
  });

  it('101 件（2 ページ）を全走査し、全 resolve 済みなら merge へ進む', () => {
    // PR #1820 の実測（thread 101 件・未解決 0 件）を再現する。旧実装は
    // first: 100 の 1 ページ目で hasNextPage=true を見た時点で即停止していた
    // （issue #1831）。2 ページ目まで走査して初めて「未解決 0 件」と判定できる。
    const { status, stderr } = runScript(greenRollup(), {
      threadPages: [{ threads: resolvedThreads(100) }, { threads: resolvedThreads(1) }],
    });
    expect(stderr).toContain('未解決のレビュー thread はありません');
    expect(status).toBe(0);
  });

  it('101 件のうち 2 ページ目に未解決が 1 件あれば止める', () => {
    // 1 ページ目だけ見て判定を打ち切っていないことを、2 ページ目側の未解決で確認する。
    const { status, stderr } = runScript(greenRollup(), {
      threadPages: [
        { threads: resolvedThreads(100) },
        { threads: [{ isResolved: false, path: 'scripts/tasks/finish-branch.sh' }] },
      ],
    });
    expect(stderr).toContain('未解決のレビュー thread が 1 件');
    expect(stderr).toContain('scripts/tasks/finish-branch.sh');
    expect(status).toBe(1);
  });

  it('ページ数が上限（20 ページ）を超えるほど残っていれば止める', () => {
    // 暴走防止の上限は件数（100 件超）ではなくページ数。first:100 × 20 ページ
    // 尽くしてもなお hasNextPage が true な場合だけ「全件確認できない」で止める。
    const { status, stderr } = runScript(greenRollup(), {
      threadPages: Array.from({ length: 20 }, () => ({
        threads: resolvedThreads(1),
        hasNextPage: true,
      })),
    });
    expect(stderr).toContain('20 ページ');
    expect(stderr).toContain('全件を確認できません');
    expect(status).toBe(1);
  });

  it('ちょうど 20 ページ目で hasNextPage: false なら全件確認できたとして進む', () => {
    // 上限ぎりぎり（2,000 件）でも「確認できないから停止」に倒れないことを確認する。
    const { status, stderr } = runScript(greenRollup(), {
      threadPages: Array.from({ length: 20 }, () => ({ threads: resolvedThreads(1) })),
    });
    expect(stderr).toContain('未解決のレビュー thread はありません');
    expect(status).toBe(0);
  });
});

describe('内製クロスレビューの痕跡 gate', () => {
  const greenRollup = () => [
    checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
    ...requiredChecks(),
  ];

  // 内製クロスレビュー marker gate は保護対象 path に触れる PR にのみ必須化された
  // （#2478、レビュー gate のテンポ連動化）。このブロックは marker 判定ロジック
  // そのものを検証する場なので、常に保護対象 path（migration ファイル）を変更
  // ファイルに含めてゲートを起動させる。gate 条件化そのものの挙動は別の
  // describe（'保護対象 path / review:full ラベルによる gate 条件化（#2478）'）で見る。
  const run: typeof runScript = (rollup, options = {}) =>
    runScript(rollup, { files: ['supabase/migrations/0001_test.sql'], ...options });

  it('痕跡が 1 つも無ければ止める（レビューの投げ忘れ）', () => {
    // thread の必須解決 gate は「存在する指摘」しか見ないため、thread 0 件の PR は
    // 「レビュー済みで指摘ゼロ」と「投げ忘れ」を区別できない。ここが本 gate の主目的。
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: { comments: [{ author: 't3-nico', body: 'よろしくお願いします' }] },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('head / agent 行が揃った marker を痕跡として認める', () => {
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: { comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }] },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(status).toBe(0);
  });

  it('P1/P2 が「なし」の申告なら review thread が 0 件でも通す', () => {
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody({ p1: 'なし', p2: '0' }) }],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(status).toBe(0);
  });

  it('marker が P1 で指摘ありと申告しているのに review thread が 0 件なら止める（申告と実体の突き合わせ）', () => {
    // marker は自己申告であり、review comment を投稿し忘れても marker 自体の
    // 5 点チェックは通ってしまう。P1/P2 の非ゼロ申告と thread の実在を
    // 突き合わせることで、この抜け道を塞ぐ。
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: internalReviewMarkerBody({ p1: '2 件', p2: 'none' }) },
        ],
      },
    });
    expect(stderr).toContain('review thread が 1 件もありません');
    expect(status).toBe(1);
  });

  it('marker が P1 で指摘ありと申告していても review thread が 1 件あれば通す', () => {
    const { status, stderr } = run(greenRollup(), {
      threads: [{ isResolved: true }],
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: internalReviewMarkerBody({ p1: '2 件', p2: 'none' }) },
        ],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(status).toBe(0);
  });

  it('CRLF 改行の marker でも head / agent 行を認識する', () => {
    const crlfBody = internalReviewMarkerBody().replace(/\n/g, '\r\n');
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: { comments: [{ author: 't3-nico', body: crlfBody }] },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(status).toBe(0);
  });

  it('association が CONTRIBUTOR の marker では通さない', () => {
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [
          {
            author: 'some-contributor',
            association: 'CONTRIBUTOR',
            body: internalReviewMarkerBody(),
          },
        ],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('github-actions[bot]（association NONE）の marker では通さない', () => {
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [
          {
            author: 'github-actions[bot]',
            association: 'NONE',
            body: internalReviewMarkerBody(),
          },
        ],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('head 行が現在の HEAD SHA と一致しなければ止める（marker の使い回し防止）', () => {
    // 早い段階で貼った marker を使い回し、その後の未レビュー push を素通りさせる
    // 抜け道を塞ぐ。DEFAULT_HEAD_SHA と異なる sha を指す marker は無効。
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody({ head: '1'.repeat(40) }) }],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('head 行が無ければ止める', () => {
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: '[internal-review]\nagent: risk-reviewer\nP1: none' },
        ],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('agent 行が無ければ止める', () => {
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [
          {
            author: 't3-nico',
            body: `[internal-review]\nhead: ${DEFAULT_HEAD_SHA}\nP1: none`,
          },
        ],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('agent 行はあるが値が空なら止める（`\\s*` が改行を跨いで次行の内容にマッチする回帰）', () => {
    // jq の `\s` は改行にマッチするため、`^agent:\s*\S` は「agent: の後が空のまま
    // 次の行に何か書かれていれば」誤って通過する。行内の空白（スペース/タブ）だけを
    // 許す `[ \t]*` に固定する必要がある。
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [
          {
            author: 't3-nico',
            body: `[internal-review]\nhead: ${DEFAULT_HEAD_SHA}\nagent:\nP1: none`,
          },
        ],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('引用された marker では通さない（stderr / 規約文の貼り付けで空洞化しない）', () => {
    // gate 自身の停止メッセージと workflow.md の規約本文には marker が平文で載る。
    // 素朴な部分一致だと、それを PR コメントへ貼るだけで gate が黙って無効化される。
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [
          {
            author: 't3-nico',
            body: `gate に止められた。メッセージは以下:\n\n> ${internalReviewMarkerBody()}\n\nどう対応する？`,
          },
        ],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('先頭に複数の空行があっても marker を認める（1 段階だけの trim では落ちる回帰）', () => {
    // 旧実装の `ltrimstr(" ") | ltrimstr("\n")` は先頭の空白/改行をそれぞれ 1 回しか
    // 剥がさない。2 行以上の空行を挟んで marker を貼ると本来通るべきコメントが
    // 「引用された marker」と区別できず弾かれていた。
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: `\n\n${internalReviewMarkerBody()}` }],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(status).toBe(0);
  });

  it('第三者（association が NONE）の marker では通さない', () => {
    // public repo なので任意のユーザーが PR にコメントできる。書き手を絞らないと
    // 外部から 1 コメントで gate を無効化できてしまう。
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [
          { author: 'random-passerby', association: 'NONE', body: internalReviewMarkerBody() },
        ],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('marker だけで中身が無いコメントは通さない', () => {
    for (const body of ['[internal-review]', '[internal-review]   \n  ']) {
      const { status, stderr } = run(greenRollup(), {
        threads: [],
        reviewEvidence: { comments: [{ author: 't3-nico', body }] },
      });
      expect(stderr).toContain('内製クロスレビューの痕跡がありません');
      expect(status).toBe(1);
    }
  });

  it('comments が 100 件超なら、止める時に窓の切り詰めを伝える', () => {
    // last: 100 の窓から古い痕跡が落ちうる。判定は緩めず（切り詰めを理由に通すと
    // fail open になる）、なぜ止まったかだけを説明する。
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: { comments: [], commentsTotalCount: 140 },
    });
    expect(stderr).toContain('直近 100 件しか見ていません');
    expect(status).toBe(1);
  });

  it('100 件超でも痕跡があれば通す（切り詰めの説明は出さない）', () => {
    const { status, stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }],
        commentsTotalCount: 140,
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(stderr).not.toContain('直近 100 件しか見ていません');
    expect(status).toBe(0);
  });

  it('痕跡の取得に失敗したら止める（fail closed）', () => {
    const { status, stderr } = run(greenRollup(), { reviewEvidenceUnavailable: true });
    expect(stderr).toContain('内製クロスレビューの痕跡を取得できませんでした');
    expect(status).toBe(1);
  });

  it('止める時は pr-cross-review スキルへの案内と head/agent 行の要求を出す', () => {
    const { stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('pr-cross-review');
    expect(stderr).toContain('head:');
    expect(stderr).toContain('agent:');
  });

  it('通過時のログに agent 値を含める', () => {
    const { stderr } = run(greenRollup(), {
      threads: [],
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: internalReviewMarkerBody({ agent: 'behavior-verifier' }) },
        ],
      },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました（agent: behavior-verifier）');
  });

  describe('痕跡ゼロ時の原因区別（5 点判定のどれで落ちたかをヒントで示す）', () => {
    it('marker で始まるコメントが 1 件も無ければ原因 1 を示す', () => {
      const { stderr } = run(greenRollup(), {
        threads: [],
        reviewEvidence: { comments: [{ author: 't3-nico', body: 'よろしくお願いします' }] },
      });
      expect(stderr).toContain(
        '原因: 「[internal-review]」で本文が始まるコメントが 1 件もありません。',
      );
    });

    it('association が不足しているだけなら原因 2 を示す', () => {
      const { stderr } = run(greenRollup(), {
        threads: [],
        reviewEvidence: {
          comments: [
            { author: 'random-passerby', association: 'NONE', body: internalReviewMarkerBody() },
          ],
        },
      });
      expect(stderr).toContain(
        '原因: marker で始まるコメントはありますが、投稿者が OWNER/MEMBER/COLLABORATOR ではありません',
      );
    });

    it('marker だけで中身が無ければ原因 3 を示す', () => {
      const { stderr } = run(greenRollup(), {
        threads: [],
        reviewEvidence: { comments: [{ author: 't3-nico', body: '[internal-review]   \n  ' }] },
      });
      expect(stderr).toContain(
        '原因: marker の後に本文が続いていません（marker だけのコメントは無効です）。',
      );
    });

    it('head SHA が不一致なら原因 4 を示す（delta re-review の示唆）', () => {
      const { stderr } = run(greenRollup(), {
        threads: [],
        reviewEvidence: {
          comments: [
            { author: 't3-nico', body: internalReviewMarkerBody({ head: '1'.repeat(40) }) },
          ],
        },
      });
      expect(stderr).toContain('原因: marker はありますが `head: <sha>` が現在の HEAD SHA');
    });

    it('agent 行が欠落していれば原因 5 を示す', () => {
      const { stderr } = run(greenRollup(), {
        threads: [],
        reviewEvidence: {
          comments: [
            { author: 't3-nico', body: `[internal-review]\nhead: ${DEFAULT_HEAD_SHA}\nP1: none` },
          ],
        },
      });
      expect(stderr).toContain(
        '原因: marker と head SHA は一致していますが `agent:` 行が空または欠落しています。',
      );
    });

    it('複数条件が同時に不足していても、判定順で最初の原因だけを示す', () => {
      // association 不足（原因 2）と head 不一致（原因 4）が同時に起きているケース。
      // 判定順（1→5）で最初の不足である原因 2 だけを示し、原因 4 は出さない。
      const { stderr } = run(greenRollup(), {
        threads: [],
        reviewEvidence: {
          comments: [
            {
              author: 'random-passerby',
              association: 'NONE',
              body: internalReviewMarkerBody({ head: '1'.repeat(40) }),
            },
          ],
        },
      });
      expect(stderr).toContain(
        '原因: marker で始まるコメントはありますが、投稿者が OWNER/MEMBER/COLLABORATOR ではありません',
      );
      expect(stderr).not.toContain('原因: marker はありますが `head:');
    });
  });
});

describe('保護対象 path のレビュー gate 条件化（#2478）', () => {
  // 全 PR 一律の内製クロスレビュー要求をやめ、保護対象 path
  // （scripts/ci/protected-path-gate.mjs の PROTECTED_PATH_GLOBS）に触れる PR、
  // または review:full ラベルが付いた PR だけへ marker gate を要求する。
  const greenRollup = () => [
    checkRun('CI', 'SUCCESS', '2026-08-28T10:00:00Z'),
    ...requiredChecks(),
  ];

  it('保護対象 path（migration）を含む PR は marker 無しなら止める', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['supabase/migrations/0002_add_column.sql'],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: required (matched supabase/migrations/**)');
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('保護対象 path（auth）を含む PR は marker ありなら通す', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['apps/product/src/features/auth/server/router.ts'],
      threads: [],
      reviewEvidence: { comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }] },
    });
    expect(stderr).toContain('review gate: required (matched apps/product/src/features/auth/**)');
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(status).toBe(0);
  });

  it('ガードレール自身（.husky/**）に触れる PR も保護対象として扱う', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['.husky/pre-push'],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: required (matched .husky/**)');
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  // #2483 クロスレビュー: CI の中枢（token 隔離と test skip 判定を持つ check.mjs、
  // その job / permissions を決める ci.yml）も guardrail として必須側に置く。
  it.each([['scripts/ci/check.mjs'], ['.github/workflows/ci.yml']])(
    'CI の中枢（%s）は marker を要求する',
    (file) => {
      const { status, stderr } = runScript(greenRollup(), {
        files: [file],
        threads: [],
        reviewEvidence: { comments: [] },
      });
      expect(stderr).toContain(`review gate: required (matched ${file})`);
      expect(status).toBe(1);
    },
  );

  // #2509: Phase C の移動（scripts/ → scripts/ci/）後も glob が旧 path のままだと、
  // production 監査本体を書き換える PR が marker gate を素通りする。
  it('production 監査本体（scripts/ci/production-config-audit.mjs）は marker を要求する', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['scripts/ci/production-config-audit.mjs'],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain(
      'review gate: required (matched scripts/ci/production-config-audit.mjs)',
    );
    expect(status).toBe(1);
  });

  it('CI でも nightly.yml は marker を要求しない（PR gate を持たないため）', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['.github/workflows/nightly.yml'],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: not required');
    expect(status).toBe(0);
  });

  it('非保護対象 path のみなら marker 無しでも通す（gate skip）', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['apps/product/src/features/activities/components/ActivityRow.tsx'],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: not required');
    expect(stderr).toContain('内製クロスレビュー marker gate をスキップします');
    expect(stderr).not.toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(0);
  });

  it('非保護対象 path でも review:full ラベルがあれば marker を必須にする（marker 無しで止める）', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['apps/product/src/features/activities/components/ActivityRow.tsx'],
      labels: ['review:full'],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: required (label: review:full)');
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('review:full ラベルによる要求も marker ありなら通す', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['apps/product/src/features/activities/components/ActivityRow.tsx'],
      labels: ['review:full'],
      threads: [],
      reviewEvidence: { comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }] },
    });
    expect(stderr).toContain('review gate: required (label: review:full)');
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(status).toBe(0);
  });

  it('変更ファイル一覧の取得に失敗したら fail closed で marker を要求する（marker 無しで止める）', () => {
    const { status, stderr } = runScript(greenRollup(), {
      filesUnavailable: true,
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: required (changed files unavailable, fail closed)');
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('変更ファイル一覧の取得に失敗しても marker があれば通す（fail closed だが実施済みなら merge できる）', () => {
    const { status, stderr } = runScript(greenRollup(), {
      filesUnavailable: true,
      threads: [],
      reviewEvidence: { comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }] },
    });
    expect(stderr).toContain('review gate: required (changed files unavailable, fail closed)');
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(status).toBe(0);
  });

  it('gate 判定の 1 行出力を確認する（not required）', () => {
    const { stderr } = runScript(greenRollup(), {
      files: ['apps/product/src/features/activities/components/ActivityRow.tsx'],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: not required');
  });

  // #2489（2026-08-31）: 保護対象を「外部契約 or 不可逆」だけへ絞り、Dayopt の
  // コア時間不変条件（timeblock / calendar / lib/time）を必須側から外した。
  // これらは CI と unit test で担保される可逆な挙動であり、必須のままだと
  // プロダクト実装 PR のほぼ全てが marker gate に落ち、Workflow / Agent が既定
  // 禁止のクラウドセッション（#2472）で merge が止まるだけだったため。
  it.each([
    ['apps/product/src/features/timeblock/lib/timeblock-status.ts'],
    ['apps/product/src/features/calendar/components/CalendarGrid.tsx'],
    ['apps/product/src/lib/time/half-open-interval.ts'],
    ['apps/product/src/lib/timezone-utils.ts'],
  ])('コア時間不変条件の path（%s）は marker を要求しない', (file) => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [file],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: not required');
    expect(stderr).toContain('内製クロスレビュー marker gate をスキップします');
    expect(status).toBe(0);
  });

  // #2489 クロスレビュー P1: feature を丸ごと外すと、timeblock/server に同居する
  // service role（RLS 迂回）の MCP クエリと privacy 境界まで必須側から落ちる。
  // 「外部契約 or 不可逆」に該当するこの 2 面だけは必須側へ残す。
  it.each([
    [
      'apps/product/src/features/timeblock/server/mcp-mutation-db.ts',
      'apps/product/src/features/timeblock/server/mcp-*',
    ],
    [
      'apps/product/src/features/timeblock/server/mcp-timeblock-read-client.ts',
      'apps/product/src/features/timeblock/server/mcp-*',
    ],
    [
      'apps/product/src/features/timeblock/server/private-timeblock-search-query.ts',
      'apps/product/src/features/timeblock/server/private-timeblock-search-query.ts',
    ],
  ])('timeblock/server の高リスク面（%s）は marker を要求する', (file, glob) => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [file],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain(`review gate: required (matched ${glob})`);
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  // plan-service.ts / record-service.ts は runPrivateTimeblockSearchQuery を正しく
  // 使っているが、この glob には載せない（#2503）。将来 wrapper 呼び出しを削って
  // 検索語を Sentry へ漏らす回帰は、ここではなく class-based な contract test
  // （apps/product/.../private-search-boundary-contract.test.ts）が検出する。
  it('同じ timeblock/server でも高リスク面でない service は marker を要求しない', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['apps/product/src/features/timeblock/server/plan-service.ts'],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: not required');
    expect(status).toBe(0);
  });

  // #2503 監査で追加した 5 glob。「外部契約 or 不可逆」に該当する MCP 認可面 /
  // アカウント削除の cron / 外部 calendar の不可逆操作 3 種。
  it.each([
    ['apps/product/src/lib/mcp/auth.ts', 'apps/product/src/lib/mcp/**'],
    [
      'apps/product/src/app/api/cron/calendar-account-deletion-settle/route.ts',
      'apps/product/src/app/api/cron/calendar-account-deletion-settle/**',
    ],
    [
      'apps/product/src/features/external-calendar/server/account-deletion.ts',
      'apps/product/src/features/external-calendar/server/account-deletion.ts',
    ],
    [
      'apps/product/src/features/external-calendar/server/token-rotation.ts',
      'apps/product/src/features/external-calendar/server/token-rotation.ts',
    ],
    [
      'apps/product/src/features/external-calendar/server/revoke-outbox.ts',
      'apps/product/src/features/external-calendar/server/revoke-outbox.ts',
    ],
  ])('#2503 で追加した保護対象（%s）は marker を要求する', (file, glob) => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [file],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain(`review gate: required (matched ${glob})`);
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  // #2503 監査で「反転可能 / CI で担保済み」と判断して明示的に外した path。
  // 将来のリネームや似た命名で誤って保護対象化されていないことを固定する。
  it.each([
    ['apps/product/src/app/api/cron/calendar-sync/route.ts'],
    ['apps/product/src/app/api/cron/external-connection-maintenance/route.ts'],
    ['apps/product/src/lib/supabase/server.ts'],
    ['apps/product/src/features/external-calendar/server/event-pruning.ts'],
  ])('#2503 で明示的に対象外とした path（%s）は marker を要求しない', (file) => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [file],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: not required');
    expect(status).toBe(0);
  });

  it('コア時間不変条件の path でも review:full ラベルがあれば marker を必須にする', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['apps/product/src/features/timeblock/lib/timeblock-status.ts'],
      labels: ['review:full'],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('review gate: required (label: review:full)');
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('gate 判定の 1 行出力を確認する（required、matched glob 込み）', () => {
    const { stderr } = runScript(greenRollup(), {
      files: ['apps/product/src/lib/stripe/webhook-handler.ts'],
      threads: [],
      reviewEvidence: { comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }] },
    });
    expect(stderr).toContain('review gate: required (matched apps/product/src/lib/stripe/**)');
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
    // stderr まで assert するのは「どの gate で止まったか」を固定するため。status だけを
    // 見ていると、将来 gate の順序が変わって別の gate（例: #2415 で足した軽量層の
    // 名前指定要求）が先に発火した時、止まってはいるが up-to-date gate を証明しない
    // vacuous な test に静かにすり替わる。
    const { status, stderr } = runScript([checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z')], {
      compare: 'diverged',
    });
    expect(stderr).toContain('branch が main の最新を含んでいません');
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
      ...requiredChecks(),
    ]);
    expect(status).toBe(0);
    expect(stderr).toContain('gh api -X PUT');
    expect(stderr).not.toContain('gh pr merge 123');
  });

  it('head SHA を指定してマージする（gate 通過後の push を弾く）', () => {
    const { stderr } = runScript([
      checkRun('CI', 'SUCCESS', '2026-07-30T10:00:00Z'),
      ...requiredChecks(),
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

/**
 * #2529: クロスレビュー必須 PR は「内製 subagent」と「Codex」の 2 系統が
 * 現 HEAD に対して揃って初めて merge できる。
 *
 * 証跡は Codex 自身が投稿した GitHub review object（`chatgpt-codex-connector`）で、
 * Main が書ける marker ではない。Codex の失敗（error / timeout / usage limit /
 * 空応答）は「現 HEAD の review object が存在しない」に帰着するため、
 * 個別の失敗モードを列挙せずとも構造的に fail closed になる。
 */
describe('Codex 独立レビューの必須化（#2529）', () => {
  const greenRollup = () => [
    checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
    ...requiredChecks(),
  ];

  const protectedFile = 'supabase/migrations/20260901000000_x.sql';

  function runProtected(options: Parameters<typeof runScript>[1] = {}) {
    return runScript(greenRollup(), { files: [protectedFile], threads: [], ...options });
  }

  it('内製 marker と Codex review が現 HEAD で揃えば通す', () => {
    const { status, stderr } = runProtected();
    expect(stderr).toContain('内製クロスレビューの痕跡を確認しました');
    expect(stderr).toContain('Codex の独立レビューを確認しました');
    expect(status).toBe(0);
  });

  it('内製 marker だけでは通さない（Codex 側が欠けている）', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }],
        codexReviews: [],
      },
    });
    expect(stderr).toContain('Codex の痕跡（review object も clean pass コメントも）がありません');
    expect(stderr).toContain('@codex review');
    expect(status).toBe(1);
  });

  it('Codex review だけでは通さない（内製 marker が欠けている）', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  it('内製 marker が旧 HEAD を指していれば停止する', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody({ head: '1'.repeat(40) }) }],
      },
    });
    expect(stderr).toContain('現在の HEAD SHA');
    expect(status).toBe(1);
  });

  it('Codex review が旧 HEAD を指していれば停止する（delta を積み上げさせない）', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }],
        codexReviews: [{ commitOid: '1'.repeat(40) }],
      },
    });
    expect(stderr).toContain('古い commit に対するもの');
    expect(status).toBe(1);
  });

  it('HEAD 更新後に再レビューすれば通す（新旧 review が同居しても新側で通る）', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: internalReviewMarkerBody({ head: '1'.repeat(40) }) },
          { author: 't3-nico', body: internalReviewMarkerBody() },
        ],
        codexReviews: [{ commitOid: '1'.repeat(40) }, {}],
      },
    });
    expect(stderr).toContain('Codex の独立レビューを確認しました');
    expect(status).toBe(0);
  });

  it('別 login のレビューは Codex 証跡として数えない（producer の詐称を防ぐ）', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }],
        codexReviews: [{ login: 't3-nico' }],
      },
    });
    expect(stderr).toContain('review object が 1 件もありません');
    expect(status).toBe(1);
  });

  it.each([['PENDING'], ['DISMISSED']])('state が %s の Codex review は証跡にならない', (state) => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }],
        codexReviews: [{ state }],
      },
    });
    expect(stderr).toContain('PENDING / DISMISSED のみ');
    expect(status).toBe(1);
  });

  it('REST 形式の login（[bot] 付き）も Codex 証跡として認める', () => {
    const { status } = runProtected({
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }],
        codexReviews: [{ login: 'chatgpt-codex-connector[bot]' }],
      },
    });
    expect(status).toBe(0);
  });

  it('review の窓を超えている場合は停止時にその旨を伝える（判定は緩めない）', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }],
        codexReviews: [],
        reviewsTotalCount: 150,
      },
    });
    expect(stderr).toContain('review が 100 件を超えており');
    expect(status).toBe(1);
  });

  it('Codex の指摘 thread が未解決なら thread gate で停止する（既存機構で担保）', () => {
    const { status, stderr } = runProtected({
      threads: [{ isResolved: false, author: 'chatgpt-codex-connector' }],
    });
    expect(stderr).toContain('未解決のレビュー thread');
    expect(status).toBe(1);
  });

  it('クロスレビュー非対象 PR では Codex レビューを要求しない', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['apps/product/src/features/activities/components/ActivityRow.tsx'],
      threads: [],
      reviewEvidence: { comments: [], codexReviews: [] },
    });
    expect(stderr).toContain('review gate: not required');
    expect(stderr).not.toContain('Codex');
    expect(status).toBe(0);
  });

  // #2529 Issue Review P2（ガードレール自己保護）: レビュー証跡の生成・検証自身を
  // 変更する PR が、2 系統レビュー無しで merge できてはいけない。
  it.each([
    ['scripts/tasks/issue-review-gate.mjs'],
    ['scripts/lib/issue-review-core.mjs'],
    ['scripts/tasks/generate-issue-review-marker.mjs'],
    ['scripts/tasks/generate-marker.ts'],
    ['scripts/lib/generate-marker-core.ts'],
  ])('レビュー証跡機構自身（%s）は review gate を必須にする', (file) => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [file],
      threads: [],
      reviewEvidence: { comments: [] },
    });
    // marker gate で止まる（Codex gate はここまで到達しない）
    expect(stderr).toContain(`review gate: required (matched ${file})`);
    expect(stderr).toContain('内製クロスレビューの痕跡がありません');
    expect(status).toBe(1);
  });

  // 上の it.each は marker gate で止まるため Codex gate を通らない。
  // 証跡機構自身の変更でも 2 系統目が要ることを、marker あり・Codex なしで固定する。
  it('レビュー証跡機構自身の変更は marker があっても Codex レビューを要求する', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: ['scripts/lib/issue-review-core.mjs'],
      threads: [],
      reviewEvidence: {
        comments: [{ author: 't3-nico', body: internalReviewMarkerBody() }],
        codexReviews: [],
      },
    });
    expect(stderr).toContain('Codex の痕跡（review object も clean pass コメントも）がありません');
    expect(status).toBe(1);
  });
});

/**
 * #2536: Codex は指摘ゼロの時 review object を作らず、代わりに
 * `Reviewed commit: <sha>` 行を含む plain PR comment だけを残す（実測）。
 * review object のみを見ていた #2529 の実装は、このクリーンな pass を
 * 「Codex 未実行」と誤認して merge を止めていた。ここでは comment 側の
 * 証跡パスを固定する。
 */
describe('Codex clean pass コメントによる代替証跡（#2536）', () => {
  const greenRollup = () => [
    checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
    ...requiredChecks(),
  ];

  const protectedFile = 'supabase/migrations/20260901000000_x.sql';
  const CODEX_LOGIN = 'chatgpt-codex-connector';

  function runProtected(options: Parameters<typeof runScript>[1] = {}) {
    return runScript(greenRollup(), { files: [protectedFile], threads: [], ...options });
  }

  function codexCleanPassComment(overrides: { login?: string; sha?: string } = {}) {
    const sha = overrides.sha ?? DEFAULT_HEAD_SHA.slice(0, 10);
    return {
      author: overrides.login ?? CODEX_LOGIN,
      body: `Codex Review\n\nI reviewed the changes and found no issues.\n\n**Reviewed commit:** \`${sha}\``,
    };
  }

  it('指摘ゼロの clean pass コメント（現 HEAD の prefix 一致）だけで通す', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: internalReviewMarkerBody() },
          codexCleanPassComment(),
        ],
        codexReviews: [],
      },
    });
    expect(stderr).toContain('指摘ゼロの clean pass コメント');
    expect(status).toBe(0);
  });

  it('clean pass コメントの sha が旧 HEAD を指していれば停止する', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: internalReviewMarkerBody() },
          codexCleanPassComment({ sha: '1'.repeat(10) }),
        ],
        codexReviews: [],
      },
    });
    expect(stderr).toContain('古い commit を指しています');
    expect(status).toBe(1);
  });

  it('usage limit 応答のような `Reviewed commit` 行の無いコメントは証跡にならない（fail closed）', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: internalReviewMarkerBody() },
          {
            author: CODEX_LOGIN,
            body: 'Codex encountered an error while reviewing this PR: usage limit reached. Please retry later.',
          },
        ],
        codexReviews: [],
      },
    });
    expect(stderr).toContain('`Reviewed commit` 行がありません');
    expect(stderr).toContain('usage limit');
    expect(status).toBe(1);
  });

  it('Codex を名乗らない第三者の同一文面コメントは証跡として数えない（producer の詐称を防ぐ）', () => {
    const { status, stderr } = runProtected({
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: internalReviewMarkerBody() },
          codexCleanPassComment({ login: 't3-nico' }),
        ],
        codexReviews: [],
      },
    });
    expect(stderr).toContain('コメントが 1 件もありません');
    expect(status).toBe(1);
  });

  it('REST 形式の login（[bot] 付き）の clean pass コメントも証跡として認める', () => {
    const { status } = runProtected({
      reviewEvidence: {
        comments: [
          { author: 't3-nico', body: internalReviewMarkerBody() },
          codexCleanPassComment({ login: 'chatgpt-codex-connector[bot]' }),
        ],
        codexReviews: [],
      },
    });
    expect(status).toBe(0);
  });

  it('review object が現 HEAD にあれば clean pass コメントが無くても従来どおり通す（回帰なし）', () => {
    const { status, stderr } = runProtected();
    expect(stderr).toContain('review object: 現 HEAD に対して');
    expect(status).toBe(0);
  });
});

/**
 * #2530: linked issue の `review:full` を PR の cross-review 判定へ継承し、
 * merge 時にも Issue Review 証跡が current であることを確認する。
 *
 * linkage の正本は closing issue references（`Closes #N`）のみ。`Refs #N` や
 * 本文中の URL は GitHub 側で closing reference にならないため継承しない。
 */
describe('linked issue の review:full 継承と Issue Review 証跡（#2530）', () => {
  const greenRollup = () => [
    checkRun('CI', 'SUCCESS', '2026-08-04T10:00:00Z'),
    ...requiredChecks(),
  ];

  const ordinaryFile = 'apps/product/src/features/activities/components/ActivityRow.tsx';

  /** issue-review-gate.mjs が pass する証跡（Codex コメント + 現 fingerprint marker）を作る */
  function passingIssueFixture(issueNumber: number) {
    const issue = { title: 'linked issue', body: '本文', labels: ['review:full'] };
    const codexUrl = `https://github.com/Dayopt/dayopt/issues/${issueNumber}#issuecomment-1`;
    const marker = buildIssueReviewMarkerBody({
      issueNumber,
      fingerprint: computeIssueFingerprintFromIssue(issue),
      reviewedCommentUrl: codexUrl,
      p1Count: 0,
      p2Count: 0,
    });
    return {
      ...issue,
      comments: [
        {
          author: 'chatgpt-codex-connector',
          body: 'レビュー結果です。',
          url: codexUrl,
          createdAt: '2026-09-01T01:00:00Z',
        },
        { author: 't3-nico', body: marker, createdAt: '2026-09-01T02:00:00Z' },
      ],
    };
  }

  it('linked issue に review:full があれば非保護 path でも review gate を必須にする', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [{ number: 77, labels: ['review:full'] }],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain(
      'review gate: required (linked issue review required: Dayopt/dayopt#77)',
    );
    expect(status).toBe(1);
  });

  it('linked issue に review:full が無ければ従来どおり軽量経路', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [{ number: 77, labels: ['type:chore'] }],
      issueFixtures: { 77: { labels: ['type:chore'], comments: [] } },
      reviewEvidence: { comments: [], codexReviews: [] },
    });
    expect(stderr).toContain('linked issue Dayopt/dayopt#77 は Issue Review 対象外です');
    expect(stderr).toContain('review gate: not required');
    expect(status).toBe(0);
  });

  // push 前反証レビュー P2: ラベルを外すだけで軽量経路へ降格できてはいけない。
  // bash 側でラベル事前フィルタをしていた頃はここが素通りしていた。
  it('review:full を外した履歴がある linked issue は降格せず gate 対象のまま', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [{ number: 77, labels: [] }],
      issueFixtures: { 77: { labels: [], removedLabels: ['review:full'], comments: [] } },
      reviewEvidence: { comments: [], codexReviews: [] },
    });
    expect(stderr).toContain('linked issue review required: Dayopt/dayopt#77');
    expect(stderr).toContain('Dayopt/dayopt#77 の Codex Issue Review 証跡が無効です');
    expect(status).toBe(1);
  });

  // push 前反証レビュー P2: 番号だけを渡すと gate 側の既定 repo で同番号の
  // 別 issue を検証し、「確認しました」と誤表示する。
  it('別 repo の linked issue はその repo の issue として検証する', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [{ number: 77, labels: ['review:full'], repo: 'Dayopt/other' }],
      issueFixtures: { 77: passingIssueFixture(77) },
    });
    expect(stderr).toContain('Dayopt/other#77');
    expect(status).toBe(0);
  });

  // 複数 linked issue を回す経路（1 件目だけ検証して終わる回帰を検出する）。
  it('複数 linked issue のうち 1 件でも証跡が無効なら止める', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [
        { number: 77, labels: ['review:full'] },
        { number: 78, labels: ['review:full'] },
      ],
      issueFixtures: {
        77: passingIssueFixture(77),
        78: { labels: ['review:full'], comments: [] },
      },
    });
    expect(stderr).toContain('linked issue Dayopt/dayopt#77 の Issue Review 証跡を確認しました');
    expect(stderr).toContain('Dayopt/dayopt#78 の Codex Issue Review 証跡が無効です');
    expect(status).toBe(1);
  });

  it('複数 linked issue のうち 1 件でも review:full なら必須にする', () => {
    const { stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [
        { number: 76, labels: [] },
        { number: 77, labels: ['review:full'] },
      ],
      reviewEvidence: { comments: [] },
    });
    expect(stderr).toContain('linked issue review required: Dayopt/dayopt#77');
  });

  it('両 PR 証跡 + 有効な Issue Review 証跡が揃えば通す', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [{ number: 77, labels: ['review:full'] }],
      issueFixtures: { 77: passingIssueFixture(77) },
    });
    expect(stderr).toContain('linked issue Dayopt/dayopt#77 の Issue Review 証跡を確認しました');
    expect(status).toBe(0);
  });

  it('Issue Review 証跡が無ければ merge を止める', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [{ number: 77, labels: ['review:full'] }],
      issueFixtures: { 77: { labels: ['review:full'], comments: [] } },
    });
    expect(stderr).toContain('Dayopt/dayopt#77 の Codex Issue Review 証跡が無効です');
    expect(status).toBe(1);
  });

  it('実装中に issue 本文が変わっていれば stale として止める', () => {
    const fixture = passingIssueFixture(77);
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [{ number: 77, labels: ['review:full'] }],
      // marker は旧本文の fingerprint のまま、本文だけ書き換わった状態
      issueFixtures: { 77: { ...fixture, body: '本文（実装中に追記）' } },
    });
    expect(stderr).toContain('Dayopt/dayopt#77 の Codex Issue Review 証跡が無効です');
    expect(status).toBe(1);
  });

  it('closing issue references の取得に失敗したら fail closed で止める', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssuesUnavailable: true,
    });
    expect(stderr).toContain('linked issue（closing issue references）を取得できませんでした');
    expect(status).toBe(1);
  });

  it('linked issue が窓（50 件）を超えていれば止める', () => {
    const { status, stderr } = runScript(greenRollup(), {
      files: [ordinaryFile],
      threads: [],
      linkedIssues: [{ number: 77, labels: [] }],
      linkedIssuesTotalCount: 51,
    });
    expect(stderr).toContain('linked issue が 50 件を超えており');
    expect(status).toBe(1);
  });
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAlertArgs,
  checkSentryNew,
  classifyGhError,
  countDocsCoverageMissing,
  execObservationCommand,
  judgeCountBaseline,
  judgeWorkflowRun,
  readBaseline,
  runNightWatch,
} from './run-all.mjs';

describe('countDocsCoverageMissing', () => {
  it('`## 機能 ⇄ 公開docs` セクション内の `なし`（cell 単位）だけを数える', () => {
    const markdown = `# 公開docs カバレッジ

## 機能 ⇄ 公開docs

| spec | slug | en | ja | LP の約束 |
| --- | --- | --- | --- | --- |
| review | /docs/review | なし | draft（本文あり・公開待ち） | Core Review metrics |
| settings | /docs/data-export | なし | draft（本文あり・公開待ち） | Data export |
| tags | /docs/activities | なし | draft（本文あり・公開待ち） | Activities |

## en / ja が揃っていない

- /docs/review: en=なし / ja=draft（本文あり・公開待ち）
- /docs/data-export: en=なし / ja=draft（本文あり・公開待ち）
- /docs/activities: en=なし / ja=draft（本文あり・公開待ち）
`;
    // テーブル内は 3 件（en 列のみ）。次のセクションにも「なし」を含む文言が
    // あるが、セクション境界（次の `## `）で正しく区切って数えないことを確認する。
    expect(countDocsCoverageMissing(markdown)).toBe(3);
  });

  it('セクション境界の無い出力（見出しが無い）は例外を投げる', () => {
    expect(() => countDocsCoverageMissing('no coverage table here')).toThrow(/## 機能 ⇄ 公開docs/);
  });

  it('最終セクションとして終端まで続く場合も正しく数える（末尾に次見出しが無いケース）', () => {
    const markdown = `## 機能 ⇄ 公開docs

| spec | slug | en | ja |
| --- | --- | --- | --- |
| x | /docs/x | なし | なし |
`;
    expect(countDocsCoverageMissing(markdown)).toBe(2);
  });
});

describe('readBaseline', () => {
  it('.claude/skills/night-watch/baseline.json を読む', () => {
    const baseline = readBaseline();
    expect(baseline).toHaveProperty('docs_coverage_missing');
    expect(baseline).toHaveProperty('dependabot_alert_count');
  });
});

describe('judgeCountBaseline', () => {
  it('actual > baseline のみ red', () => {
    expect(judgeCountBaseline(4, 3)).toBe('red');
  });

  it('actual === baseline は green', () => {
    expect(judgeCountBaseline(3, 3)).toBe('green');
  });

  it('actual < baseline は green-recommend（baseline 更新推奨の対象）', () => {
    expect(judgeCountBaseline(2, 3)).toBe('green-recommend');
  });
});

describe('judgeWorkflowRun', () => {
  const now = new Date('2026-08-25T05:00:00+09:00').getTime();

  it('直近 run が in_progress なら pending を返す', () => {
    const runs = [
      { status: 'in_progress', conclusion: null, createdAt: '2026-08-25T04:50:00Z', url: 'u1' },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'pending' });
  });

  it('直近 run が queued でも pending を返す', () => {
    const runs = [
      { status: 'queued', conclusion: null, createdAt: '2026-08-25T04:50:00Z', url: 'u1' },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'pending' });
  });

  it('直近 run が success かつ 24h 以内なら green', () => {
    const runs = [
      {
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-08-25T03:00:00+09:00',
        url: 'u1',
      },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'green', evidenceUrl: 'u1' });
  });

  // #2367 issue コメント（Codex レビュー指摘、指揮台採用）: heavy-post-merge.yml /
  // integration.yml はそれぞれの workflow 内で全トリガーが同一 concurrency group
  // を共有する（`heavy-post-merge-${github.ref}` / `integration-${github.ref}`、
  // cancel-in-progress: true）ため、in-flight run が追い越されて cancelled に
  // なるのは日常的に発生する。直近 run だけを基準にすることで、「直近は success
  // なのに 2 件前の cancelled で赤」という誤起票を防ぐ。
  // #2382（2026-08-25）で heavy-post-merge の push:main を廃止したが、再 dispatch・
  // integration.yml の paths 該当 push:main・nightly と手動発火の重複という経路が
  // 残るため緩和の必要性は不変（run-all.mjs の判定関数 直上コメント参照）。
  it('直近 run が success なら、過去 run に non-success が含まれていても green', () => {
    const runs = [
      {
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-08-25T03:00:00+09:00',
        url: 'u1',
      },
      {
        status: 'completed',
        conclusion: 'cancelled',
        createdAt: '2026-08-24T03:00:00+09:00',
        url: 'u2',
      },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'green', evidenceUrl: 'u1' });
  });

  it('直近 run が non-success terminal なら red（過去 run に success があっても直近を優先する）', () => {
    const runs = [
      {
        status: 'completed',
        conclusion: 'cancelled',
        createdAt: '2026-08-25T03:00:00+09:00',
        url: 'u1',
      },
      {
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-08-24T20:00:00+09:00',
        url: 'u2',
      },
    ];
    // 直近が non-success terminal でも、直近24h以内にsuccessがあれば
    // hasRecentSuccess で backstop されず red のまま（直近優先の設計）。
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'red', evidenceUrl: 'u1' });
  });

  it('直近 run が non-success terminal で、直近24hにsuccessが無ければ red', () => {
    const runs = [
      {
        status: 'completed',
        conclusion: 'failure',
        createdAt: '2026-08-25T03:00:00+09:00',
        url: 'u1',
      },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'red', evidenceUrl: 'u1' });
  });

  it('直近24hに success run が1件も無ければ red', () => {
    const runs = [
      // 26 時間前（24h 窓の外）の success のみ。
      {
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-08-24T03:00:00+09:00',
        url: 'u1',
      },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'red', evidenceUrl: 'u1' });
  });

  it('timed_out / action_required も red 判定に含める', () => {
    const runs = [
      {
        status: 'completed',
        conclusion: 'timed_out',
        createdAt: '2026-08-25T03:00:00+09:00',
        url: 'u1',
      },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'red', evidenceUrl: 'u1' });
  });

  it('空配列は例外を投げる（fail-closed、gh run list の想定外レスポンスを緑扱いしない）', () => {
    expect(() => judgeWorkflowRun([], { now })).toThrow(/非空配列/);
  });
});

describe('classifyGhError', () => {
  it('JSON.parse の SyntaxError は invalid-response', () => {
    expect(classifyGhError(new SyntaxError('Unexpected token'))).toBe('invalid-response');
  });

  it('401/Bad credentials は auth-error', () => {
    expect(classifyGhError({ stderr: 'HTTP 401: Bad credentials' })).toBe('auth-error');
  });

  it('rate limit は rate-limited（403 と併記されていても rate-limited を優先）', () => {
    expect(classifyGhError({ stderr: 'HTTP 403: API rate limit exceeded for installation' })).toBe(
      'rate-limited',
    );
  });

  it('403（rate limit 以外）は auth-error', () => {
    expect(classifyGhError({ stderr: 'HTTP 403: Resource not accessible by integration' })).toBe(
      'auth-error',
    );
  });

  it('ネットワーク断は network-error', () => {
    expect(classifyGhError({ message: 'connect ECONNREFUSED 140.82.121.6:443' })).toBe(
      'network-error',
    );
  });

  it('分類できないものは unknown', () => {
    expect(classifyGhError({ message: 'something unexpected happened' })).toBe('unknown');
  });

  it('error が null/undefined でも例外を投げず unknown を返す', () => {
    expect(classifyGhError(undefined)).toBe('unknown');
  });
});

describe('execObservationCommand', () => {
  it('成功時は ok:true と stdout を返す', () => {
    const execFileImpl = vi.fn(() => 'output\n');
    const result = execObservationCommand('pnpm', ['docs:check'], { execFileImpl });
    expect(result).toEqual({ ok: true, stdout: 'output\n' });
    expect(execFileImpl).toHaveBeenCalledWith(
      'pnpm',
      ['docs:check'],
      expect.objectContaining({
        encoding: 'utf8',
      }),
    );
  });

  it('失敗時は ok:false と error を返す（例外を投げない）', () => {
    const execFileImpl = vi.fn(() => {
      throw new Error('command failed');
    });
    const result = execObservationCommand('pnpm', ['docs:check'], { execFileImpl });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('env を渡すと process.env の代わりにその env で実行する（token 分離の検証）', () => {
    const execFileImpl: (
      file: string,
      args: string[],
      options?: { encoding?: string; env?: NodeJS.ProcessEnv; cwd?: string },
    ) => string = vi.fn(() => '1\n');
    const scopedEnv = { GH_TOKEN: 'pat-value-only-for-this-call' };
    execObservationCommand('gh', ['api', 'x'], { execFileImpl, env: scopedEnv });
    const passedOptions = vi.mocked(execFileImpl).mock.calls[0]?.[2];
    expect(passedOptions?.env).toBe(scopedEnv);
  });

  // PR #2380 クロスレビュー指摘（P2）: 観測コマンド 1 本の hang が job 全体を
  // kill させ、Step 5（運行記録）を消す。個々のコマンドに上限を設ける。
  it('timeout と killSignal を execFileImpl へ渡す（1本のhangがStep5を消さないための上限）', () => {
    const execFileImpl: (
      file: string,
      args: string[],
      options?: { timeout?: number; killSignal?: string },
    ) => string = vi.fn(() => 'ok\n');
    execObservationCommand('pnpm', ['docs:check'], { execFileImpl });
    const passedOptions = vi.mocked(execFileImpl).mock.calls[0]?.[2];
    expect(passedOptions?.timeout).toBeGreaterThan(0);
    expect(passedOptions?.killSignal).toBe('SIGKILL');
  });
});

// PR #2380 クロスレビュー指摘（当初 P3、対応の過程で自己発見した回帰は
// push 前反証レビュー risk-reviewer 指摘で high に格上げ）: `count` は常に
// 素の数字文字列で `alert-issue.mjs` へ渡す。"100+" のような非数字表示は
// `DIGITS_RE = /^\d+$/`（alert-issue.mjs、無変更の既存 wrapper）が拒否し、
// 24h で新規 unresolved が limit 件以上出た本番障害時（このチェックが
// 最も必要な時）に限って alert issue の起票自体が失敗する回帰になる
// （一度実装して自己発見・revert 済み）。
describe('checkSentryNew / buildAlertArgs（count は常に素の数字）', () => {
  it('issues.length が limit 未満なら count は実数のまま', () => {
    const issues = Array.from({ length: 3 }, (_, i) => ({
      shortId: `DAYOPT-${i}`,
      permalink: `https://sentry.example/${i}`,
    }));
    const execFileImpl = vi.fn(() => JSON.stringify(issues));
    const outcome = checkSentryNew({ execFileImpl, sentryToken: 'x' });
    expect(outcome).toMatchObject({ status: 'red', count: 3 });
    expect(buildAlertArgs('sentry-new', outcome).count).toBe('3');
  });

  it('issues.length が limit（100）に達しても count は素の数字のまま（"100+"にしない）', () => {
    const issues = Array.from({ length: 100 }, (_, i) => ({
      shortId: `DAYOPT-${i}`,
      permalink: `https://sentry.example/${i}`,
    }));
    const execFileImpl = vi.fn(() => JSON.stringify(issues));
    const outcome = checkSentryNew({ execFileImpl, sentryToken: 'x' });
    expect(outcome).toMatchObject({ status: 'red', count: 100 });
    expect(buildAlertArgs('sentry-new', outcome).count).toBe('100');
  });

  it('sentry --limit 引数は SENTRY_QUERY_LIMIT と同じ 100 を渡す', () => {
    const execFileImpl: (file: string, args: string[], options?: object) => string = vi.fn(
      () => '[]',
    );
    checkSentryNew({ execFileImpl, sentryToken: 'x' });
    const args = vi.mocked(execFileImpl).mock.calls[0]?.[1] ?? [];
    expect(args[args.indexOf('--limit') + 1]).toBe('100');
  });

  // risk-reviewer 指摘: buildAlertArgs 単体の assert だけでは
  // 「壊れる相手（alert-issue.mjs の厳密な入力検証）」を実際に呼ばない
  // 同語反復になる。checkSentryNew → buildAlertArgs → 実 buildAlertBody
  // まで通し、100 件到達時でも起票自体が壊れないことを固定する。
  it('100件到達時のoutcomeでも実際のbuildAlertBody（alert-issue.mjs）まで通してthrowしない', async () => {
    const { buildAlertBody } = await import('./alert-issue.mjs');
    const issues = Array.from({ length: 100 }, (_, i) => ({
      shortId: `DAYOPT-${i}`,
      permalink: `https://dayopt.sentry.io/issues/${i}/`,
    }));
    const execFileImpl = vi.fn(() => JSON.stringify(issues));
    const outcome = checkSentryNew({ execFileImpl, sentryToken: 'x' });
    const args = buildAlertArgs('sentry-new', outcome);
    expect(() =>
      buildAlertBody({ checkId: 'sentry-new', args, detectedAt: '2026-08-25T05:00:00+09:00' }),
    ).not.toThrow();
    const body = buildAlertBody({
      checkId: 'sentry-new',
      args,
      detectedAt: '2026-08-25T05:00:00+09:00',
    });
    expect(body).toContain('件数: 100');
  });
});

// runNightWatch は Step 1〜5 を通しで動かす統合テスト。個々の判定境界は上記の
// 純粋関数テストで固定済みのため、ここでは driver の配線（各 wrapper への
// 引き渡し・failed/results/board/dod の組み立て・fail-closed の 3 状態区別）
// を狭く深く確認する。
describe('runNightWatch', () => {
  const FIXED_NOW = new Date('2026-08-25T05:00:00+09:00'); // 火曜（weekend/monday 分岐を避ける）
  const TODAY_BOARD_ISSUE = 9101;

  type Rule = {
    match: (file: string, args: string[]) => boolean;
    respond: (file: string, args: string[]) => string | Error;
  };

  function createExecFileImpl(rules: Rule[]) {
    const calls: { file: string; args: string[] }[] = [];
    const fn = vi.fn((file: string, args: string[]) => {
      calls.push({ file, args });
      for (const rule of rules) {
        if (rule.match(file, args)) {
          const result = rule.respond(file, args);
          if (result instanceof Error) throw result;
          return result;
        }
      }
      throw new Error(`unmocked command: ${file} ${args.join(' ')}`);
    });
    return Object.assign(fn, { calls });
  }

  // トークンは各 args 要素の部分一致で判定する（`--jq length` のような値と
  // `repos/.../dependabot/alerts?state=open` のような複合トークンの両方に
  // 対応するため、完全一致ではなく includes ベースにする）。
  const has = (args: string[], ...tokens: string[]) =>
    tokens.every((t) => args.some((a) => a.includes(t)));

  const GREEN_DOCS_COVERAGE = `# 公開docs カバレッジ

## 機能 ⇄ 公開docs

| spec | slug | en | ja | LP の約束 |
| --- | --- | --- | --- | --- |
| review | /docs/review | なし | draft | Core Review metrics |
| settings | /docs/data-export | なし | draft | Data export |
| tags | /docs/activities | なし | draft | Activities |

## en / ja が揃っていない
`;

  function greenRun(url: string) {
    return JSON.stringify([
      { status: 'completed', conclusion: 'success', createdAt: FIXED_NOW.toISOString(), url },
    ]);
  }

  function baseRules(): Rule[] {
    return [
      {
        // Step1 runBoardSync: 当日盤面 issue が既に存在（skip 経路、issue create を踏まない）
        match: (file, args) =>
          file === 'gh' && has(args, 'issue', 'list', 'type:board', 'number,title,body'),
        respond: () =>
          JSON.stringify([{ number: TODAY_BOARD_ISSUE, title: '盤面 2026-08-25', body: '' }]),
      },
      {
        // Step4 findTodayBoardIssue（--json は number,title のみ、Step1 とは別呼び出し）
        match: (file, args) =>
          file === 'gh' &&
          has(args, 'issue', 'list', 'type:board') &&
          args[args.indexOf('--json') + 1] === 'number,title',
        respond: () => JSON.stringify([{ number: TODAY_BOARD_ISSUE, title: '盤面 2026-08-25' }]),
      },
      {
        match: (file, args) => file === 'gh' && has(args, 'pr', 'list', '--search'),
        respond: () => JSON.stringify([]), // 前日merge PR無し
      },
      // Step 6（朝編成ブリーフ、#2370）が呼ぶ観測系 gh コマンド。
      // Codex レビュー指摘（指揮台採用、PR #2380）: これらが未 mock だと
      // `runMorningBrief` が `unmocked command` を投げ、非致命 catch に
      // 握られたまま test が green になる（Step 6 について何も検証しない
      // 見せかけの green）。
      {
        // hasExistingMorningBrief（冪等ガード）: 既存ブリーフ無し
        match: (file, args) => file === 'gh' && args[0] === 'issue' && args[1] === 'view',
        respond: () => JSON.stringify({ comments: [] }),
      },
      {
        match: (file, args) => file === 'gh' && has(args, 'issue', 'list', 'status:ready'),
        respond: () => JSON.stringify([]),
      },
      {
        match: (file, args) => file === 'gh' && has(args, 'issue', 'list', 'status:in-progress'),
        respond: () => JSON.stringify([]),
      },
      {
        // fetchOpenPrs（Step 6）。前日merge PR検索（--search 付き）とは別物。
        match: (file, args) =>
          file === 'gh' && args[0] === 'pr' && args[1] === 'list' && !has(args, '--search'),
        respond: () => JSON.stringify([]),
      },
      {
        match: (file, args) => file === 'gh' && has(args, 'api', 'milestones'),
        respond: () => JSON.stringify([]),
      },
      {
        match: (file, args) => file === 'gh' && args[0] === 'issue' && args[1] === 'comment',
        respond: () => '', // dod-candidate / run-log / Step6 の comment 投稿（body は都度確認しない）
      },
      {
        match: (file, args) => file === 'pnpm' && args[0] === 'docs:check',
        respond: () => '',
      },
      {
        match: (file, args) => file === 'pnpm' && args[0] === 'docs:coverage',
        respond: () => GREEN_DOCS_COVERAGE,
      },
      {
        match: (file, args) => file === 'pnpm' && args[0] === 'quality:deadcode:ci',
        respond: () => '',
      },
      {
        match: (file, args) => file === 'gh' && has(args, 'api', 'dependabot/alerts'),
        respond: () => `${readBaseline().dependabot_alert_count}\n`,
      },
      {
        match: (file, args) =>
          file === 'gh' && has(args, 'run', 'list', '--workflow=heavy-post-merge.yml'),
        respond: () => greenRun('https://github.com/Dayopt/dayopt/actions/runs/1'),
      },
      {
        match: (file, args) =>
          file === 'gh' && has(args, 'run', 'list', '--workflow=integration.yml', '--branch'),
        respond: () => greenRun('https://github.com/Dayopt/dayopt/actions/runs/2'),
      },
      {
        match: (file) => file === 'sentry',
        respond: () => '[]',
      },
    ];
  }

  let runStatePath: string;
  let tmpDir: string;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    tmpDir = mkdtempSync(join(tmpdir(), 'night-watch-run-all-test-'));
    runStatePath = join(tmpDir, 'alert-run-state.json');
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('全チェック green の晩は issue を新規起票せず、運行記録に all green を報告する', () => {
    const execFileImpl = createExecFileImpl(baseRules());
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath });

    const opsLogCall = execFileImpl.calls.find(
      (c) =>
        c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'comment' && c.args[2] === '2216',
    );
    expect(opsLogCall).toBeDefined();
    const body = opsLogCall?.args[opsLogCall.args.indexOf('--body') + 1] ?? '';
    expect(body).toContain('all green');
    expect(body).toContain('起票予算 state: 有効（新規起票 0/3');

    // 赤の check が無いため gh issue create は一度も呼ばれない。
    const createCalls = execFileImpl.calls.filter(
      (c) => c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'create',
    );
    expect(createCalls).toHaveLength(0);
    expect(process.exitCode).not.toBe(1);

    // Step 6（朝編成ブリーフ）が当日盤面 issue（TODAY_BOARD_ISSUE）へ実際に
    // 投稿されたことまで確認する（Codex レビュー指摘・指揮台採用、PR
    // #2380。unmocked command → 非致命 catch に握られて「何も検証しない
    // green」になっていた穴を塞ぐ）。
    const briefCall = execFileImpl.calls.find(
      (c) =>
        c.file === 'gh' &&
        c.args[0] === 'issue' &&
        c.args[1] === 'comment' &&
        c.args[2] === String(TODAY_BOARD_ISSUE) &&
        (c.args[c.args.indexOf('--body') + 1] ?? '').includes('## 朝編成ブリーフ'),
    );
    expect(briefCall).toBeDefined();

    process.exitCode = 0;
  });

  it('docs-check が red の晩は nightwatch(docs-check) issue を新規起票し、運行記録へ反映する', () => {
    const rules = [
      {
        match: (file: string, args: string[]) => file === 'pnpm' && args[0] === 'docs:check',
        respond: () => {
          const error = new Error('command failed') as Error & { status: number };
          error.status = 1;
          return error;
        },
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' &&
          args[0] === 'issue' &&
          args[1] === 'list' &&
          has(args, 'nightwatch(docs-check)'),
        respond: () => JSON.stringify([]), // 既存 alert issue 無し → 新規起票
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'issue' && args[1] === 'create',
        respond: () => 'https://github.com/Dayopt/dayopt/issues/12345',
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath });

    const createCall = execFileImpl.calls.find(
      (c) => c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'create',
    );
    expect(createCall).toBeDefined();
    const title = createCall?.args[createCall.args.indexOf('--title') + 1];
    expect(title).toBe('nightwatch(docs-check): pnpm docs:check が exit 0 以外');

    const opsLogCall = execFileImpl.calls.find(
      (c) =>
        c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'comment' && c.args[2] === '2216',
    );
    const body = opsLogCall?.args[opsLogCall.args.indexOf('--body') + 1] ?? '';
    expect(body).toContain('起票/追記: #12345（docs-check）');
    process.exitCode = 0;
  });

  // Codex レビュー指摘（指揮台採用、PR #2380）: 赤を検出したのに alert
  // issue の起票自体が失敗した場合、従来は failed[] に積まれるだけで
  // process.exitCode は step5Failed/dod4Failed でしか立たず、Step 5 が
  // 無事なら job は緑のまま終わっていた。夜勤の主目的（赤の可視化）が
  // 壊れても検出できない設計だったのを、alert 投稿失敗を専用に追跡して
  // 非 0 exit へ倒す。
  it('赤を検出したのにalert issueの起票自体が失敗すると非0 exitになる（Step5の記録は妨げない）', () => {
    const rules = [
      {
        match: (file: string, args: string[]) => file === 'pnpm' && args[0] === 'docs:check',
        respond: () => {
          const error = new Error('command failed') as Error & { status: number };
          error.status = 1;
          return error;
        },
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' &&
          args[0] === 'issue' &&
          args[1] === 'list' &&
          has(args, 'nightwatch(docs-check)'),
        respond: () => JSON.stringify([]), // 既存 alert issue 無し → 新規起票を試みる
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'issue' && args[1] === 'create',
        respond: () => new Error('HTTP 500: Internal Server Error'), // alert issue 起票自体が失敗
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath });

    // job は赤（alert 投稿失敗を検出可能にする）。
    expect(process.exitCode).toBe(1);

    // Step 5（運行記録）自体は実行を妨げられず、失敗した check-id は
    // 「取得失敗」として運行記録へ残る（exitCode を先に立てて Step 5 の
    // 実行を止めていないことの確認）。
    const opsLogCall = execFileImpl.calls.find(
      (c) =>
        c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'comment' && c.args[2] === '2216',
    );
    expect(opsLogCall).toBeDefined();
    const body = opsLogCall?.args[opsLogCall.args.indexOf('--body') + 1] ?? '';
    expect(body).toContain('docs-check');

    process.exitCode = 0;
  });

  it('Step 5（運行記録投稿）が失敗すると非 0 exit になる', () => {
    const rules = [
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'issue' && args[1] === 'comment' && args[2] === '2216',
        respond: () => new Error('HTTP 500: Internal Server Error'),
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath });
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});

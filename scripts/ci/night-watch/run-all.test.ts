import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAlertArgs,
  checkSentryNew,
  checkWorkflowJobRun,
  classifyGhError,
  countDocsCoverageMissing,
  execObservationCommand,
  judgeCountBaseline,
  judgeWorkflowRun,
  NIGHTLY_HEAVY_JOB_NAMES,
  NIGHTLY_INTEGRATION_JOB_NAME,
  readBaseline,
  runNightWatch,
  worseConclusion,
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

  // #2525: pending の扱いは「直近 48h に success があるか」で分岐する。
  // 単発の cron 遅延（前夜は成功している）は判定保留のまま無音、48h 何も
  // 完了していない stuck は red。旧設計はこの分岐を常設運行記録 issue の
  // コメント列（`checkRecentPending`）に持たせていた。
  it('直近 run が in_progress でも、48h 以内に success があれば pending を返す', () => {
    const runs = [
      { status: 'in_progress', conclusion: null, createdAt: '2026-08-25T04:50:00Z', url: 'u1' },
      {
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-08-24T18:00:00Z',
        url: 'u2',
      },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'pending' });
  });

  it('直近 run が queued でも、48h 以内に success があれば pending を返す', () => {
    const runs = [
      { status: 'queued', conclusion: null, createdAt: '2026-08-25T04:50:00Z', url: 'u1' },
      {
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-08-24T18:00:00Z',
        url: 'u2',
      },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({ status: 'pending' });
  });

  it('pending のまま 48h 以内に success が 1 件も無ければ red（stale-pending）', () => {
    const runs = [
      { status: 'queued', conclusion: null, createdAt: '2026-08-25T04:50:00Z', url: 'u1' },
      { status: 'queued', conclusion: null, createdAt: '2026-08-24T18:00:00Z', url: 'u2' },
      {
        status: 'completed',
        conclusion: 'success',
        createdAt: '2026-08-21T18:00:00Z', // 48h より前
        url: 'u3',
      },
    ];
    expect(judgeWorkflowRun(runs, { now })).toEqual({
      status: 'red',
      evidenceUrl: 'u1',
      reason: 'stale-pending',
    });
  });

  // 24h 窓（terminal 判定側）と 48h 窓（stale 判定側）が別物であることの固定。
  // pending は 24h〜48h の success を許容し、terminal は許容しない。
  it('34h 前の success は pending を許容するが、terminal 判定では red のまま', () => {
    // now は 2026-08-24T20:00:00Z（= 2026-08-25T05:00+09:00）。
    const success30hAgo = {
      status: 'completed',
      conclusion: 'success',
      createdAt: '2026-08-23T10:00:00Z', // 34h 前 = 24h 窓の外、48h 窓の内
      url: 'u2',
    };
    expect(
      judgeWorkflowRun(
        [
          { status: 'queued', conclusion: null, createdAt: '2026-08-25T04:50:00Z', url: 'u1' },
          success30hAgo,
        ],
        { now },
      ),
    ).toEqual({ status: 'pending' });

    expect(judgeWorkflowRun([success30hAgo], { now })).toEqual({
      status: 'red',
      evidenceUrl: 'u2',
    });
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

describe('worseConclusion', () => {
  it('重大度順で悪い方を返す', () => {
    expect(worseConclusion('success', 'failure')).toBe('failure');
    expect(worseConclusion('failure', 'success')).toBe('failure');
    expect(worseConclusion('cancelled', 'success')).toBe('cancelled');
    expect(worseConclusion('failure', 'cancelled')).toBe('failure');
  });

  it('両方 success なら success', () => {
    expect(worseConclusion('success', 'success')).toBe('success');
  });

  it('未知の値は無条件で悪い方扱い（fail closed）', () => {
    expect(worseConclusion('success', 'mystery')).toBe('mystery');
    expect(worseConclusion('mystery', 'success')).toBe('mystery');
  });
});

// #2483: heavy-red / integration-red が workflow ファイル名（gh run list
// --workflow=）ではなく job 名で判定するようになった契約を固定する。
// nightly.yml は複数 cron が同じ workflow を共有するため、単純な直近 N 件では
// 対象 job が実行された run を取りこぼす——この境界を明示的にテストする。
describe('checkWorkflowJobRun（job-scoped 判定、#2483）', () => {
  const NOW = new Date('2026-08-25T05:00:00+09:00').getTime();

  function jobsResponseFor(runId: number, jobs: Record<string, unknown>[]) {
    return {
      match: (file: string, args: string[]) =>
        file === 'gh' && args.includes(`repos/Dayopt/dayopt/actions/runs/${runId}/jobs`),
      respond: () => JSON.stringify(jobs),
    };
  }

  function runListResponse(runs: { databaseId: number; createdAt: string; url: string }[]) {
    return {
      match: (file: string, args: string[]) =>
        file === 'gh' && args[0] === 'run' && args[1] === 'list' && args.includes('--branch'),
      respond: () => JSON.stringify(runs),
    };
  }

  function makeExecFileImpl(
    rules: { match: (f: string, a: string[]) => boolean; respond: () => string }[],
  ) {
    return (file: string, args: string[]) => {
      for (const rule of rules) {
        if (rule.match(file, args)) return rule.respond();
      }
      throw new Error(`unmocked: ${file} ${args.join(' ')}`);
    };
  }

  it('workflow ファイル名ではなく `--workflow=nightly.yml` を使う（旧ファイル名には依存しない）', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([{ databaseId: 1, createdAt: '2026-08-25T03:00:00+09:00', url: 'u1' }]),
        jobsResponseFor(1, [
          { name: NIGHTLY_INTEGRATION_JOB_NAME, status: 'completed', conclusion: 'success' },
        ]),
      ]),
    );
    checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    const listCall = execFileImpl.mock.calls.find((c) => c[1][0] === 'run' && c[1][1] === 'list');
    expect(listCall?.[1]).toEqual(
      expect.arrayContaining(['--workflow=nightly.yml', '--branch', 'main']),
    );
  });

  it('skipped の job は無視し、実際に実行された run だけを対象にする', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([
          { databaseId: 1, createdAt: '2026-08-25T04:30:00+09:00', url: 'u-sweep' }, // 別 cron（status-label-sweep）
          { databaseId: 2, createdAt: '2026-08-25T03:30:00+09:00', url: 'u-integration' },
        ]),
        jobsResponseFor(1, [
          { name: NIGHTLY_INTEGRATION_JOB_NAME, status: 'completed', conclusion: 'skipped' },
        ]),
        jobsResponseFor(2, [
          { name: NIGHTLY_INTEGRATION_JOB_NAME, status: 'completed', conclusion: 'success' },
        ]),
      ]),
    );
    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    expect(outcome).toEqual({ status: 'green' });
  });

  it('heavy-red は E2E / Web の 2 job を worst-of で 1 run 分の結論へ畳む', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([{ databaseId: 1, createdAt: '2026-08-25T03:00:00+09:00', url: 'u1' }]),
        jobsResponseFor(1, [
          {
            name: NIGHTLY_HEAVY_JOB_NAMES[0],
            status: 'completed',
            conclusion: 'success',
            html_url: 'job1',
          },
          {
            name: NIGHTLY_HEAVY_JOB_NAMES[1],
            status: 'completed',
            conclusion: 'failure',
            html_url: 'job2',
          },
        ]),
      ]),
    );
    const outcome = checkWorkflowJobRun(NIGHTLY_HEAVY_JOB_NAMES, { execFileImpl, now: NOW });
    expect(outcome.status).toBe('red');
    expect(outcome.evidenceUrl).toBe('job2'); // failure した job の url
  });

  it('databaseId が整数でない run は jobs API を呼ばずスキップする（push前反証レビュー risk-reviewer 指摘）', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([
          // @ts-expect-error -- 意図的に不正な databaseId（gh run list の想定外レスポンス）を注入する
          { databaseId: '1; rm -rf /', createdAt: '2026-08-25T03:00:00+09:00', url: 'u-bad' },
          { databaseId: 2, createdAt: '2026-08-25T03:30:00+09:00', url: 'u-good' },
        ]),
        jobsResponseFor(2, [
          { name: NIGHTLY_INTEGRATION_JOB_NAME, status: 'completed', conclusion: 'success' },
        ]),
      ]),
    );
    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    expect(outcome).toEqual({ status: 'green' });
    // 不正な databaseId に対して gh api が一切呼ばれていないことを確認する
    const apiCalls = execFileImpl.mock.calls.filter((c) => c[1][0] === 'api');
    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0][1]).toContain('repos/Dayopt/dayopt/actions/runs/2/jobs');
  });

  it('対象 job が run 一覧内に 1 件も見つからなければ fetch-failed', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([{ databaseId: 1, createdAt: '2026-08-25T03:00:00+09:00', url: 'u1' }]),
        jobsResponseFor(1, [{ name: '別の job', status: 'completed', conclusion: 'success' }]),
      ]),
    );
    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    expect(outcome).toEqual({ status: 'fetch-failed' });
  });

  it('run-list 自体の取得失敗は fetch-failed', () => {
    const execFileImpl = vi.fn(() => {
      throw new Error('rate limited');
    });
    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    expect(outcome).toEqual({ status: 'fetch-failed' });
  });

  it('1 run 分の jobs 取得失敗は無視して次の run へ読み進める（全体を諦めない）', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([
          { databaseId: 1, createdAt: '2026-08-25T03:30:00+09:00', url: 'u1' },
          { databaseId: 2, createdAt: '2026-08-25T03:30:00+09:00', url: 'u2' },
        ]),
        // databaseId 1 の jobs 取得は未 mock（unmocked → throw）、2 は成功
        jobsResponseFor(2, [
          { name: NIGHTLY_INTEGRATION_JOB_NAME, status: 'completed', conclusion: 'success' },
        ]),
      ]),
    );
    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    expect(outcome).toEqual({ status: 'green' });
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
  const FIXED_NOW = new Date('2026-08-25T05:00:00+09:00');

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

  // #2483: heavy-red / integration-red は nightly.yml 内の job 名で判定する
  // 多段処理（`gh run list --workflow=nightly.yml` → run ごとに
  // `gh api .../actions/runs/{id}/jobs`）になった。両 check が同じ run-list
  // 呼び出しを共有するため、この 2 rule を baseRules() へまとめて足す。
  const NIGHTLY_RUN_ID = 401;

  function nightlyRunListAndJobsRules(
    jobs: { name: string; status: string; conclusion: string; url: string }[],
  ): Rule[] {
    return [
      {
        match: (file, args) =>
          file === 'gh' && has(args, 'run', 'list', '--workflow=nightly.yml', '--branch'),
        respond: () =>
          JSON.stringify([
            { databaseId: NIGHTLY_RUN_ID, createdAt: FIXED_NOW.toISOString(), url: 'https://x/1' },
          ]),
      },
      {
        match: (file, args) =>
          file === 'gh' && has(args, 'api', `actions/runs/${NIGHTLY_RUN_ID}/jobs`),
        respond: () =>
          JSON.stringify(
            jobs.map((j) => ({
              name: j.name,
              status: j.status,
              conclusion: j.conclusion,
              started_at: FIXED_NOW.toISOString(),
              html_url: j.url,
            })),
          ),
      },
    ];
  }

  function greenNightlyJobs(): Rule[] {
    return nightlyRunListAndJobsRules([
      {
        name: '\u{1F3AD} E2E Tests',
        status: 'completed',
        conclusion: 'success',
        url: 'https://x/1/job/1',
      },
      {
        name: '\u{1F310} Web Build & E2E',
        status: 'completed',
        conclusion: 'success',
        url: 'https://x/1/job/2',
      },
      {
        name: 'Integration Tests',
        status: 'completed',
        conclusion: 'success',
        url: 'https://x/1/job/3',
      },
    ]);
  }

  // #2525: 盤面起票（Step1）/ DoD 候補（Step4）/ 運行記録（Step5）/ 朝ブリーフ
  // （Step6）の廃止で、baseRules が mock すべき gh 呼び出しは「7 check の観測」
  // と「alert-issue.mjs の dedup 検索」だけになった。type:board の issue list、
  // pr list、issue view、milestones API はどれも呼ばれない — **もし呼ばれたら
  // `unmocked command` で落ちる**ので、廃止した層が復活していないことを
  // この test 群全体が受動的に検証していることになる。
  function baseRules(): Rule[] {
    return [
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
      ...greenNightlyJobs(),
      {
        match: (file) => file === 'sentry',
        respond: () => '[]',
      },
    ];
  }

  let runStatePath: string;
  let tmpDir: string;
  let loggedLines: string[];
  // retry の待ちを実時間で消費しない（`sleepSync` は Atomics.wait なので
  // fake timers では縮まらない）。呼ばれた回数は retry 挙動の検証にも使う。
  let sleepImpl: ReturnType<typeof vi.fn<(ms: number) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    tmpDir = mkdtempSync(join(tmpdir(), 'night-watch-run-all-test-'));
    runStatePath = join(tmpDir, 'alert-run-state.json');
    loggedLines = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      loggedLines.push(String(args[0]));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    sleepImpl = vi.fn<(ms: number) => void>();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** console.log へ出た run サマリ行（#2525 で運行記録コメントを置き換えたもの）。 */
  const summaryLine = () => loggedLines.find((line) => line.startsWith('night-watch: '));

  it('全チェック green の晩は issue を 1 件も作らず、job log に all green のサマリを出す', () => {
    const execFileImpl = createExecFileImpl(baseRules());
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    // 緑の夜は無音（#2525 の中心的な契約）: issue の create も comment も
    // 一切呼ばない。
    const writeCalls = execFileImpl.calls.filter(
      (c) => c.file === 'gh' && c.args[0] === 'issue' && ['create', 'comment'].includes(c.args[1]),
    );
    expect(writeCalls).toHaveLength(0);

    expect(summaryLine()).toBe(
      'night-watch: all green | 観測 7/7 | 起票 0 | 保留 0 | 見送り 0 | 取得失敗 0',
    );
    expect(process.exitCode).not.toBe(1);
    process.exitCode = 0;
  });

  it('docs-check が red の晩は nightwatch(docs-check) issue を新規起票し、サマリへ反映する', () => {
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
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    const createCall = execFileImpl.calls.find(
      (c) => c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'create',
    );
    expect(createCall).toBeDefined();
    const title = createCall?.args[createCall.args.indexOf('--title') + 1];
    expect(title).toBe('nightwatch(docs-check): pnpm docs:check が exit 0 以外');

    expect(summaryLine()).toBe(
      'night-watch: 要確認 | 観測 7/7 | 起票 1 | 保留 0 | 見送り 0 | 取得失敗 0',
    );
    process.exitCode = 0;
  });

  // 非 0 exit（本物の赤）は retry しない（#2525）。retry すると
  // `pnpm docs:check` のような重いコマンドを毎晩 3 回走らせるだけになる。
  it('非 0 exit の観測コマンドは retry せず 1 回で確定する', () => {
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
          file === 'gh' && args[0] === 'issue' && args[1] === 'list' && has(args, 'nightwatch'),
        respond: () => JSON.stringify([]),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'issue' && args[1] === 'create',
        respond: () => 'https://github.com/Dayopt/dayopt/issues/12346',
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    const docsCheckCalls = execFileImpl.calls.filter(
      (c) => c.file === 'pnpm' && c.args[0] === 'docs:check',
    );
    expect(docsCheckCalls).toHaveLength(1);
    expect(sleepImpl).not.toHaveBeenCalled();
    process.exitCode = 0;
  });

  // Codex レビュー指摘（指揮台採用、PR #2380）: 赤を検出したのに alert
  // issue の起票自体が失敗した場合、job が緑のまま終わると夜勤の主目的
  // （赤の可視化）が壊れても検出できない。
  it('赤を検出したのにalert issueの起票自体が失敗すると非0 exitになる（サマリ出力は妨げない）', () => {
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
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    // job は赤（alert 投稿失敗を検出可能にする）。
    expect(process.exitCode).toBe(1);

    // exitCode を先に立ててサマリ出力を止めていないこと（#2525。運行記録
    // コメントの「Step 5 の記録は妨げない」と同じ理由が job log でも効く）。
    expect(summaryLine()).toContain('要確認');
    process.exitCode = 0;
  });

  // #2422 → #2525: 観測コマンド自体の取得失敗（fetch-failed）は、run 内 retry で
  // 回復しなければその夜のうちに起票する（旧「3 晩連続」条件は、判定に使っていた
  // 常設運行記録 issue のコメントごと廃止した）。
  it('取得失敗が retry でも回復しなければ、その夜に nightwatch-fetch-failed issue を起票する', () => {
    const rules = [
      {
        // 観測コマンド自体を失敗させる（fetch-failed 経路。実際の 403 と同型）
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'api' && (args[1] ?? '').includes('dependabot/alerts'),
        respond: () =>
          new Error('HTTP 403: Resource not accessible by personal access token (fine-grained)'),
      },
      {
        // fetch-failure の dedup 検索（既存 issue 無し → 新規作成）
        match: (file: string, args: string[]) =>
          file === 'gh' &&
          args[0] === 'issue' &&
          args[1] === 'list' &&
          has(args, 'nightwatch-fetch-failed(dependabot-alerts)'),
        respond: () => JSON.stringify([]),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' &&
          args[0] === 'issue' &&
          args[1] === 'create' &&
          has(args, 'nightwatch-fetch-failed(dependabot-alerts)'),
        respond: () => 'https://github.com/Dayopt/dayopt/issues/850\n',
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    // 起票の前に run 内 retry を尽くしている（合計 3 回試行）。
    const alertsCalls = execFileImpl.calls.filter(
      (c) => c.file === 'gh' && c.args[0] === 'api' && (c.args[1] ?? '').includes('dependabot'),
    );
    expect(alertsCalls).toHaveLength(3);
    expect(sleepImpl).toHaveBeenCalledTimes(2);

    const createCall = execFileImpl.calls.find(
      (c) =>
        c.file === 'gh' &&
        c.args[0] === 'issue' &&
        c.args[1] === 'create' &&
        has(c.args, 'nightwatch-fetch-failed(dependabot-alerts)'),
    );
    expect(createCall).toBeDefined();
    const title = createCall?.args[createCall.args.indexOf('--title') + 1];
    expect(title).toBe('nightwatch-fetch-failed(dependabot-alerts): 観測コマンドが取得失敗');

    expect(summaryLine()).toBe(
      'night-watch: 要確認 | 観測 6/7 | 起票 1 | 保留 0 | 見送り 0 | 取得失敗 1',
    );
    process.exitCode = 0;
  });

  it('retry の途中で回復した観測は fetch-failed にせず green として扱う', () => {
    let attempts = 0;
    const rules = [
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'api' && (args[1] ?? '').includes('dependabot/alerts'),
        respond: () => {
          attempts += 1;
          if (attempts === 1) return new Error('getaddrinfo ENOTFOUND api.github.com');
          return `${readBaseline().dependabot_alert_count}\n`;
        },
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    expect(attempts).toBe(2);
    const createCalls = execFileImpl.calls.filter(
      (c) => c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'create',
    );
    expect(createCalls).toHaveLength(0);
    expect(summaryLine()).toBe(
      'night-watch: all green | 観測 7/7 | 起票 0 | 保留 0 | 見送り 0 | 取得失敗 0',
    );
    process.exitCode = 0;
  });

  // #2525: pending の連晩判定（常設運行記録 issue のコメント列を数える
  // `checkRecentPending`）を廃止した代わりの stale 判定が、runNightWatch まで
  // 通しで効くことを固定する。単発の pending は無音、48h 以内に success が
  // 無ければ赤。
  it('直近 run が pending でも 48h 以内に success があれば起票しない（判定保留）', () => {
    const rules = [
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && has(args, 'api', `actions/runs/${NIGHTLY_RUN_ID}/jobs`),
        respond: () =>
          JSON.stringify([
            {
              name: '\u{1F3AD} E2E Tests',
              status: 'in_progress',
              conclusion: null,
              started_at: FIXED_NOW.toISOString(),
              html_url: 'https://github.com/Dayopt/dayopt/actions/runs/99/job/1',
            },
            {
              name: '\u{1F310} Web Build & E2E',
              status: 'completed',
              conclusion: 'success',
              started_at: FIXED_NOW.toISOString(),
              html_url: 'https://github.com/Dayopt/dayopt/actions/runs/99/job/2',
            },
            {
              name: 'Integration Tests',
              status: 'completed',
              conclusion: 'success',
              started_at: FIXED_NOW.toISOString(),
              html_url: 'https://github.com/Dayopt/dayopt/actions/runs/99/job/3',
            },
          ]),
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    const createCalls = execFileImpl.calls.filter(
      (c) => c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'create',
    );
    expect(createCalls).toHaveLength(0);
    expect(summaryLine()).toContain('保留 1');
    process.exitCode = 0;
  });

  it('pending のまま 48h 以内に success が無ければ stale として起票する', () => {
    const staleStartedAt = new Date(FIXED_NOW.getTime() - 72 * 60 * 60 * 1000).toISOString();
    const rules = [
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && has(args, 'run', 'list', '--workflow=nightly.yml', '--branch'),
        respond: () =>
          JSON.stringify([
            { databaseId: NIGHTLY_RUN_ID, createdAt: staleStartedAt, url: 'https://x/1' },
          ]),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && has(args, 'api', `actions/runs/${NIGHTLY_RUN_ID}/jobs`),
        respond: () =>
          JSON.stringify([
            {
              name: '\u{1F3AD} E2E Tests',
              status: 'queued',
              conclusion: null,
              started_at: staleStartedAt,
              html_url: 'https://github.com/Dayopt/dayopt/actions/runs/99/job/1',
            },
            {
              name: '\u{1F310} Web Build & E2E',
              status: 'queued',
              conclusion: null,
              started_at: staleStartedAt,
              html_url: 'https://github.com/Dayopt/dayopt/actions/runs/99/job/2',
            },
            {
              name: 'Integration Tests',
              status: 'queued',
              conclusion: null,
              started_at: staleStartedAt,
              html_url: 'https://github.com/Dayopt/dayopt/actions/runs/99/job/3',
            },
          ]),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'issue' && args[1] === 'list' && has(args, 'nightwatch'),
        respond: () => JSON.stringify([]),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'issue' && args[1] === 'create',
        respond: () => 'https://github.com/Dayopt/dayopt/issues/870\n',
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    // heavy-red / integration-red の両方が stale red になる。
    const createTitles = execFileImpl.calls
      .filter((c) => c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'create')
      .map((c) => c.args[c.args.indexOf('--title') + 1]);
    expect(createTitles).toContain('nightwatch(heavy-red): heavy（E2E / Web）が直近 run で red');
    expect(createTitles).toContain('nightwatch(integration-red): integration が直近 run で red');
    expect(summaryLine()).toContain('保留 0');
    process.exitCode = 0;
  });

  // push前反証レビュー指摘（P2、PR #2445）: fetch-failure の新規起票が
  // run-scoped 起票上限（MAX_NEW_ISSUES_PER_RUN=3）を red-alert と食い合う。
  // CHECK_IDS の並び順（docs-check/deadcode/dependabot-alerts が heavy-red より
  // 先）のまま逐次処理すると、慢性 fetch-failed が先に予算を使い切り本物の
  // CI 赤が起票されなくなる。#2525 で fetch-failed が当夜起票になったぶん、
  // この順序（deferredFetchFailed）の重要性はむしろ上がっている。
  it('複数checkがfetch-failedでも、heavy-redの赤alertはcapされずに起票される（予算はredを優先）', () => {
    const rules = [
      {
        // docs-check / deadcode を spawn failure（fetch-failed）にする
        // （isSpawnFailure は error.status が数値でないことで判定するため、
        // 素の Error を投げるだけでよい）。
        match: (file: string, args: string[]) => file === 'pnpm' && args[0] === 'docs:check',
        respond: () => new Error('spawn ENOENT'),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'pnpm' && args[0] === 'quality:deadcode:ci',
        respond: () => new Error('spawn ENOENT'),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'api' && (args[1] ?? '').includes('dependabot/alerts'),
        respond: () => new Error('HTTP 403: Resource not accessible'),
      },
      {
        // heavy job（E2E）だけを failure にし、web / integration は success の
        // ままにする——heavy-red だけが赤になり integration-red は green のまま
        // という元テストの意図（下の assertion で create 件数を厳密に数える）を
        // job-scoped 判定でも再現する。
        match: (file: string, args: string[]) =>
          file === 'gh' && has(args, 'api', `actions/runs/${NIGHTLY_RUN_ID}/jobs`),
        respond: () =>
          JSON.stringify([
            {
              name: '\u{1F3AD} E2E Tests',
              status: 'completed',
              conclusion: 'failure',
              started_at: FIXED_NOW.toISOString(),
              html_url: 'https://github.com/Dayopt/dayopt/actions/runs/99/job/1',
            },
            {
              name: '\u{1F310} Web Build & E2E',
              status: 'completed',
              conclusion: 'success',
              started_at: FIXED_NOW.toISOString(),
              html_url: 'https://github.com/Dayopt/dayopt/actions/runs/99/job/2',
            },
            {
              name: 'Integration Tests',
              status: 'completed',
              conclusion: 'success',
              started_at: FIXED_NOW.toISOString(),
              html_url: 'https://github.com/Dayopt/dayopt/actions/runs/99/job/3',
            },
          ]),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'issue' && args[1] === 'list' && has(args, 'nightwatch'),
        respond: () => '[]',
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'issue' && args[1] === 'create' && has(args, 'nightwatch'),
        respond: () => 'https://github.com/Dayopt/dayopt/issues/900\n',
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    const createCalls = execFileImpl.calls.filter(
      (c) => c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'create',
    );
    // 予算(3)を使い切る: heavy-red 1件 + fetch-failed 2件（3件中1件はcap）
    expect(createCalls.length).toBe(3);

    const heavyRedCreate = createCalls.find((c) => has(c.args, 'nightwatch(heavy-red)'));
    expect(heavyRedCreate).toBeDefined(); // 赤は必ず起票される（capされない）

    const fetchFailedCreates = createCalls.filter((c) => has(c.args, 'nightwatch-fetch-failed'));
    expect(fetchFailedCreates.length).toBe(2); // 3件中1件は予算超過でcapされる

    expect(summaryLine()).toBe(
      'night-watch: 要確認 | 観測 4/7 | 起票 3 | 保留 0 | 見送り 1 | 取得失敗 3',
    );
    process.exitCode = 0;
  });
});

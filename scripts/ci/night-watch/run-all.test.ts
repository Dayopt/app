import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildAlertArgs,
  checkSecretExpiry,
  checkSentryNew,
  checkWorkflowJobRun,
  classifyGhError,
  countDocsCoverageMissing,
  execObservationCommand,
  foldJobConclusions,
  judgeCountBaseline,
  judgeWorkflowRun,
  NIGHT_WATCH_JOB_TIMEOUT_MS,
  NIGHTLY_HEAVY_JOB_NAMES,
  NIGHTLY_INTEGRATION_JOB_NAME,
  OBSERVATION_COMMAND_TIMEOUT_MS,
  OBSERVATION_RETRY_MIN_ATTEMPT_MS,
  readBaseline,
  reportRedCheck,
  runNightWatch,
  worseConclusion,
  WORST_CASE_OBSERVATION_MS,
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

// Codex 指摘 P2（実測確定）: 畳み込みの reduce が `worst === null` を「初回か」の
// 番兵に使っていたため、**未完了 job の conclusion も null** である
// `[null, 'success']` の並びで 2 件目が無検査に上書きし、run 全体が偽の success に
// なっていた。#2525 の stale 判定がこの success を根拠に無音へ倒すため、E2E が
// 何晩 stuck しても Web が success なら永遠に検出されない。
//
// **この unit test が畳み込みの回帰を固定する唯一の場所。** 統合側
// （checkWorkflowJobRun 経由）では judgeWorkflowRun の `status === 'completed'`
// ガードが独立して同じ事故を防ぐため、reduce を旧実装へ戻しても統合 test は
// 全部通ってしまう（実測で確認した）。二重防御は保つが、それぞれを別々に
// 固定する。
describe('foldJobConclusions', () => {
  it('未完了（null）が混ざると success で上書きされない', () => {
    expect(foldJobConclusions([null, 'success'])).toBeNull();
    expect(foldJobConclusions(['success', null])).toBeNull();
  });

  it('全 success なら success', () => {
    expect(foldJobConclusions(['success', 'success'])).toBe('success');
  });

  it('worst-of で畳む（重大度が高い方が残る）', () => {
    expect(foldJobConclusions(['success', 'failure'])).toBe('failure');
    expect(foldJobConclusions(['cancelled', 'failure'])).toBe('failure');
    expect(foldJobConclusions(['success', 'cancelled', 'timed_out'])).toBe('timed_out');
  });

  it('単一要素はその値をそのまま返す', () => {
    expect(foldJobConclusions(['success'])).toBe('success');
    expect(foldJobConclusions([null])).toBeNull();
  });

  it('空配列は例外を投げる（fail closed）', () => {
    expect(() => foldJobConclusions([])).toThrow(/非空配列/);
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

  // 統合側の確認（judgeWorkflowRun の status ガードでも同じ結果になるため、
  // 畳み込み自体の回帰は下の `foldJobConclusions` の unit test が固定する）。
  it('未完了 job と success job が混在する run を success に化けさせない', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([{ databaseId: 1, createdAt: '2026-08-25T03:00:00+09:00', url: 'u1' }]),
        jobsResponseFor(1, [
          {
            name: NIGHTLY_HEAVY_JOB_NAMES[0],
            status: 'in_progress',
            conclusion: null,
            html_url: 'job1',
          },
          {
            name: NIGHTLY_HEAVY_JOB_NAMES[1],
            status: 'completed',
            conclusion: 'success',
            html_url: 'job2',
          },
        ]),
      ]),
    );
    // 直近 run が未完了で、履歴に完了した success が 1 件も無い（この run だけ）
    // ので stale へ倒れる。旧実装ではこの run 自身が success 扱いになり
    // pending のまま返っていた。
    const outcome = checkWorkflowJobRun(NIGHTLY_HEAVY_JOB_NAMES, { execFileImpl, now: NOW });
    expect(outcome.status).toBe('red');
  });

  // Codex 指摘 P2（実測確定）: stale-pending は「窓内に success が無い」ことを
  // 根拠に赤へ倒す判定なので、履歴の一部が読めていないと根拠が成立しない。
  // 前夜の success run だけ jobs API が落ちた夜に誤 red を起票していた。
  // 内製クロスレビュー risk-reviewer 指摘（medium）: retry 対象を非 0 exit へ
  // 広げたため、GitHub の 5xx incident や secondary rate limit の夜に
  // このループ（1 check-id あたり最大 runListLimit 本の jobs 取得）が 3 倍に
  // 増幅し、job 予算（15 分）を溶かして job ごと SIGKILL される恐れがあった。
  // ループ内の jobs 取得だけ `retries: 0` にしてある。
  //
  // 実測（2026-09-01）: 全 run が 503 でも gh 呼び出しは 31 本 / sleep 0 回。
  // retry が効いていた場合は 91 本 / sleep 60 回に膨らむ。
  it('全 run の jobs 取得が 5xx でも retry で増幅しない（job 予算を溶かさない）', () => {
    const runs = Array.from({ length: 30 }, (_, i) => ({
      databaseId: i + 1,
      createdAt: '2026-08-25T03:00:00+09:00',
      url: `https://x/${i + 1}`,
    }));
    let ghCalls = 0;
    const sleepImpl = vi.fn<(ms: number) => void>();
    const execFileImpl = (_file: string, args: string[]) => {
      ghCalls += 1;
      if (args[0] === 'run') return JSON.stringify(runs);
      throw Object.assign(new Error('Command failed'), {
        status: 1,
        stderr: 'HTTP 503: Service Unavailable',
      });
    };

    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], {
      execFileImpl,
      now: NOW,
      sleepImpl,
    });

    expect(outcome.status).toBe('fetch-failed');
    // run-list 1 本 + jobs 30 本。retry が効くと 91 本になる。
    expect(ghCalls).toBe(31);
    // ループ内 jobs 取得の retry backoff が発生していないこと。
    expect(sleepImpl).not.toHaveBeenCalled();
  });

  // 内製クロスレビュー risk-reviewer 指摘（medium）: ループ内 jobs 取得を
  // retries: 0 にしたことで、**最新 run の 1 回の 503 で前夜の success へ落ち、
  // 本物の赤が green になる**経路が新たに開いていた。ループは新しい順に走り
  // targetCount で break するので、読めなかった run は必ず採用した run と
  // 同じかそれより新しい — 赤だった可能性を排除できない。
  it('最新 run の jobs 取得に失敗したら、前夜の success を根拠に green と判定しない', () => {
    const previousNight = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'run') {
        return JSON.stringify([
          { databaseId: 2, createdAt: new Date(NOW).toISOString(), url: 'https://x/2' },
          { databaseId: 1, createdAt: previousNight, url: 'https://x/1' },
        ]);
      }
      // 最新 run（2）だけ読めない。前夜（1）は success。
      if (args[1]?.includes('/1/')) {
        return JSON.stringify([
          {
            name: NIGHTLY_INTEGRATION_JOB_NAME,
            status: 'completed',
            conclusion: 'success',
            started_at: previousNight,
            html_url: 'job1',
          },
        ]);
      }
      throw Object.assign(new Error('Command failed'), {
        status: 1,
        stderr: 'HTTP 503: Service Unavailable',
      });
    });

    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], {
      execFileImpl,
      now: NOW,
      sleepImpl: () => {},
    });
    // green ではなく fetch-failed（= nightwatch-fetch-failed として起票され、
    // 朝に見える）。
    expect(outcome.status).toBe('fetch-failed');
  });

  it('stale 判定の根拠となる履歴を読めなかった run があれば fetch-failed へ倒す', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'run') {
        return JSON.stringify([
          { databaseId: 2, createdAt: '2026-08-25T03:00:00+09:00', url: 'u2' },
          { databaseId: 1, createdAt: '2026-08-24T03:00:00+09:00', url: 'u1' },
        ]);
      }
      // 直近 run（2）は未完了。前夜の run（1）は jobs API が落ちて読めない。
      if (args[1]?.includes('/2/')) {
        return JSON.stringify([
          {
            name: NIGHTLY_INTEGRATION_JOB_NAME,
            status: 'queued',
            conclusion: null,
            started_at: '2026-08-25T03:00:00+09:00',
            html_url: 'job2',
          },
        ]);
      }
      throw Object.assign(new Error('Command failed: gh api'), {
        status: 1,
        stderr: 'HTTP 502: Bad Gateway',
      });
    });

    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], {
      execFileImpl,
      now: NOW,
      sleepImpl: () => {},
    });
    expect(outcome.status).toBe('fetch-failed');
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

  // 「1 件の失敗で全体を諦めない」（= 次の run へ読み進める）という元の設計は
  // 維持しつつ、**「異常なし」の結論だけは確定させない**（内製クロスレビュー
  // risk-reviewer 指摘 medium）。**採用する run より新しい** run が読めなかった
  // 以上、そこに赤があった可能性を排除できない。
  it('採用 run より新しい run の jobs 取得に失敗したら、後続 run が success でも green を確定させない', () => {
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
    // 読み進めた事実は残る（run 2 の jobs API を叩いている）。
    expect(execFileImpl.mock.calls.some((c) => (c[1] as string[])[1]?.includes('/2/'))).toBe(true);
    // ただし結論は green ではなく fetch-failed（起票されるので無音にならない）。
    expect(outcome).toEqual({ status: 'fetch-failed' });
  });

  // 逆向き（Codex 指摘 P2 第 3 ラウンド、#2525）。最新 run を green と読めた後で
  // **より古い** run の取得に失敗しても縮退させない。その古い run の内容は green
  // の根拠に効いていないため、縮退させると一過性の 503 のたびに不要な
  // `nightwatch-fetch-failed` issue が立つ（jobs 取得は retries: 0 なので現実的）。
  it('採用 run より古い run の取得失敗では green を縮退させない（不要な起票をしない）', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([
          { databaseId: 2, createdAt: '2026-08-25T03:30:00+09:00', url: 'u2' },
          { databaseId: 1, createdAt: '2026-08-24T03:30:00+09:00', url: 'u1' },
        ]),
        // 最新（2）は success として読める。古い方（1）は未 mock（throw）。
        jobsResponseFor(2, [
          { name: NIGHTLY_INTEGRATION_JOB_NAME, status: 'completed', conclusion: 'success' },
        ]),
      ]),
    );
    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    expect(outcome).toEqual({ status: 'green' });
  });

  // 採用 run が terminal でない class（環境承認待ちの `waiting` 等）。#2534 の
  // allowlist 反転後は `isLatestWorkflowRunPending` がこの run を pending と
  // 認識するため、judgeWorkflowRun は green/red の確定へ進まず pending を返す
  // （48h 以内に success があるため stale-pending 化もしない）。green を
  // 誤って確定させる経路そのものが無くなったので、間に挟まる run 2 の取得
  // 失敗は結果に効かない（旧実装は denylist の穴で waiting を pending と
  // 認識できず、この失敗を green の縮退根拠として拾う必要があった）。
  it('採用 run が非 terminal（waiting）なら、48h 以内に success があれば pending として返す', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([
          { databaseId: 3, createdAt: '2026-08-25T04:00:00+09:00', url: 'u3' },
          { databaseId: 2, createdAt: '2026-08-25T03:30:00+09:00', url: 'u2' },
          { databaseId: 1, createdAt: '2026-08-24T06:00:00+09:00', url: 'u1' },
        ]),
        // 最新（3）は environment 承認待ちで waiting（completed でも queued でもない）。
        jobsResponseFor(3, [
          { name: NIGHTLY_INTEGRATION_JOB_NAME, status: 'waiting', conclusion: null },
        ]),
        // 2 は未 mock（throw）= 読めない。1 は 48h 以内の success。
        jobsResponseFor(1, [
          { name: NIGHTLY_INTEGRATION_JOB_NAME, status: 'completed', conclusion: 'success' },
        ]),
      ]),
    );
    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    expect(outcome).toEqual({ status: 'pending', evidenceUrl: 'u3' });
  });

  // 赤の検出を弱めていないことの回帰確認（#2534 注意事項）。waiting のまま
  // 48h 以内に success が 1 件も無ければ、pending ではなく stale-pending の
  // red へ倒れ、取得失敗があれば fetch-failed へ縮退する（無音にはならない）。
  it('採用 run が非 terminal（waiting）で 48h 以内に success が無ければ red（stale-pending）', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([{ databaseId: 3, createdAt: '2026-08-25T04:00:00+09:00', url: 'u3' }]),
        jobsResponseFor(3, [
          { name: NIGHTLY_INTEGRATION_JOB_NAME, status: 'waiting', conclusion: null },
        ]),
      ]),
    );
    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    expect(outcome).toEqual({ status: 'red', evidenceUrl: 'u3' });
  });

  // 上の縮退は「異常なし」側だけに効く。赤が読めているなら、それより古い run の
  // 取得失敗があっても赤として起票する（元の設計意図——直近に本物の red がある
  // 時ほど検出できなくなる fail closed の方向違いを避ける——を維持する）。
  it('読めた run が red なら、他 run の取得失敗があっても red のまま起票する', () => {
    const execFileImpl = vi.fn(
      makeExecFileImpl([
        runListResponse([
          { databaseId: 2, createdAt: '2026-08-25T03:30:00+09:00', url: 'u2' },
          { databaseId: 1, createdAt: '2026-08-24T03:30:00+09:00', url: 'u1' },
        ]),
        // 最新（2）は red、古い方（1）は未 mock（throw）
        jobsResponseFor(2, [
          {
            name: NIGHTLY_INTEGRATION_JOB_NAME,
            status: 'completed',
            conclusion: 'failure',
            html_url: 'job2',
          },
        ]),
      ]),
    );
    const outcome = checkWorkflowJobRun([NIGHTLY_INTEGRATION_JOB_NAME], { execFileImpl, now: NOW });
    expect(outcome.status).toBe('red');
    expect(outcome.evidenceUrl).toBe('job2');
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

  // Codex 指摘 P2 第 2 ラウンド（#2525）。接続確立後に切れる系は DNS 失敗にも
  // HTTP 5xx にも該当せず unknown へ落ちて retry されていなかった。
  it.each([
    ['read ECONNRESET', 'econnreset'],
    ['connection reset by peer', 'connection reset'],
    ['write EPIPE', 'epipe'],
    ['socket hang up', 'socket hang up'],
    ['net/http: TLS handshake timeout', 'tls handshake timeout'],
    ['context deadline exceeded (Client.Timeout)', 'context deadline exceeded'],
    ['dial tcp 140.82.121.6:443: i/o timeout', 'i/o timeout'],
    ['dial tcp: connection refused', 'connection refused'],
    ['Temporary failure in name resolution', 'temporary failure in name resolution'],
  ])('transport 層の一時切断は network-error: %s', (stderr) => {
    expect(classifyGhError({ stderr })).toBe('network-error');
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

  // #2525 の retry 分類。**error の形はすべて 2026-09-01 に実測した実物に
  // 合わせてある**（内製クロスレビュー risk-reviewer 指摘 high/medium。
  // 旧 test は gh の失敗を `status` を持たない素の Error で模擬しており、
  // 実挙動と乖離していたため retry 対象の反転を検出できていなかった）:
  //
  //   execFileSync('sleep', ['5'], { timeout: 200, killSignal: 'SIGKILL' })
  //     → { signal: 'SIGKILL', status: null, code: 'ETIMEDOUT' }（killed は無い）
  //   execFileSync('gh', ['api', '<404 path>'])
  //     → { status: 1 }（数値。つまり gh の失敗は spawn 失敗ではない）
  describe('retry の分類（#2525）', () => {
    const attempts = (execFileImpl: ReturnType<typeof vi.fn>) => execFileImpl.mock.calls.length;

    function timeoutError() {
      return Object.assign(new Error('Command failed: pnpm docs:check'), {
        signal: 'SIGKILL',
        status: null,
        code: 'ETIMEDOUT',
      });
    }

    function ghError(stderr: string) {
      return Object.assign(new Error('Command failed: gh api ...'), { status: 1, stderr });
    }

    it('timeout kill は retry しない（240s × 3 で job 予算を溶かさない）', () => {
      const execFileImpl = vi.fn(() => {
        throw timeoutError();
      });
      const sleepImpl = vi.fn<(ms: number) => void>();
      const result = execObservationCommand('pnpm', ['docs:check'], { execFileImpl, sleepImpl });
      expect(result.ok).toBe(false);
      expect(attempts(execFileImpl)).toBe(1);
      expect(sleepImpl).not.toHaveBeenCalled();
    });

    it('rate limit（非 0 exit）は retry する', () => {
      const execFileImpl = vi.fn(() => {
        throw ghError('API rate limit exceeded for user ID 1.');
      });
      const sleepImpl = vi.fn<(ms: number) => void>();
      execObservationCommand('gh', ['api', 'x'], { execFileImpl, sleepImpl });
      expect(attempts(execFileImpl)).toBe(3);
      expect(sleepImpl).toHaveBeenCalledTimes(2);
    });

    // Codex レビュー P2（#2525）。retry 対象に分類される失敗**自体が遅い**時、
    // 各試行へ満額の timeout を与えると 1 本で 240s × 3 を消費し、
    // `WORST_CASE_OBSERVATION_MS` が主張する上限が嘘になる。
    it('遅い retriable 失敗が続いても、合計は 1 本ぶんの timeout 予算を超えない', () => {
      let clock = 0;
      const nowImpl = () => clock;
      // 1 回の試行が timeout 直前（235s）まで粘ってから 5xx で落ちる。
      const execFileImpl = vi.fn((_cmd: string, _args: string[], opts?: { timeout?: number }) => {
        clock += Math.min(235_000, opts?.timeout ?? 0);
        throw ghError('HTTP 503: Service Unavailable');
      });
      const sleepImpl = vi.fn<(ms: number) => void>((ms) => {
        clock += ms;
      });

      const result = execObservationCommand('gh', ['api', 'x'], {
        execFileImpl,
        sleepImpl,
        nowImpl,
      });

      expect(result.ok).toBe(false);
      // 満額 timeout を 3 回与えると 720s+ になる。deadline で切り詰められる。
      expect(clock).toBeLessThanOrEqual(WORST_CASE_OBSERVATION_MS);
      // 2 本目は残余（5s）へ切り詰められて実行され、3 本目は予算切れで走らない。
      expect(attempts(execFileImpl)).toBe(2);
      const secondCallTimeout = execFileImpl.mock.calls[1][2]?.timeout ?? 0;
      expect(secondCallTimeout).toBeLessThan(OBSERVATION_COMMAND_TIMEOUT_MS);
    });

    // 内製クロスレビュー risk-reviewer 指摘 medium（#2525）。deadline 切り詰めに
    // 下限が無いと、残余数秒で spawn された試行が必ず SIGKILL され、lastError が
    // 本来の原因（503）から ETIMEDOUT へ上書きされて赤の種類がずれる。
    it('残余が下限を割ったら試行せず打ち切り、原因の error を保存する', () => {
      let clock = 0;
      const nowImpl = () => clock;
      const originalCause = ghError('HTTP 503: Service Unavailable');
      const execFileImpl = vi.fn((_cmd: string, _args: string[], opts?: { timeout?: number }) => {
        // 1 回目が満額ぎりぎり（239s）まで粘る → 残余は sleep 後 3s しか残らない。
        clock += Math.min(239_000, opts?.timeout ?? 0);
        throw originalCause;
      });
      const sleepImpl = vi.fn<(ms: number) => void>((ms) => {
        clock += ms;
      });

      const result = execObservationCommand('gh', ['api', 'x'], {
        execFileImpl,
        sleepImpl,
        nowImpl,
      });

      expect(attempts(execFileImpl)).toBe(1);
      expect(result.ok).toBe(false);
      // 勝ち目のない試行で上書きされず、503 がそのまま残る。
      expect(result.ok === false && result.error).toBe(originalCause);
    });

    it('速い retriable 失敗なら、予算内で満額 retry する（切り詰めが効きすぎない）', () => {
      let clock = 0;
      const nowImpl = () => clock;
      const execFileImpl = vi.fn((_cmd: string, _args: string[], opts?: { timeout?: number }) => {
        clock += 100; // 即座に 5xx
        // 経過ぶんだけ残余は縮むが、通常系では実質フル timeout が保たれる。
        expect(opts?.timeout ?? 0).toBeGreaterThan(OBSERVATION_COMMAND_TIMEOUT_MS - 10_000);
        throw ghError('HTTP 502: Bad Gateway');
      });
      const sleepImpl = vi.fn<(ms: number) => void>((ms) => {
        clock += ms;
      });

      execObservationCommand('gh', ['api', 'x'], { execFileImpl, sleepImpl, nowImpl });

      expect(attempts(execFileImpl)).toBe(3);
      expect(sleepImpl).toHaveBeenCalledTimes(2);
    });

    it('ネットワーク断（非 0 exit）は retry する', () => {
      const execFileImpl = vi.fn(() => {
        throw ghError('could not resolve host: api.github.com');
      });
      const sleepImpl = vi.fn<(ms: number) => void>();
      execObservationCommand('gh', ['api', 'x'], { execFileImpl, sleepImpl });
      expect(attempts(execFileImpl)).toBe(3);
    });

    // Codex 指摘 P2（実測確定）: 5xx はどの分類語にも該当せず `unknown` へ落ちて
    // 1 回で確定していた。#2525 は「GitHub の 5xx は retry が吸収する」と書いて
    // いたので、documentation と実装が食い違っていた。
    it.each([
      ['HTTP 502: Bad Gateway'],
      ['HTTP 503: Service Unavailable'],
      ['HTTP 504: Gateway Timeout'],
      ['HTTP 500: Internal Server Error'],
    ])('server error（%s）は retry する', (stderr) => {
      const execFileImpl = vi.fn(() => {
        throw ghError(stderr);
      });
      const sleepImpl = vi.fn<(ms: number) => void>();
      execObservationCommand('gh', ['api', 'x'], { execFileImpl, sleepImpl });
      expect(attempts(execFileImpl)).toBe(3);
    });

    it('本物の赤（分類できない非 0 exit）は retry しない', () => {
      const execFileImpl = vi.fn(() => {
        throw Object.assign(new Error('command failed'), { status: 1 });
      });
      const sleepImpl = vi.fn<(ms: number) => void>();
      execObservationCommand('pnpm', ['docs:check'], { execFileImpl, sleepImpl });
      expect(attempts(execFileImpl)).toBe(1);
    });

    it('auth-error は retry しない（token scope の退行は 3 回叩いても同じ）', () => {
      const execFileImpl = vi.fn(() => {
        throw ghError('HTTP 403: Resource not accessible by personal access token');
      });
      const sleepImpl = vi.fn<(ms: number) => void>();
      execObservationCommand('gh', ['api', 'x'], { execFileImpl, sleepImpl });
      expect(attempts(execFileImpl)).toBe(1);
    });

    it('retry の途中で成功したらそこで打ち切る', () => {
      let n = 0;
      const execFileImpl = vi.fn(() => {
        n += 1;
        if (n === 1) throw ghError('API rate limit exceeded');
        return 'ok\n';
      });
      const sleepImpl = vi.fn<(ms: number) => void>();
      const result = execObservationCommand('gh', ['api', 'x'], { execFileImpl, sleepImpl });
      expect(result).toEqual({ ok: true, stdout: 'ok\n' });
      expect(attempts(execFileImpl)).toBe(2);
      expect(sleepImpl).toHaveBeenCalledTimes(1);
    });
  });

  // retry の総コストが job 予算に収まることを定数間の不等式で固定する
  // （内製クロスレビュー risk-reviewer 指摘 high）。timeout を retry 対象に
  // 戻すと 240s × 3 = 720s になり、setup（checkout / pnpm install /
  // Sentry CLI）と合わせて 15 分を超えて runner に kill される。
  //
  // **これは「観測コマンド 1 本あたり」の上限であって、run 全体の保証ではない**
  // （Codex 指摘 P2 の指摘どおり。過大な主張をしないため明記する）。7 check が
  // 揃って timeout すれば 7 × 240s = 1680s で job 予算を超えるが、それは
  // #2525 以前から同じで、この PR が悪化させたものではない（timeout を retry
  // 対象から外したので 1 本あたりの上限は実質据え置き）。観測フェーズ全体の
  // deadline は別の設計変更なので、この PR の scope には入れない。
  it('観測コマンド 1 本の最悪コストが job 予算を大きく下回る（run 全体の保証ではない）', () => {
    expect(WORST_CASE_OBSERVATION_MS).toBeLessThan(NIGHT_WATCH_JOB_TIMEOUT_MS / 2);
    // retry を含めても、timeout 1 回ぶんから大きく増えないことを固定する。
    // ここが跳ね上がる変更（timeout の retry 復活など）は必ずこの test を割る。
    expect(WORST_CASE_OBSERVATION_MS).toBeLessThan(250_000);
  });

  // 内製クロスレビュー risk-reviewer 指摘 low（#2525）。この不等式が崩れると
  // attempt 0 の時点で `remaining < 下限` が成立し、execFileImpl が一度も
  // 呼ばれないまま `{ ok: false, error: undefined }` が返る = 全 check が
  // 理由不明の fetch-failed へ一斉に落ちる。定数を短くする調整で静かに
  // 踏めるので、この file の他の不等式と同じく test で固定する。
  it('retry の下限が観測予算を上回らない（attempt 0 を殺さない）', () => {
    expect(OBSERVATION_RETRY_MIN_ATTEMPT_MS).toBeLessThan(OBSERVATION_COMMAND_TIMEOUT_MS);
    expect(OBSERVATION_RETRY_MIN_ATTEMPT_MS).toBeLessThan(WORST_CASE_OBSERVATION_MS);
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
// #2467: SUPABASE_STORAGE_RLS_AUDIT_TOKEN の失効監視（軽量案）。
describe('checkSecretExpiry / buildAlertArgs（secret-expiry kind）', () => {
  const DEFINITION = { expiresAt: '2026-11-23', warningDays: 14 };

  it('warningDays より残り日数が多ければ green', () => {
    // 2026-09-01 時点で残り約83日（> 14日）。
    const now = new Date('2026-09-01T00:00:00Z').getTime();
    expect(checkSecretExpiry(DEFINITION, { now })).toEqual({ status: 'green' });
  });

  it('残り日数が warningDays と一致する境界でも red（以内は含む）', () => {
    const now = new Date('2026-11-09T00:00:00Z').getTime(); // 2026-11-23 の14日前
    expect(checkSecretExpiry(DEFINITION, { now })).toEqual({ status: 'red', actual: 14 });
  });

  it('warningDays より残り日数が少なければ red', () => {
    const now = new Date('2026-11-20T00:00:00Z').getTime(); // 残り3日
    expect(checkSecretExpiry(DEFINITION, { now })).toEqual({ status: 'red', actual: 3 });
  });

  it('失効日を過ぎていても red（actual は負数）', () => {
    const now = new Date('2026-12-01T00:00:00Z').getTime();
    const outcome = checkSecretExpiry(DEFINITION, { now });
    expect(outcome.status).toBe('red');
    expect(outcome.actual).toBeLessThan(0);
  });

  it('buildAlertArgs は actual を文字列化する', () => {
    expect(buildAlertArgs('storage-rls-audit-token-expiry', { actual: 3 })).toEqual({
      actual: '3',
    });
  });

  // risk-reviewer 指摘と同型（checkSentryNew の隣接テストに倣う）:
  // outcome → buildAlertArgs → 実 buildAlertBody まで通して起票自体が
  // 壊れないことを固定する（unit test だけの同語反復にしない）。
  it('red の outcome でも実際の buildAlertBody（alert-issue.mjs）まで通してthrowしない', async () => {
    const { buildAlertBody } = await import('./alert-issue.mjs');
    const outcome = checkSecretExpiry(DEFINITION, {
      now: new Date('2026-11-20T00:00:00Z').getTime(),
    });
    const args = buildAlertArgs('storage-rls-audit-token-expiry', outcome);
    const body = buildAlertBody({
      checkId: 'storage-rls-audit-token-expiry',
      args,
      detectedAt: '2026-11-20T00:00:00Z',
    });
    expect(body).toContain('残り 3 日');
    expect(body).toContain('2026-11-23');
  });
});

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

  // Codex レビュー P2（#2525）。evidence-less 再試行のフォールバックは
  // 「gh を呼ぶ前に確定する検証エラー」だけを対象にする必要がある。
  // gh 由来の例外まで拾うと、1 回目で `reserveAlertRunSlot` が check-id を
  // 消費済みのため 2 回目は必ず `capped` になり、赤が無音化する。
  describe('evidence 検証エラーの識別（#2525、Codex P2）', () => {
    it('evidence の書式エラーは isEvidenceValidationError が true', async () => {
      const { buildAlertBody, isEvidenceValidationError } = await import('./alert-issue.mjs');
      let thrown: unknown;
      try {
        buildAlertBody({
          checkId: 'sentry-new',
          args: { count: '1', evidence: ['Sentry issue のタイトルがここに入ってしまった'] },
          detectedAt: '2026-08-25T05:00:00+09:00',
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown).toBeInstanceOf(Error);
      expect(isEvidenceValidationError(thrown)).toBe(true);
    });

    it('gh 由来の例外は isEvidenceValidationError が false（フォールバックしない）', async () => {
      const { isEvidenceValidationError } = await import('./alert-issue.mjs');
      const ghFailure = Object.assign(new Error('Command failed: gh issue create'), {
        status: 1,
        stderr: 'HTTP 503: Service Unavailable',
      });
      expect(isEvidenceValidationError(ghFailure)).toBe(false);
      expect(isEvidenceValidationError(new Error('plain'))).toBe(false);
      expect(isEvidenceValidationError(undefined)).toBe(false);
    });
  });

  // **述語の unit test だけでは fix を証明できない**（実測: 述語を残したまま
  // `reportRedCheck` の guard を外しても述語 test は全部 pass した）。
  // `reportRedCheck` 自体を通し、gh 失敗が `capped` に化けないことを固定する。
  describe('reportRedCheck の evidence-less 再試行（#2525、Codex P2）', () => {
    let tmpDir: string;
    let runStatePath: string;

    beforeEach(() => {
      tmpDir = mkdtempSync(join(tmpdir(), 'night-watch-report-red-'));
      runStatePath = join(tmpDir, 'alert-run-state.json');
    });
    afterEach(() => rmSync(tmpDir, { recursive: true, force: true }));

    const validArgs = {
      count: '1',
      evidence: ['DAYOPT-1 https://dayopt.sentry.io/issues/1/'],
    };

    it('gh issue create が落ちたら throw する（capped に化けて無音にならない）', () => {
      const execFileImpl = vi.fn((_file: string, args: string[]) => {
        // dedup 検索は成功させ、既存 issue 無しにする。
        if (args.includes('list')) return '[]';
        // 起票で 5xx。1 回目の reserveAlertRunSlot は既に消費済み。
        throw Object.assign(new Error('Command failed: gh issue create'), {
          status: 1,
          stderr: 'HTTP 503: Service Unavailable',
        });
      });

      expect(() => reportRedCheck('sentry-new', validArgs, { execFileImpl, runStatePath })).toThrow(
        /gh issue create/,
      );
    });

    it('evidence の書式エラーなら evidence 無しで再試行して起票できる（本来の意図は残る）', () => {
      const execFileImpl = vi.fn((_file: string, args: string[]) => {
        if (args.includes('list')) return '[]';
        return 'https://github.com/Dayopt/dayopt/issues/999';
      });

      const result = reportRedCheck(
        'sentry-new',
        { count: '1', evidence: ['Sentry issue のタイトルが混入した'] },
        { execFileImpl, runStatePath },
      );

      expect(result.action).toBe('created');
      expect(result.issueNumber).toBe(999);
    });
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
      'night-watch: all green | 観測 8/8 | 起票 0 | 保留 0 | 起票失敗 0 | 予算超過 0 | 取得失敗 0',
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
          // 検索語に括弧を入れない（#2525、実測: 括弧つきは GitHub 検索が 0 件）
          has(args, 'nightwatch docs-check in:title'),
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
      'night-watch: 要確認 | 観測 8/8 | 起票 1 | 保留 0 | 起票失敗 0 | 予算超過 0 | 取得失敗 0',
    );
    process.exitCode = 0;
  });

  // #2467: SUPABASE_STORAGE_RLS_AUDIT_TOKEN の失効監視。他の check-id と違い
  // gh/sentry の応答を一切 mock していない（純粋な日付計算のため）ことで、
  // 配線ミス（CHECK_IDS のキーと CHECK_DEFINITIONS のキーが食い違う等）が
  // あれば「未知の check-id です」で即 throw することを確認する。
  //
  // `now` は FIXED_NOW（baseRules 内の run/job タイムスタンプが依拠する基準
  // 時刻）のまま据え置く——ここを動かすと heavy-red/integration-red 側の
  // 24h/48h 窓判定が崩れ、この check-id 以外まで red 化して assertion が
  // 意図と無関係な理由で壊れる。代わりに `CHECK_DEFINITIONS` の
  // `expiresAt` を一時的に FIXED_NOW の 3 日後へ差し替える。
  it('token失効が14日以内に迫った晩は nightwatch(storage-rls-audit-token-expiry) issue を新規起票する', async () => {
    const { CHECK_DEFINITIONS } = await import('./alert-issue.mjs');
    const definition = CHECK_DEFINITIONS['storage-rls-audit-token-expiry'];
    const originalExpiresAt = definition.expiresAt;
    definition.expiresAt = new Date(FIXED_NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const rules = [
      {
        match: (file: string, args: string[]) =>
          file === 'gh' &&
          args[0] === 'issue' &&
          args[1] === 'list' &&
          has(args, 'nightwatch storage-rls-audit-token-expiry in:title'),
        respond: () => JSON.stringify([]),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' &&
          args[0] === 'issue' &&
          args[1] === 'create' &&
          has(args, 'nightwatch(storage-rls-audit-token-expiry)'),
        respond: () => 'https://github.com/Dayopt/dayopt/issues/12347',
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    try {
      runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });
    } finally {
      definition.expiresAt = originalExpiresAt;
    }

    const createCall = execFileImpl.calls.find(
      (c) =>
        c.file === 'gh' &&
        c.args[0] === 'issue' &&
        c.args[1] === 'create' &&
        has(c.args, 'nightwatch(storage-rls-audit-token-expiry)'),
    );
    expect(createCall).toBeDefined();
    const title = createCall?.args[createCall.args.indexOf('--title') + 1];
    expect(title).toBe(
      'nightwatch(storage-rls-audit-token-expiry): SUPABASE_STORAGE_RLS_AUDIT_TOKEN の失効が近づいています',
    );
    const body = createCall?.args[createCall.args.indexOf('--body') + 1];
    expect(body).toContain('残り 3 日');

    expect(summaryLine()).toBe(
      'night-watch: 要確認 | 観測 8/8 | 起票 1 | 保留 0 | 起票失敗 0 | 予算超過 0 | 取得失敗 0',
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
          // 検索語に括弧を入れない（#2525、実測: 括弧つきは GitHub 検索が 0 件）
          has(args, 'nightwatch docs-check in:title'),
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

  // 内製クロスレビュー risk-reviewer 指摘（high）: dedup 検索（`gh issue list
  // --search`）が失敗すると `runAlertSync` は **throw せず**
  // `{ action: 'skipped' }` を返す（fail closed で誤起票を避ける設計）。
  // これを「起票しなかった」で片付けると、gh 障害・token scope 退行の夜に
  // 「本物の赤あり / issue ゼロ / job 緑」が成立する。#2525 より前は同じ障害で
  // Step 5（運行記録の gh 投稿）も失敗し、その非 0 exit が backstop だった。
  it('dedup 検索が失敗して起票を見送った夜も非 0 exit になる（緑のまま赤を無音化しない）', () => {
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
        // dedup 検索そのものが落ちる（gh の障害）。runAlertSync は throw せず
        // { action: 'skipped' } を返す。
        match: (file: string, args: string[]) =>
          file === 'gh' && args[0] === 'issue' && args[1] === 'list' && has(args, 'nightwatch'),
        respond: () =>
          Object.assign(new Error('Command failed: gh issue list'), {
            status: 1,
            stderr: 'HTTP 403: Resource not accessible by personal access token',
          }),
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    // issue は 1 件も作られていない（fail closed は維持する）。
    const createCalls = execFileImpl.calls.filter(
      (c) => c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'create',
    );
    expect(createCalls).toHaveLength(0);

    // それでも job は赤くなる。ここが #2525 で開きかけた穴。
    expect(process.exitCode).toBe(1);
    // 観測そのものは 7/7 成功している（赤だと分かったからこそ起票を試みた）。
    // 「取得失敗 0 / 起票失敗 1」と読めることが、gh 障害の切り分けに要る。
    expect(summaryLine()).toBe(
      'night-watch: 要確認 | 観測 8/8 | 起票 0 | 保留 0 | 起票失敗 1 | 予算超過 0 | 取得失敗 0',
    );
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
          Object.assign(new Error('Command failed: gh api ...'), {
            status: 1,
            stderr: 'API rate limit exceeded for user ID 1.',
          }),
      },
      {
        // fetch-failure の dedup 検索（既存 issue 無し → 新規作成）
        match: (file: string, args: string[]) =>
          file === 'gh' &&
          args[0] === 'issue' &&
          args[1] === 'list' &&
          has(args, 'nightwatch-fetch-failed dependabot-alerts in:title'),
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

    // 起票の前に run 内 retry を尽くしている（rate limit は retriable なので
    // 合計 3 回試行される）。
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
      'night-watch: 要確認 | 観測 7/8 | 起票 1 | 保留 0 | 起票失敗 0 | 予算超過 0 | 取得失敗 1',
    );
    process.exitCode = 0;
  });

  // #2535 item 4: `checkExitCode`（docs-check/deadcode の kind）は旧実装だと
  // `isSpawnFailure` だけを見ており、retry を尽くした後の最終エラーが
  // network-error 分類でも（プロセスは起動して非 0 exit するため）red へ
  // 落ちていた。`isRetriableObservationFailure` の分類と揃えることで、
  // 一過性の観測失敗は red-alert ではなく fetch-failed 側へ倒れる。
  it('docs-check が network-error 分類のまま retry しきれない時は red ではなく fetch-failed になる', () => {
    const rules = [
      {
        match: (file: string, args: string[]) => file === 'pnpm' && args[0] === 'docs:check',
        respond: () =>
          Object.assign(new Error('Command failed: pnpm docs:check'), {
            status: 1,
            stderr: 'read ECONNRESET',
          }),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' &&
          args[0] === 'issue' &&
          args[1] === 'list' &&
          has(args, 'nightwatch-fetch-failed docs-check in:title'),
        respond: () => JSON.stringify([]),
      },
      {
        match: (file: string, args: string[]) =>
          file === 'gh' &&
          args[0] === 'issue' &&
          args[1] === 'create' &&
          has(args, 'nightwatch-fetch-failed(docs-check)'),
        respond: () => 'https://github.com/Dayopt/dayopt/issues/851\n',
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    // red-alert（nightwatch(docs-check)）は起票されていない。
    const redAlertCreateCalls = execFileImpl.calls.filter(
      (c) =>
        c.file === 'gh' &&
        c.args[0] === 'issue' &&
        c.args[1] === 'create' &&
        has(c.args, 'nightwatch(docs-check)') &&
        !has(c.args, 'nightwatch-fetch-failed(docs-check)'),
    );
    expect(redAlertCreateCalls).toHaveLength(0);

    const fetchFailedCreateCall = execFileImpl.calls.find(
      (c) =>
        c.file === 'gh' &&
        c.args[0] === 'issue' &&
        c.args[1] === 'create' &&
        has(c.args, 'nightwatch-fetch-failed(docs-check)'),
    );
    expect(fetchFailedCreateCall).toBeDefined();

    expect(summaryLine()).toBe(
      'night-watch: 要確認 | 観測 7/8 | 起票 1 | 保留 0 | 起票失敗 0 | 予算超過 0 | 取得失敗 1',
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
          if (attempts === 1) {
            return Object.assign(new Error('Command failed: gh api ...'), {
              status: 1,
              stderr: 'could not resolve host: api.github.com',
            });
          }
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
      'night-watch: all green | 観測 8/8 | 起票 0 | 保留 0 | 起票失敗 0 | 予算超過 0 | 取得失敗 0',
    );
    process.exitCode = 0;
  });

  // #2525: pending の連晩判定（常設運行記録 issue のコメント列を数える
  // `checkRecentPending`）を廃止した代わりの stale 判定が、runNightWatch まで
  // 通しで効くことを固定する。単発の pending は無音、48h 以内に success が
  // 無ければ赤。
  it('直近 run が pending でも 48h 以内に success があれば起票しない（判定保留）', () => {
    // **前夜の完了 run を履歴に置く。** Codex 指摘 P2 の修正前は、同一 run 内の
    // [in_progress, success] が偽の success に畳まれるせいで、前夜の run が
    // 無くてもこの test が通ってしまっていた（stale 判定を素通りさせる
    // 実装バグを test が追認していた形。TEST-1）。
    const PREVIOUS_RUN_ID = 400;
    const previousNight = new Date(FIXED_NOW.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rules = [
      {
        match: (file: string, args: string[]) =>
          file === 'gh' && has(args, 'run', 'list', '--workflow=nightly.yml', '--branch'),
        respond: () =>
          JSON.stringify([
            { databaseId: NIGHTLY_RUN_ID, createdAt: FIXED_NOW.toISOString(), url: 'https://x/2' },
            { databaseId: PREVIOUS_RUN_ID, createdAt: previousNight, url: 'https://x/1' },
          ]),
      },
      {
        // 直近 run: E2E がまだ走っている（Web / Integration は完了）
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
      {
        // 前夜の run: 全 job が success（= 48h 窓内の success 実績）
        match: (file: string, args: string[]) =>
          file === 'gh' && has(args, 'api', `actions/runs/${PREVIOUS_RUN_ID}/jobs`),
        respond: () =>
          JSON.stringify(
            ['\u{1F3AD} E2E Tests', '\u{1F310} Web Build & E2E', 'Integration Tests'].map(
              (name, i) => ({
                name,
                status: 'completed',
                conclusion: 'success',
                started_at: previousNight,
                html_url: `https://github.com/Dayopt/dayopt/actions/runs/98/job/${i + 1}`,
              }),
            ),
          ),
      },
      ...baseRules(),
    ];
    const execFileImpl = createExecFileImpl(rules);
    runNightWatch({ execFileImpl, now: FIXED_NOW.getTime(), runStatePath, sleepImpl });

    const createCalls = execFileImpl.calls.filter(
      (c) => c.file === 'gh' && c.args[0] === 'issue' && c.args[1] === 'create',
    );
    expect(createCalls).toHaveLength(0);
    // pending だけの夜は「要確認」に倒さない（日常的に起きるため verdict の
    // 識別力が落ちる。内製クロスレビュー risk-reviewer 指摘 low）。
    expect(summaryLine()).toBe(
      'night-watch: 判定保留あり | 観測 8/8 | 起票 0 | 保留 1 | 起票失敗 0 | 予算超過 0 | 取得失敗 0',
    );
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
      'night-watch: 要確認 | 観測 5/8 | 起票 3 | 保留 0 | 起票失敗 0 | 予算超過 1 | 取得失敗 3',
    );
    // #2535 item 3（推奨案 a）: capped が 1 件でもあれば job を非 0 exit にする。
    // 起票上限で見送った事実がサマリ 1 行にしか残らないと、job 自体は緑のまま
    // 朝に気づけない。
    expect(process.exitCode).toBe(1);
    process.exitCode = 0;
  });
});

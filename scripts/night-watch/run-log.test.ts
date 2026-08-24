import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildBoardNoteComment,
  buildOpsLogComment,
  resolveOpsLogIssueNumber,
  runBoardNote,
  runEnvFailure,
  runOpsLogReport,
  validateOpsLogReport,
} from './run-log.mjs';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-24T01:00:00Z')); // JST 2026-08-24 10:00
});

afterEach(() => {
  vi.useRealTimers();
});

/** `.find()` の結果が無ければ即失敗させる（テストの意図を明確にする）。 */
function mustFind<T>(items: T[], predicate: (item: T) => boolean): T {
  const found = items.find(predicate);
  if (!found) throw new Error('該当する呼び出しが見つかりません');
  return found;
}

const GREEN_REPORT: import('./run-log.mjs').OpsLogReport = {
  executed: 6,
  failed: [],
  results: [],
  baselineRecommend: [],
  board: { status: 'success', issueNumber: 200 },
  dod: { status: 'candidate', prNumber: 301 },
};

describe('resolveOpsLogIssueNumber', () => {
  it('登録済みなら issue 番号を返す', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**（登録済み）\n';
    expect(resolveOpsLogIssueNumber({ readFileImpl })).toBe(1234);
  });

  it('未登録なら例外を投げる', () => {
    const readFileImpl = () => '- 運行記録 issue: **未登録**（この行は指揮台が書き換える）\n';
    expect(() => resolveOpsLogIssueNumber({ readFileImpl })).toThrow(/登録されていません/);
  });
});

describe('validateOpsLogReport', () => {
  it('正しい report は例外を投げない', () => {
    expect(() => validateOpsLogReport(GREEN_REPORT)).not.toThrow();
  });

  it('executed が範囲外なら拒否する', () => {
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, executed: 7 })).toThrow(/executed/);
  });

  it('failed に未知の check-id があれば拒否する', () => {
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, failed: ['evil'] })).toThrow(/failed/);
  });

  it('results の checkId が未知なら拒否する', () => {
    expect(() =>
      validateOpsLogReport({ ...GREEN_REPORT, results: [{ checkId: 'evil', outcome: 'green' }] }),
    ).toThrow(/results/);
  });

  it('results の outcome=issue で issueNumber が無ければ拒否する', () => {
    expect(() =>
      validateOpsLogReport({
        ...GREEN_REPORT,
        results: [{ checkId: 'docs-check', outcome: 'issue' }],
      }),
    ).toThrow(/results/);
  });

  it('board.status=fail で detail が空なら拒否する', () => {
    expect(() =>
      validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'fail', detail: '' } }),
    ).toThrow(/board.detail/);
  });

  it('board.status=fail で detail が301文字超なら拒否する', () => {
    expect(() =>
      validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'fail', detail: 'x'.repeat(301) } }),
    ).toThrow(/board.detail/);
  });

  it('未知の board.status は拒否する', () => {
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, board: { status: 'evil' } })).toThrow(
      /board.status/,
    );
  });

  it('未知の dod.status は拒否する', () => {
    expect(() => validateOpsLogReport({ ...GREEN_REPORT, dod: { status: 'evil' } })).toThrow(
      /dod.status/,
    );
  });
});

describe('buildOpsLogComment', () => {
  it('all green の場合の本文を組み立てる', () => {
    const comment = buildOpsLogComment(GREEN_REPORT);
    expect(comment).toContain('**night-watch 運行記録 2026-08-24**');
    expect(comment).toContain('- 実行 check 数: 6 / 6（取得失敗を除く）');
    expect(comment).toContain('- 取得失敗: なし');
    expect(comment).toContain('- all green');
    expect(comment).toContain('- baseline 更新推奨: なし');
    expect(comment).toContain('- 盤面起票: 成功（#200）');
    expect(comment).toContain('- DoD監査候補: #301');
  });

  it('異常検出時は起票/追記の一覧を組み立てる', () => {
    const report: import('./run-log.mjs').OpsLogReport = {
      executed: 5,
      failed: ['sentry-new'],
      results: [
        { checkId: 'docs-coverage', outcome: 'issue', issueNumber: 700 },
        { checkId: 'deadcode', outcome: 'green' },
      ],
      baselineRecommend: ['dependabot-alerts'],
      board: { status: 'skip' },
      dod: { status: 'none' },
    };
    const comment = buildOpsLogComment(report);
    expect(comment).toContain('- 取得失敗: sentry-new');
    expect(comment).toContain('- 起票/追記: #700（docs-coverage）');
    expect(comment).toContain('- baseline 更新推奨: dependabot-alerts');
    expect(comment).toContain('- 盤面起票: skip（起票済み）');
    expect(comment).toContain('- DoD監査候補: 前日merge PR無し');
  });

  it('盤面起票失敗時は detail をそのまま埋め込む', () => {
    const comment = buildOpsLogComment({
      ...GREEN_REPORT,
      board: { status: 'fail', detail: 'API error 500' },
    });
    expect(comment).toContain('- 盤面起票: 失敗（API error 500）');
  });
});

describe('runOpsLogReport', () => {
  it('検証を通った report を運行記録 issue へコメントする（宛先は docs から解決）', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn(
      () => 'https://github.com/Dayopt/dayopt/issues/1234#issuecomment-1\n',
    );

    const result = runOpsLogReport({ report: GREEN_REPORT, execFileImpl, readFileImpl });

    expect(result).toEqual({ issueNumber: 1234 });
    expect(execFileImpl).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'comment',
        '1234',
        '--repo',
        'Dayopt/dayopt',
        '--body',
        buildOpsLogComment(GREEN_REPORT),
      ],
      { encoding: 'utf8' },
    );
  });

  it('未登録なら gh を呼ばずに例外を投げる', () => {
    const readFileImpl = () => '- 運行記録 issue: **未登録**\n';
    const execFileImpl = vi.fn();

    expect(() => runOpsLogReport({ report: GREEN_REPORT, execFileImpl, readFileImpl })).toThrow(
      /登録されていません/,
    );
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  it('report の検証に失敗したら gh を呼ばずに例外を投げる', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn();

    expect(() =>
      runOpsLogReport({ report: { ...GREEN_REPORT, executed: 99 }, execFileImpl, readFileImpl }),
    ).toThrow(/executed/);
    expect(execFileImpl).not.toHaveBeenCalled();
  });
});

describe('runEnvFailure', () => {
  it('no-var は固定文言を運行記録 issue へコメントする', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn(() => 'https://github.com/Dayopt/dayopt/issues/1234\n');

    const result = runEnvFailure({ kind: 'no-var', execFileImpl, readFileImpl });

    expect(result).toEqual({ issueNumber: 1234, kind: 'no-var' });
    expect(execFileImpl).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'comment',
        '1234',
        '--repo',
        'Dayopt/dayopt',
        '--body',
        '環境故障: DAYOPT_NIGHT_WATCH 未検出',
      ],
      { encoding: 'utf8' },
    );
  });

  it('write-token は固定文言を運行記録 issue へコメントする', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    const execFileImpl = vi.fn(() => 'https://github.com/Dayopt/dayopt/issues/1234\n');

    runEnvFailure({ kind: 'write-token', execFileImpl, readFileImpl });

    expect(execFileImpl).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'comment',
        '1234',
        '--repo',
        'Dayopt/dayopt',
        '--body',
        '環境故障: token に write 権限あり',
      ],
      { encoding: 'utf8' },
    );
  });

  it('未知の kind は拒否する', () => {
    const readFileImpl = () => '- 運行記録 issue: **#1234**\n';
    // 意図的に型を破る（実際の CLI 入口は argv の生文字列を渡すため、ここでの
    // 実行時拒否が本物の防御）。
    expect(() => runEnvFailure({ kind: 'evil' as 'no-var', readFileImpl })).toThrow(
      /未知の環境故障種別/,
    );
  });
});

describe('buildBoardNoteComment', () => {
  it('all green の 1 行を組み立てる', () => {
    expect(buildBoardNoteComment({ allGreen: true, issued: 0, observed: 6 })).toBe(
      '⏱ 夜勤: all green | 起票 0 件 / 観測 6 件',
    );
  });

  it('一部取得失敗の 1 行を組み立てる', () => {
    expect(buildBoardNoteComment({ allGreen: false, issued: 2, observed: 4 })).toBe(
      '⏱ 夜勤: 一部取得失敗 | 起票 2 件 / 観測 4 件',
    );
  });
});

describe('runBoardNote', () => {
  function fakeGh(boardIssues: Array<{ number: number; title: string }>) {
    return vi.fn((cmd: string, args: string[]) => {
      if (args[1] === 'list') return JSON.stringify(boardIssues);
      if (args[1] === 'comment') return 'https://github.com/Dayopt/dayopt/issues/200\n';
      throw new Error(`unexpected: ${JSON.stringify(args)}`);
    });
  }

  it('当日盤面 issue へ 1 行コメントする', () => {
    const execFileImpl = fakeGh([{ number: 200, title: '盤面 2026-08-24' }]);

    const result = runBoardNote({ note: { allGreen: true, issued: 0, observed: 6 }, execFileImpl });

    expect(result).toEqual({ boardIssueNumber: 200 });
    const commentCall = mustFind(execFileImpl.mock.calls, (call) => call[1][1] === 'comment');
    expect(commentCall[1]).toEqual([
      'issue',
      'comment',
      '200',
      '--repo',
      'Dayopt/dayopt',
      '--body',
      '⏱ 夜勤: all green | 起票 0 件 / 観測 6 件',
    ]);
  });

  it('当日盤面 issue が無ければ例外を投げる', () => {
    const execFileImpl = fakeGh([]);
    expect(() =>
      runBoardNote({ note: { allGreen: true, issued: 0, observed: 6 }, execFileImpl }),
    ).toThrow(/盤面 issue が見つかりません/);
  });

  it('note の形が不正なら拒否する', () => {
    const execFileImpl = fakeGh([{ number: 200, title: '盤面 2026-08-24' }]);
    // 意図的に型を破る（実際の CLI 入口は JSON.parse の結果（型: any）を渡す
    // ため、ここでの実行時拒否が本物の防御）。
    expect(() =>
      runBoardNote({
        note: { allGreen: 'yes' as unknown as boolean, issued: 0, observed: 6 },
        execFileImpl,
      }),
    ).toThrow(/note の形が不正/);
  });
});

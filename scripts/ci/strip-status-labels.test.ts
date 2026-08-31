import { describe, expect, it, vi } from 'vitest';

import {
  collectBulkTargets,
  DEFAULT_BULK_BUDGET_SECONDS,
  findClosedIssuesWithStatusLabel,
  formatBulkInterruption,
  KNOWN_STATUS_LABELS,
  runBulkStrip,
  selectStatusLabelsToStrip,
  stripStatusLabelsForIssue,
} from './strip-status-labels.mjs';

describe('selectStatusLabelsToStrip', () => {
  it('status: prefix のラベルだけを選ぶ', () => {
    expect(
      selectStatusLabelsToStrip(['status:in-progress', 'type:bug', 'area:operations']),
    ).toEqual(['status:in-progress']);
  });

  // #2440 やること2: judgment:diverged は判断ジャーナルの月次sweep対象で
  // close済みでも意図的に残す設計（`dispatch` skill（旧 orchestration.md、#2479 で再編） §判断ジャーナル）。
  // 誤って剥がすとジャーナルの母集団が消える不可逆に近い事故になる。
  it('judgment:diverged を含む複数ラベルからstatus:のみを選び、judgment:は残す', () => {
    expect(selectStatusLabelsToStrip(['status:ready', 'judgment:diverged', 'priority:p1'])).toEqual(
      ['status:ready'],
    );
  });

  it('judgment:judged も対象外のまま残る', () => {
    expect(selectStatusLabelsToStrip(['status:review', 'judgment:judged'])).toEqual([
      'status:review',
    ]);
  });

  it('status:* が無ければ空配列を返す', () => {
    expect(selectStatusLabelsToStrip(['type:chore', 'area:backend'])).toEqual([]);
  });

  it('undefined/空配列でも例外を投げない', () => {
    expect(selectStatusLabelsToStrip(undefined)).toEqual([]);
    expect(selectStatusLabelsToStrip([])).toEqual([]);
  });
});

describe('stripStatusLabelsForIssue', () => {
  it('status:* ラベルを1件ずつ --remove-label で剥がす', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        return JSON.stringify({
          labels: [
            { name: 'status:in-progress' },
            { name: 'judgment:diverged' },
            { name: 'type:bug' },
          ],
        });
      }
      return '';
    });
    const stripped = stripStatusLabelsForIssue(100, { execFileImpl });
    expect(stripped).toEqual(['status:in-progress']);

    const editCalls = vi
      .mocked(execFileImpl)
      .mock.calls.filter((call) => call[1][0] === 'issue' && call[1][1] === 'edit');
    expect(editCalls).toHaveLength(1);
    expect(editCalls[0][1]).toEqual(
      expect.arrayContaining(['--remove-label', 'status:in-progress']),
    );
    // judgment:diverged に対する remove-label 呼び出しは無い
    expect(editCalls.some((call) => call[1].includes('judgment:diverged'))).toBe(false);
  });

  it('status:* が無ければ remove-label を呼ばず空配列を返す', () => {
    const execFileImpl: (file: string, args: string[]) => string = vi.fn(() =>
      JSON.stringify({ labels: [{ name: 'type:chore' }] }),
    );
    const stripped = stripStatusLabelsForIssue(101, { execFileImpl });
    expect(stripped).toEqual([]);
    const editCalls = vi
      .mocked(execFileImpl)
      .mock.calls.filter((call) => call[1][0] === 'issue' && call[1][1] === 'edit');
    expect(editCalls).toHaveLength(0);
  });

  it('複数のstatus:*が付いていれば全件剥がす（通常は0/1個の運用だが多重付与にも対応）', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      if (args[0] === 'issue' && args[1] === 'view') {
        return JSON.stringify({
          labels: [{ name: 'status:ready' }, { name: 'status:watching' }],
        });
      }
      return '';
    });
    const stripped = stripStatusLabelsForIssue(102, { execFileImpl });
    expect(stripped).toEqual(['status:ready', 'status:watching']);
  });
});

describe('findClosedIssuesWithStatusLabel', () => {
  it('gh issue list --state closed --label でissue番号を取得する', () => {
    const execFileImpl: (file: string, args: string[]) => string = vi.fn(() =>
      JSON.stringify([{ number: 10 }, { number: 5 }]),
    );
    const numbers = findClosedIssuesWithStatusLabel('status:in-progress', { execFileImpl });
    expect(numbers).toEqual([10, 5]);
    const call = vi.mocked(execFileImpl).mock.calls[0];
    expect(call[1]).toEqual(
      expect.arrayContaining(['--state', 'closed', '--label', 'status:in-progress']),
    );
  });
});

describe('collectBulkTargets', () => {
  it('KNOWN_STATUS_LABELS全件を検索し重複除去して昇順に返す', () => {
    const execFileImpl = vi.fn((_file: string, args: string[]) => {
      const labelIndex = args.indexOf('--label');
      const label = args[labelIndex + 1];
      if (label === 'status:ready') return JSON.stringify([{ number: 20 }, { number: 5 }]);
      if (label === 'status:in-progress') return JSON.stringify([{ number: 5 }, { number: 15 }]);
      return JSON.stringify([]);
    });
    const targets = collectBulkTargets({ execFileImpl });
    expect(targets).toEqual([5, 15, 20]);
    // KNOWN_STATUS_LABELS の件数ぶん検索している
    const listCalls = vi
      .mocked(execFileImpl)
      .mock.calls.filter((call) => call[1][0] === 'issue' && call[1][1] === 'list');
    expect(listCalls).toHaveLength(KNOWN_STATUS_LABELS.length);
  });
});

// #2506: bulk 実行が job timeout で SIGKILL され、どこまで進んだかも残らずに
// 終わっていた（実測 run 33355490164: 501 件中 407 件目で cancelled）。
// 予算内で安全に打ち切り、残件と再開点を返すことを両方向で固定する。
describe('runBulkStrip', () => {
  /** 呼ばれるたびに一定量だけ進む決定論的な clock。 */
  const clockAdvancingBy = (stepMs: number) => {
    let now = 0;
    return () => {
      const current = now;
      now += stepMs;
      return current;
    };
  };

  it('予算内なら全件処理し remaining 0 を返す', () => {
    const stripImpl = vi.fn(() => ['status:ready']);
    const result = runBulkStrip({
      targets: [1, 2, 3],
      budgetSeconds: 100,
      nowImpl: clockAdvancingBy(1000),
      stripImpl,
      logImpl: () => {},
    });
    expect(result).toEqual({ processed: 3, remaining: 0, lastProcessed: 3 });
    expect(stripImpl).toHaveBeenCalledTimes(3);
  });

  it('予算超過で打ち切り、残件と最後に処理した番号を返す', () => {
    const stripImpl = vi.fn(() => ['status:ready']);
    // clock は呼ばれるたび 2 秒進む。予算 5 秒なので 0s/2s/4s の 3 回は通り、
    // 6s の判定で打ち切られる。
    const result = runBulkStrip({
      targets: [10, 20, 30, 40, 50],
      budgetSeconds: 5,
      nowImpl: clockAdvancingBy(2000),
      stripImpl,
      logImpl: () => {},
    });
    expect(result.processed).toBeLessThan(5);
    expect(result.remaining).toBe(5 - result.processed);
    expect(result.lastProcessed).toBe([10, 20, 30, 40, 50][result.processed - 1]);
    expect(stripImpl).toHaveBeenCalledTimes(result.processed);
  });

  it('1 件も処理できない予算なら processed 0 / lastProcessed undefined を返す', () => {
    const stripImpl = vi.fn(() => []);
    const result = runBulkStrip({
      targets: [1, 2],
      budgetSeconds: 0.001,
      nowImpl: clockAdvancingBy(1000),
      stripImpl,
      logImpl: () => {},
    });
    expect(result).toEqual({ processed: 0, remaining: 2, lastProcessed: undefined });
    expect(stripImpl).not.toHaveBeenCalled();
  });

  it('既定の予算は nightly.yml の timeout-minutes より短い', () => {
    // timeout-minutes: 10（= 600 秒）。予算ちょうどだと最後の 1 件の処理中に
    // SIGKILL され打ち切り報告ごと消えるため、余白が要る。
    expect(DEFAULT_BULK_BUDGET_SECONDS).toBeLessThan(600);
  });
});

describe('formatBulkInterruption', () => {
  it('最後に処理した番号を --resume-from に載せた再開コマンドを含める', () => {
    const report = formatBulkInterruption({ processed: 407, remaining: 94, lastProcessed: 2242 });
    expect(report).toContain('407 件で打ち切りました');
    expect(report).toContain('残り 94 件');
    expect(report).toContain(
      'node scripts/ci/strip-status-labels.mjs bulk --execute --resume-from 2242',
    );
  });

  it('1 件も処理できなかった場合は resume-from を付けず、原因の当たりを添える', () => {
    const report = formatBulkInterruption({
      processed: 0,
      remaining: 12,
      lastProcessed: undefined,
    });
    expect(report).toContain('1 件も処理できませんでした');
    expect(report).not.toContain('--resume-from');
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  collectBulkTargets,
  findClosedIssuesWithStatusLabel,
  KNOWN_STATUS_LABELS,
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

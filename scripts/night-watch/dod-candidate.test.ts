import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchYesterdayMergedPrs,
  findTodayBoardIssue,
  runDodCandidateSelect,
} from './dod-candidate.mjs';

/** `.find()` の結果が無ければ即失敗させる（テストの意図を明確にする）。 */
function mustFind<T>(items: T[], predicate: (item: T) => boolean): T {
  const found = items.find(predicate);
  if (!found) throw new Error('該当する呼び出しが見つかりません');
  return found;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-24T01:00:00Z')); // JST 2026-08-24 10:00 → 前日は 2026-08-23
});

afterEach(() => {
  vi.useRealTimers();
});

describe('findTodayBoardIssue', () => {
  it('本日タイトルの盤面 issue を返す', () => {
    const execFileImpl = vi.fn(() =>
      JSON.stringify([
        { number: 100, title: '盤面 2026-08-23' },
        { number: 200, title: '盤面 2026-08-24' },
      ]),
    );
    expect(findTodayBoardIssue({ execFileImpl })).toEqual({
      number: 200,
      title: '盤面 2026-08-24',
    });
  });

  it('見つからなければ null を返す', () => {
    const execFileImpl = vi.fn(() => JSON.stringify([]));
    expect(findTodayBoardIssue({ execFileImpl })).toBeNull();
  });
});

describe('fetchYesterdayMergedPrs', () => {
  it('gh pr list --search を正しい flag（--search は既存 bug の unknown flag ではない）で呼ぶ', () => {
    const execFileImpl = vi.fn(() => '[]');
    fetchYesterdayMergedPrs({ execFileImpl });

    expect(execFileImpl).toHaveBeenCalledWith(
      'gh',
      [
        'pr',
        'list',
        '--repo',
        'Dayopt/dayopt',
        '--search',
        'is:merged merged:2026-08-23T00:00:00+09:00..2026-08-23T23:59:59+09:00',
        '--state',
        'merged',
        '--json',
        'number,title',
        '--limit',
        '30',
      ],
      { encoding: 'utf8' },
    );
  });
});

describe('runDodCandidateSelect', () => {
  it('当日盤面 issue が無ければ例外を投げる', () => {
    const execFileImpl = vi.fn(() => '[]');
    expect(() => runDodCandidateSelect({ execFileImpl })).toThrow(/盤面 issue が見つかりません/);
  });

  it('候補 0 件なら「前日merge PR無し」を当日盤面 issue へコメントする', () => {
    const execFileImpl = vi.fn((cmd, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return JSON.stringify([{ number: 200, title: '盤面 2026-08-24' }]);
      }
      if (args[0] === 'pr' && args[1] === 'list') {
        return '[]';
      }
      if (args[0] === 'issue' && args[1] === 'comment') {
        return 'https://github.com/Dayopt/dayopt/issues/200#issuecomment-1\n';
      }
      throw new Error(`unexpected args: ${JSON.stringify(args)}`);
    });

    const result = runDodCandidateSelect({ execFileImpl });

    expect(result).toEqual({ boardIssueNumber: 200, candidateCount: 0, selected: null });
    const commentCall = mustFind(execFileImpl.mock.calls, (call) => call[1][1] === 'comment');
    expect(commentCall[1]).toEqual([
      'issue',
      'comment',
      '200',
      '--repo',
      'Dayopt/dayopt',
      '--body',
      'DoD候補: 前日merge PR無し',
    ]);
  });

  it('候補があれば決定的でない選定で 1 件を当日盤面 issue へコメントする', () => {
    const candidates = [
      { number: 300, title: 'PR A' },
      { number: 301, title: 'PR B' },
    ];
    const execFileImpl = vi.fn((cmd, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return JSON.stringify([{ number: 200, title: '盤面 2026-08-24' }]);
      }
      if (args[0] === 'pr' && args[1] === 'list') {
        return JSON.stringify(candidates);
      }
      if (args[0] === 'issue' && args[1] === 'comment') {
        return 'https://github.com/Dayopt/dayopt/issues/200#issuecomment-2\n';
      }
      throw new Error(`unexpected args: ${JSON.stringify(args)}`);
    });

    // randomImpl を固定し、2 件中 2 件目（index 1）が選ばれることを検証する
    const result = runDodCandidateSelect({ execFileImpl, randomImpl: () => 0.99 });

    expect(result).toEqual({ boardIssueNumber: 200, candidateCount: 2, selected: candidates[1] });
    const commentCall = mustFind(execFileImpl.mock.calls, (call) => call[1][1] === 'comment');
    expect(commentCall[1]).toEqual([
      'issue',
      'comment',
      '200',
      '--repo',
      'Dayopt/dayopt',
      '--body',
      'DoD監査候補: #301（PR B）',
    ]);
  });
});

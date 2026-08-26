import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GH_MAX_BUFFER_BYTES } from './lib.mjs';

import {
  fetchWeekendCatchUpMergedPrs,
  fetchYesterdayMergedPrs,
  runDodCandidateSelect,
} from './dod-candidate.mjs';

/** `.find()` の結果が無ければ即失敗させる（テストの意図を明確にする）。 */
function mustFind<T>(items: T[], predicate: (item: T) => boolean): T {
  const found = items.find(predicate);
  if (!found) throw new Error('該当する呼び出しが見つかりません');
  return found;
}

// 2026-08-25（火曜）を既定にする。2026-08-24 は JST 月曜のため、月曜専用ロジック
// （fetchWeekendCatchUpMergedPrs への分岐）と汎用ロジックのテストを混同しないよう、
// 汎用テストは非月曜・非週末の日付を使う。月曜固有の挙動は専用 describe で扱う。
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-25T01:00:00Z')); // JST 2026-08-25 10:00（火）→ 前日は 2026-08-24
});

afterEach(() => {
  vi.useRealTimers();
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
        'is:merged merged:2026-08-24T00:00:00+09:00..2026-08-24T23:59:59+09:00',
        '--state',
        'merged',
        '--json',
        'number,title',
        '--limit',
        '30',
      ],
      { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER_BYTES },
    );
  });
});

// #2334 コメント: 盤面 issue の起票が平日のみになったため、Step 4 も土日は
// skip する。月曜だけ金〜日の 3 日分の窓へ拡張する。
describe('fetchWeekendCatchUpMergedPrs（月曜専用の金〜日 3 日分窓）', () => {
  it('月曜日を基準に金〜日の JST 日境界レンジで検索する', () => {
    vi.setSystemTime(new Date('2026-08-24T01:00:00Z')); // JST 2026-08-24（月）
    const execFileImpl = vi.fn(() => '[]');

    fetchWeekendCatchUpMergedPrs({ execFileImpl });

    expect(execFileImpl).toHaveBeenCalledWith(
      'gh',
      [
        'pr',
        'list',
        '--repo',
        'Dayopt/dayopt',
        '--search',
        'is:merged merged:2026-08-21T00:00:00+09:00..2026-08-23T23:59:59+09:00',
        '--state',
        'merged',
        '--json',
        'number,title',
        '--limit',
        '30',
      ],
      { encoding: 'utf8', maxBuffer: GH_MAX_BUFFER_BYTES },
    );
  });
});

describe('runDodCandidateSelect', () => {
  it('当日盤面 issue が無ければ例外を投げる', () => {
    const execFileImpl = vi.fn(() => '[]');
    expect(() => runDodCandidateSelect({ execFileImpl })).toThrow(/盤面 issue が見つかりません/);
  });

  // #2334 コメント: 盤面 issue の起票が平日のみになったため、土日は当日盤面
  // issue が存在しない。gh を一切呼ばず skip する。
  it.each([
    ['土曜日', '2026-08-22T01:00:00Z'],
    ['日曜日', '2026-08-23T01:00:00Z'],
  ])('%s（JST）は gh を一切呼ばず skip する', (_label, isoDate) => {
    vi.setSystemTime(new Date(isoDate));
    const execFileImpl = vi.fn(() => {
      throw new Error('gh を呼んではいけない（weekend skip は gh 呼び出し前に判定する）');
    });

    const result = runDodCandidateSelect({ execFileImpl });

    expect(result).toEqual({ action: 'skipped', reason: 'weekend' });
    expect(execFileImpl).not.toHaveBeenCalled();
  });

  // 月曜は fetchYesterdayMergedPrs（前日=日曜のみの単日窓）ではなく
  // fetchWeekendCatchUpMergedPrs（金〜日の3日分）が呼ばれることを、
  // runDodCandidateSelect 経由（実際の分岐込み）で確認する。
  it('月曜日は金〜日の3日分の窓で検索する（fetchYesterdayMergedPrs の単日窓ではない）', () => {
    vi.setSystemTime(new Date('2026-08-24T01:00:00Z')); // JST 2026-08-24（月）
    const execFileImpl = vi.fn((cmd, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return JSON.stringify([{ number: 200, title: '盤面 2026-08-24' }]);
      }
      if (args[0] === 'pr' && args[1] === 'list') return '[]';
      if (args[0] === 'issue' && args[1] === 'comment') {
        return 'https://github.com/Dayopt/dayopt/issues/200#issuecomment-1\n';
      }
      throw new Error(`unexpected args: ${JSON.stringify(args)}`);
    });

    runDodCandidateSelect({ execFileImpl });

    const prListCall = mustFind(
      execFileImpl.mock.calls,
      (call) => call[1][0] === 'pr' && call[1][1] === 'list',
    );
    expect(prListCall[1]).toContain(
      'is:merged merged:2026-08-21T00:00:00+09:00..2026-08-23T23:59:59+09:00',
    );
  });

  it('候補 0 件なら「前日merge PR無し」を当日盤面 issue へコメントする', () => {
    const execFileImpl = vi.fn((cmd, args) => {
      if (args[0] === 'issue' && args[1] === 'list') {
        return JSON.stringify([{ number: 200, title: '盤面 2026-08-25' }]);
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
        return JSON.stringify([{ number: 200, title: '盤面 2026-08-25' }]);
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

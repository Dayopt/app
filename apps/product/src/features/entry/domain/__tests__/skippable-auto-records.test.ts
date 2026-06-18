import { describe, expect, it } from 'vitest';

import { findSkippableAutoRecords, type SkippableCandidate } from '../skippable-auto-records';

const NOW = new Date('2026-03-12T12:00:00Z');
const ms = (iso: string) => new Date(iso).getTime();

// 新規の予定外記録の range: 10:00–11:00（過去）
const RANGE_START = ms('2026-03-12T10:00:00Z');
const RANGE_END = ms('2026-03-12T11:00:00Z');

/** 過去の planned・actual 未編集・未スキップ = 自動記録。 */
function autoRecord(id: string, start: string, end: string): SkippableCandidate {
  return {
    id,
    origin: 'planned',
    start_time: start,
    end_time: end,
    actual_start_time: null,
    actual_end_time: null,
    skipped_at: null,
  };
}

function run(candidates: SkippableCandidate[], isUnplannedRecord = true): string[] {
  return findSkippableAutoRecords({
    rangeStartMs: RANGE_START,
    rangeEndMs: RANGE_END,
    isUnplannedRecord,
    candidates,
    now: NOW,
  });
}

describe('findSkippableAutoRecords', () => {
  it('完全に包含される自動記録だけなら その id を返す', () => {
    expect(run([autoRecord('a', '2026-03-12T10:15:00Z', '2026-03-12T10:45:00Z')])).toEqual(['a']);
  });

  it('確定済み実績と衝突したら空配列（実績トリムに誘導）', () => {
    const confirmed: SkippableCandidate = {
      id: 'b',
      origin: 'planned',
      start_time: '2026-03-12T10:00:00Z',
      end_time: '2026-03-12T11:00:00Z',
      actual_start_time: '2026-03-12T10:10:00Z',
      actual_end_time: '2026-03-12T10:40:00Z',
      skipped_at: null,
    };
    expect(run([confirmed])).toEqual([]);
  });

  it('部分的にしか重ならない自動記録は空配列', () => {
    // 開始が range 外（09:30）のため完全包含ではない
    expect(run([autoRecord('c', '2026-03-12T09:30:00Z', '2026-03-12T10:30:00Z')])).toEqual([]);
  });

  it('重ならない自動記録は無視し、包含されるものだけ返す', () => {
    const candidates = [
      autoRecord('far', '2026-03-12T08:00:00Z', '2026-03-12T09:00:00Z'),
      autoRecord('in', '2026-03-12T10:10:00Z', '2026-03-12T10:50:00Z'),
    ];
    expect(run(candidates)).toEqual(['in']);
  });

  it('新規が予定外記録でなければ（planned / 未来）空配列', () => {
    expect(run([autoRecord('a', '2026-03-12T10:15:00Z', '2026-03-12T10:45:00Z')], false)).toEqual(
      [],
    );
  });

  it('skipped / 未来の planned は実績なしとして無視する', () => {
    const skipped: SkippableCandidate = {
      id: 's',
      origin: 'planned',
      start_time: '2026-03-12T10:15:00Z',
      end_time: '2026-03-12T10:45:00Z',
      actual_start_time: null,
      actual_end_time: null,
      skipped_at: '2026-03-12T11:30:00Z',
    };
    const future = autoRecord('f', '2026-03-12T13:00:00Z', '2026-03-12T13:30:00Z');
    const contained = autoRecord('in', '2026-03-12T10:10:00Z', '2026-03-12T10:50:00Z');
    expect(run([skipped, future, contained])).toEqual(['in']);
  });
});

import { describe, expect, it } from 'vitest';

import { aggregateTagPlanCounts, aggregateTagStats } from '../tag-stats';

describe('aggregateTagStats', () => {
  it('空配列 → 空 Record 2 つ', () => {
    expect(aggregateTagStats([])).toEqual({ counts: {}, lastUsed: {} });
  });

  it('null 入力 → 空 Record 2 つ', () => {
    expect(aggregateTagStats(null)).toEqual({ counts: {}, lastUsed: {} });
  });

  it('undefined 入力 → 空 Record 2 つ', () => {
    expect(aggregateTagStats(undefined)).toEqual({ counts: {}, lastUsed: {} });
  });

  it('全 row に last_used → 両 Record に全 tag を含む', () => {
    const result = aggregateTagStats([
      { tag_id: 'tag-1', record_count: 5, last_used: '2026-04-20' },
      { tag_id: 'tag-2', record_count: 3, last_used: '2026-04-22' },
    ]);
    expect(result).toEqual({
      counts: { 'tag-1': 5, 'tag-2': 3 },
      lastUsed: { 'tag-1': '2026-04-20', 'tag-2': '2026-04-22' },
    });
  });

  it('last_used が null の row → lastUsed から除外、counts には含む', () => {
    const result = aggregateTagStats([
      { tag_id: 'tag-1', record_count: 5, last_used: '2026-04-20' },
      { tag_id: 'tag-2', record_count: 2, last_used: null },
    ]);
    expect(result).toEqual({
      counts: { 'tag-1': 5, 'tag-2': 2 },
      lastUsed: { 'tag-1': '2026-04-20' },
    });
  });

  it('全 row の last_used が null → lastUsed は空', () => {
    const result = aggregateTagStats([
      { tag_id: 'tag-1', record_count: 1, last_used: null },
      { tag_id: 'tag-2', record_count: 0, last_used: null },
    ]);
    expect(result.counts).toEqual({ 'tag-1': 1, 'tag-2': 0 });
    expect(result.lastUsed).toEqual({});
  });

  it('同 tag_id が複数現れた場合は後勝ち', () => {
    const result = aggregateTagStats([
      { tag_id: 'tag-1', record_count: 5, last_used: '2026-04-20' },
      { tag_id: 'tag-1', record_count: 7, last_used: '2026-04-22' },
    ]);
    expect(result).toEqual({
      counts: { 'tag-1': 7 },
      lastUsed: { 'tag-1': '2026-04-22' },
    });
  });

  it('record_count=0 でも counts に含まれる', () => {
    const result = aggregateTagStats([
      { tag_id: 'tag-1', record_count: 0, last_used: '2026-04-20' },
    ]);
    expect(result.counts).toEqual({ 'tag-1': 0 });
    expect(result.lastUsed).toEqual({ 'tag-1': '2026-04-20' });
  });
});

describe('aggregateTagPlanCounts', () => {
  it('空配列 → 空 Record', () => {
    expect(aggregateTagPlanCounts([])).toEqual({});
  });

  it('null 入力 → 空 Record', () => {
    expect(aggregateTagPlanCounts(null)).toEqual({});
  });

  it('undefined 入力 → 空 Record', () => {
    expect(aggregateTagPlanCounts(undefined)).toEqual({});
  });

  it('1 Plan = 1 行として tag_id ごとに件数を数える', () => {
    const result = aggregateTagPlanCounts([
      { tag_id: 'tag-1' },
      { tag_id: 'tag-2' },
      { tag_id: 'tag-1' },
    ]);
    expect(result).toEqual({ 'tag-1': 2, 'tag-2': 1 });
  });

  it('aggregateTagStats と異なり、同 tag_id の複数行は加算する（後勝ちではない）', () => {
    const result = aggregateTagPlanCounts([
      { tag_id: 'tag-1' },
      { tag_id: 'tag-1' },
      { tag_id: 'tag-1' },
    ]);
    expect(result).toEqual({ 'tag-1': 3 });
  });
});

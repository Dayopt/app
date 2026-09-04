import { describe, expect, it } from 'vitest';

import { aggregateActivityPlanCounts, aggregateActivityStats } from './activity-stats';

describe('aggregateActivityStats', () => {
  it('空配列 → 空 Record 2 つ', () => {
    expect(aggregateActivityStats([])).toEqual({ counts: {}, lastUsed: {} });
  });

  it('null 入力 → 空 Record 2 つ', () => {
    expect(aggregateActivityStats(null)).toEqual({ counts: {}, lastUsed: {} });
  });

  it('undefined 入力 → 空 Record 2 つ', () => {
    expect(aggregateActivityStats(undefined)).toEqual({ counts: {}, lastUsed: {} });
  });

  it('全 row に last_used → 両 Record に全 activity を含む', () => {
    const result = aggregateActivityStats([
      { groupKey: 'activity-1', record_count: 5, last_used: '2026-04-20' },
      { groupKey: 'activity-2', record_count: 3, last_used: '2026-04-22' },
    ]);
    expect(result).toEqual({
      counts: { 'activity-1': 5, 'activity-2': 3 },
      lastUsed: { 'activity-1': '2026-04-20', 'activity-2': '2026-04-22' },
    });
  });

  it('last_used が null の row → lastUsed から除外、counts には含む', () => {
    const result = aggregateActivityStats([
      { groupKey: 'activity-1', record_count: 5, last_used: '2026-04-20' },
      { groupKey: 'activity-2', record_count: 2, last_used: null },
    ]);
    expect(result).toEqual({
      counts: { 'activity-1': 5, 'activity-2': 2 },
      lastUsed: { 'activity-1': '2026-04-20' },
    });
  });

  it('全 row の last_used が null → lastUsed は空', () => {
    const result = aggregateActivityStats([
      { groupKey: 'activity-1', record_count: 1, last_used: null },
      { groupKey: 'activity-2', record_count: 0, last_used: null },
    ]);
    expect(result.counts).toEqual({ 'activity-1': 1, 'activity-2': 0 });
    expect(result.lastUsed).toEqual({});
  });

  it('同 groupKey が複数現れた場合は後勝ち', () => {
    const result = aggregateActivityStats([
      { groupKey: 'activity-1', record_count: 5, last_used: '2026-04-20' },
      { groupKey: 'activity-1', record_count: 7, last_used: '2026-04-22' },
    ]);
    expect(result).toEqual({
      counts: { 'activity-1': 7 },
      lastUsed: { 'activity-1': '2026-04-22' },
    });
  });

  it('record_count=0 でも counts に含まれる', () => {
    const result = aggregateActivityStats([
      { groupKey: 'activity-1', record_count: 0, last_used: '2026-04-20' },
    ]);
    expect(result.counts).toEqual({ 'activity-1': 0 });
    expect(result.lastUsed).toEqual({ 'activity-1': '2026-04-20' });
  });
});

describe('aggregateActivityPlanCounts', () => {
  it('空配列 → 空 Record', () => {
    expect(aggregateActivityPlanCounts([])).toEqual({});
  });

  it('null 入力 → 空 Record', () => {
    expect(aggregateActivityPlanCounts(null)).toEqual({});
  });

  it('undefined 入力 → 空 Record', () => {
    expect(aggregateActivityPlanCounts(undefined)).toEqual({});
  });

  it('1 Plan = 1 行として groupKey ごとに件数を数える', () => {
    const result = aggregateActivityPlanCounts([
      { groupKey: 'activity-1' },
      { groupKey: 'activity-2' },
      { groupKey: 'activity-1' },
    ]);
    expect(result).toEqual({ 'activity-1': 2, 'activity-2': 1 });
  });

  it('aggregateActivityStats と異なり、同 groupKey の複数行は加算する（後勝ちではない）', () => {
    const result = aggregateActivityPlanCounts([
      { groupKey: 'activity-1' },
      { groupKey: 'activity-1' },
      { groupKey: 'activity-1' },
    ]);
    expect(result).toEqual({ 'activity-1': 3 });
  });
});

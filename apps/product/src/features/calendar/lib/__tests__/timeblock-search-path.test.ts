import { describe, expect, it } from 'vitest';

import { buildTimeblockSearchResultPath } from '../timeblock-search-path';

describe('buildTimeblockSearchResultPath', () => {
  it('ユーザーTZの日付とPlanインスペクターをURLへ含める', () => {
    expect(
      buildTimeblockSearchResultPath({
        locale: 'ja',
        startAt: '2026-07-14T15:30:00.000Z',
        timezone: 'Asia/Tokyo',
        timeblockId: 'plan-1',
        kind: 'plan',
      }),
    ).toBe('/ja/day?date=2026-07-15&timeblock=plan%3Aplan-1');
  });

  it('Recordの既存URL契約を使う', () => {
    expect(
      buildTimeblockSearchResultPath({
        locale: 'en',
        startAt: '2026-07-15T02:00:00.000Z',
        timezone: 'America/New_York',
        timeblockId: 'record-1',
        kind: 'record',
      }),
    ).toBe('/en/day?date=2026-07-14&timeblock=record%3Arecord-1');
  });
});

import { describe, expect, it } from 'vitest';

import { resolveTimeblockDayDiffBounds, resolveTimeblockRangeDiffBounds } from '../day-diff-bounds';

describe('day-diff-bounds', () => {
  it('日次 clipping 境界はユーザー timezone の表示日で作る', () => {
    const bounds = resolveTimeblockDayDiffBounds(
      new Date('2026-06-18T12:00:00.000Z'),
      'Asia/Tokyo',
    );

    expect(bounds.dayStart.toISOString()).toBe('2026-06-17T15:00:00.000Z');
    expect(bounds.dayEnd.toISOString()).toBe('2026-06-18T15:00:00.000Z');
  });

  it('複数日 clipping 境界は表示範囲の先頭日から末尾日までで作る', () => {
    const bounds = resolveTimeblockRangeDiffBounds(
      new Date('2026-06-18T12:00:00.000Z'),
      new Date('2026-06-20T12:00:00.000Z'),
      'Asia/Tokyo',
    );

    expect(bounds.dayStart.toISOString()).toBe('2026-06-17T15:00:00.000Z');
    expect(bounds.dayEnd.toISOString()).toBe('2026-06-20T15:00:00.000Z');
  });
});

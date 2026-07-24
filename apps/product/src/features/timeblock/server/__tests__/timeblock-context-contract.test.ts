import { describe, expect, it } from 'vitest';

import {
  TIMEBLOCK_CONTEXT_MAX_RANGE_MS,
  timeblockContextRangeSchema,
} from '../timeblock-context-contract';

describe('timeblockContextRangeSchema', () => {
  it('offset付きISOとexact 31日rangeを受理する', () => {
    const startDate = '2026-01-01T00:00:00+09:00';
    const endDate = new Date(Date.parse(startDate) + TIMEBLOCK_CONTEXT_MAX_RANGE_MS).toISOString();

    expect(timeblockContextRangeSchema.safeParse({ startDate, endDate }).success).toBe(true);
  });

  it.each([
    {
      label: 'unknown field',
      input: {
        startDate: '2026-01-01T00:00:00+09:00',
        endDate: '2026-01-02T00:00:00+09:00',
        userId: 'foreign-user',
      },
    },
    {
      label: 'offsetのない日時',
      input: {
        startDate: '2026-01-01T00:00:00',
        endDate: '2026-01-02T00:00:00+09:00',
      },
    },
    {
      label: '逆転range',
      input: {
        startDate: '2026-01-02T00:00:00+09:00',
        endDate: '2026-01-01T00:00:00+09:00',
      },
    },
    {
      label: '31日超過',
      input: {
        startDate: '2026-01-01T00:00:00+09:00',
        endDate: '2026-02-01T00:00:00.001+09:00',
      },
    },
  ])('$labelを拒否する', ({ input }) => {
    expect(timeblockContextRangeSchema.safeParse(input).success).toBe(false);
  });
});

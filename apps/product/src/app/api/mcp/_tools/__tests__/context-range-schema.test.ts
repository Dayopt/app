import { describe, expect, it } from 'vitest';

import {
  TIMEBLOCK_CONTEXT_MAX_RANGE_MS,
  timeblockContextRangeSchema,
} from '@/features/timeblock/server/service-index';

import { MCP_CONTEXT_RANGE_SCHEMA } from '../context-range-schema';

const startDate = '2026-01-01T00:00:00+09:00';

describe('MCP context range schema parity', () => {
  it.each([
    {
      label: 'offset付きの1日range',
      input: { startDate, endDate: '2026-01-02T00:00:00+09:00' },
    },
    {
      label: 'colonなしoffset付きの1日range',
      input: {
        startDate: '2026-01-01T00:00:00+0900',
        endDate: '2026-01-02T00:00:00+0900',
      },
    },
    {
      label: 'exact 31日range',
      input: {
        startDate,
        endDate: new Date(Date.parse(startDate) + TIMEBLOCK_CONTEXT_MAX_RANGE_MS).toISOString(),
      },
    },
  ])('$labelをservice schemaと同じく受理する', ({ input }) => {
    expect(MCP_CONTEXT_RANGE_SCHEMA.safeParse(input).success).toBe(
      timeblockContextRangeSchema.safeParse(input).success,
    );
    expect(MCP_CONTEXT_RANGE_SCHEMA.safeParse(input).success).toBe(true);
  });

  it.each([
    {
      label: '同時刻range',
      input: { startDate, endDate: startDate },
    },
    {
      label: '逆転range',
      input: {
        startDate: '2026-01-02T00:00:00+09:00',
        endDate: startDate,
      },
    },
    {
      label: '31日超過',
      input: {
        startDate,
        endDate: new Date(Date.parse(startDate) + TIMEBLOCK_CONTEXT_MAX_RANGE_MS + 1).toISOString(),
      },
    },
    {
      label: 'offsetなし',
      input: {
        startDate: '2026-01-01T00:00:00',
        endDate: '2026-01-02T00:00:00+09:00',
      },
    },
    {
      label: 'unknown key',
      input: {
        startDate,
        endDate: '2026-01-02T00:00:00+09:00',
        userId: 'foreign-user',
      },
    },
  ])('$labelをservice schemaと同じく拒否する', ({ input }) => {
    expect(MCP_CONTEXT_RANGE_SCHEMA.safeParse(input).success).toBe(
      timeblockContextRangeSchema.safeParse(input).success,
    );
    expect(MCP_CONTEXT_RANGE_SCHEMA.safeParse(input).success).toBe(false);
  });
});

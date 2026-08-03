import { z } from 'zod';

import { TIMEBLOCK_CONTEXT_MAX_RANGE_MS } from '@/features/timeblock/server/service-index';

import { MCP_TIMEBLOCK_TIMESTAMP_SCHEMA } from './timeblock-timestamp-schema';

export const MCP_CONTEXT_RANGE_SCHEMA = z
  .object({
    startDate: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
    endDate: MCP_TIMEBLOCK_TIMESTAMP_SCHEMA,
  })
  .strict()
  .superRefine((range, context) => {
    const start = Date.parse(range.startDate);
    const end = Date.parse(range.endDate);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    if (start >= end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'endDate must be after startDate',
        path: ['endDate'],
      });
      return;
    }

    if (end - start > TIMEBLOCK_CONTEXT_MAX_RANGE_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Date range must not exceed 31 days',
        path: ['endDate'],
      });
    }
  });

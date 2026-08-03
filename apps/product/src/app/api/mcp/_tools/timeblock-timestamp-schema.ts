import { z } from 'zod';

import { isTimeblockDateTime } from '@/features/timeblock/server/service-index';

/**
 * `.datetime({ offset: true })` と同じ受理集合を service 層の contract から借りる。
 *
 * zod v3 classic には `.meta()` が無いので、JSON Schema の `format` は
 * `.describe()` で人間可読なヒントとして伝える（MCP client は description を読む）。
 */
export const MCP_TIMEBLOCK_TIMESTAMP_SCHEMA = z
  .string()
  .refine(isTimeblockDateTime, { message: 'Invalid datetime' })
  .describe('ISO 8601 date-time with a UTC offset');

import { z } from 'zod-v4';

import { isTimeblockDateTime } from '@/features/timeblock/server/service-index';

export const MCP_TIMEBLOCK_TIMESTAMP_SCHEMA = z
  .string()
  .refine(isTimeblockDateTime, { message: 'Invalid datetime' })
  .meta({ format: 'date-time' });

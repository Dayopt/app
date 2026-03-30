/**
 * Entries Router
 *
 * Core operations (entries.ts) と Statistics (statistics.ts) と Tag Statistics (tag-statistics.ts) を統合。
 */

import { mergeRouters } from '@/platform/trpc/procedures';

import { entriesCoreRouter } from './router';
import { entriesStatisticsRouter } from './statistics';
import { entriesTagStatisticsRouter } from './tag-statistics';

export const entriesRouter = mergeRouters(
  entriesCoreRouter,
  entriesStatisticsRouter,
  entriesTagStatisticsRouter,
);

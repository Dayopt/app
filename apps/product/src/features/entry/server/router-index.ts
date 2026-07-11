/**
 * Statistics Router
 *
 * Statistics (statistics.ts) と Tag Statistics (tag-statistics.ts) を統合。
 */

import { mergeRouters } from '@/lib/trpc/procedures';

import { entriesStatisticsRouter } from './statistics';
import { entriesTagStatisticsRouter } from './tag-statistics';

export const statisticsRouter = mergeRouters(entriesStatisticsRouter, entriesTagStatisticsRouter);

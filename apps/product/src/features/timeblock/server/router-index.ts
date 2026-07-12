/**
 * Statistics Router
 *
 * Statistics (statistics.ts) と Tag Statistics (tag-statistics.ts) を統合。
 */

import { mergeRouters } from '@/lib/trpc/procedures';

import { statisticsQueriesRouter } from './statistics';
import { tagStatisticsRouter } from './tag-statistics';

export const statisticsRouter = mergeRouters(statisticsQueriesRouter, tagStatisticsRouter);

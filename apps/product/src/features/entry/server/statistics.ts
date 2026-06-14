import { mergeRouters } from '@/lib/trpc/procedures';

import { entriesStatisticsGeneralRouter } from './statistics-general-router';
import { entriesStatisticsKpiRouter } from './statistics-kpi-router';
import { entriesStatisticsSummaryRouter } from './statistics-summary-router';

/** エントリ統計・分析用tRPCルーター */
export const entriesStatisticsRouter = mergeRouters(
  entriesStatisticsGeneralRouter,
  entriesStatisticsKpiRouter,
  entriesStatisticsSummaryRouter,
);

import { mergeRouters } from '@/lib/trpc/procedures';

import { statisticsGeneralRouter } from './statistics-general-router';
import { statisticsKpiRouter } from './statistics-kpi-router';
import { statisticsSummaryRouter } from './statistics-summary-router';

/** エントリ統計・分析用tRPCルーター */
export const statisticsQueriesRouter = mergeRouters(
  statisticsGeneralRouter,
  statisticsKpiRouter,
  statisticsSummaryRouter,
);

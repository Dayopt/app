/**
 * tRPCメインルーター
 * 全APIルーターの統合とエクスポート
 */

import 'server-only';

import { userRouter } from '@/features/auth/server/router';
import { contactRouter } from '@/features/contact/server/router';
import { externalCalendarRouter } from '@/features/external-calendar/server/router';
import { billingRouter } from '@/features/settings/server/billing-router';
import { userSettingsRouter } from '@/features/settings/server/router';
import { tagsRouter } from '@/features/tags/server/router';
import { planCommandsRouter } from '@/features/timeblock/server/plan-commands-router';
import { plansRouter } from '@/features/timeblock/server/plans-router';
import { recordCommandsRouter } from '@/features/timeblock/server/record-commands-router';
import { recordsRouter } from '@/features/timeblock/server/records-router';
import { statisticsRouter } from '@/features/timeblock/server/router-index';
import { emailRouter } from '@/lib/email/router';
import { createTRPCRouter } from '@/lib/trpc/router';

export const appRouter = createTRPCRouter({
  billing: billingRouter,
  contact: contactRouter,
  email: emailRouter,
  externalCalendar: externalCalendarRouter,
  planCommands: planCommandsRouter,
  recordCommands: recordCommandsRouter,
  records: recordsRouter,
  plans: plansRouter,
  statistics: statisticsRouter,
  tags: tagsRouter,
  user: userRouter,
  userSettings: userSettingsRouter,
});

export type AppRouter = typeof appRouter;

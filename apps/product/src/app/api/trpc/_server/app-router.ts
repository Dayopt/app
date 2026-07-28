/**
 * tRPCメインルーター
 * 全APIルーターの統合とエクスポート
 */

import 'server-only';

import { createUserRouter } from '@/features/auth/server/router';
import { contactRouter } from '@/features/contact/server/router';
import {
  deleteAllUserDataWithCalendarAuthority,
  prepareUserDataPurgeWithCalendarAuthority,
} from '@/features/external-calendar/server/account-deletion';
import { externalCalendarRouter } from '@/features/external-calendar/server/router';
import { billingRouter } from '@/features/settings/server/billing-router';
import { userSettingsRouter } from '@/features/settings/server/router';
import { tagsRouter } from '@/features/tags/server/router';
import { plansRouter } from '@/features/timeblock/server/plans-router';
import { recordsRouter } from '@/features/timeblock/server/records-router';
import { statisticsRouter } from '@/features/timeblock/server/router-index';
import { timeblockContextRouter } from '@/features/timeblock/server/timeblock-context-router';
import { emailRouter } from '@/lib/email/router';
import { createTRPCRouter } from '@/lib/trpc/router';

import { prepareAccountDeletionBeforeIdentityDeletion } from './_composition/account-deletion-coordinator';

const userRouter = createUserRouter({
  beforeIdentityDeletion: prepareAccountDeletionBeforeIdentityDeletion,
  deleteAllData: deleteAllUserDataWithCalendarAuthority,
  prepareDeleteAllData: prepareUserDataPurgeWithCalendarAuthority,
});

export const appRouter = createTRPCRouter({
  billing: billingRouter,
  contact: contactRouter,
  email: emailRouter,
  externalCalendar: externalCalendarRouter,
  records: recordsRouter,
  plans: plansRouter,
  statistics: statisticsRouter,
  tags: tagsRouter,
  timeblockContext: timeblockContextRouter,
  user: userRouter,
  userSettings: userSettingsRouter,
});

export type AppRouter = typeof appRouter;

/**
 * tRPCメインルーター
 * 全APIルーターの統合とエクスポート
 */

import 'server-only';

import { userRouter } from '@/features/auth/server/router';
import { contactRouter } from '@/features/contact/server/router';
import { logsRouter } from '@/features/entry/server/logs-router';
import { plansRouter } from '@/features/entry/server/plans-router';
import { entriesRouter } from '@/features/entry/server/router-index';
import { billingRouter } from '@/features/settings/server/billing-router';
import { userSettingsRouter } from '@/features/settings/server/router';
import { tagsRouter } from '@/features/tags/server/router';
import { emailRouter } from '@/lib/email/router';
import { createTRPCRouter } from '@/lib/trpc/procedures';

/**
 * メインAPIルーター
 */
export const appRouter = createTRPCRouter({
  billing: billingRouter,
  contact: contactRouter,
  email: emailRouter,
  entries: entriesRouter,
  logs: logsRouter,
  plans: plansRouter,
  tags: tagsRouter,
  user: userRouter,
  userSettings: userSettingsRouter,
});

/**
 * AppRouter型のエクスポート
 * クライアント側で型推論に使用
 */
export type AppRouter = typeof appRouter;

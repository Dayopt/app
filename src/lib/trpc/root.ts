/**
 * tRPCメインルーター
 * 全APIルーターの統合とエクスポート
 */

import 'server-only';

import { userRouter } from '@/features/auth/server/router';
import { contactRouter } from '@/features/contact/server/router';
import { entriesRouter } from '@/features/entry/server/router-index';
import { notificationsRouter } from '@/features/notifications/server/router';
import { onboardingRouter } from '@/features/onboarding/server/router';
import { billingRouter } from '@/features/settings/server/billing-router';
import { userSettingsRouter } from '@/features/settings/server/router';
import { badgesRouter } from '@/features/stats/server/badges-router';
import { tagsRouter } from '@/features/tags/server/router';
import { emailRouter } from '@/lib/email/router';
import { createTRPCRouter } from '@/lib/trpc/procedures';

/**
 * メインAPIルーター
 */
export const appRouter = createTRPCRouter({
  badges: badgesRouter,
  billing: billingRouter,
  contact: contactRouter,
  email: emailRouter,
  entries: entriesRouter,
  tags: tagsRouter,
  user: userRouter,
  notifications: notificationsRouter,
  onboarding: onboardingRouter,
  userSettings: userSettingsRouter,
});

/**
 * AppRouter型のエクスポート
 * クライアント側で型推論に使用
 */
export type AppRouter = typeof appRouter;

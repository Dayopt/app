/**
 * tRPCメインルーター
 * 全APIルーターの統合とエクスポート
 */

import { suggestionsRouter } from '@/features/ai/server/suggestions-router';
import { userRouter } from '@/features/auth/server/router';
import { contactRouter } from '@/features/contact/server/router';
import { entriesRouter } from '@/features/entry/server/router-index';
import { emailRouter } from '@/features/notifications/server/email-router';
import { notificationPreferencesRouter } from '@/features/notifications/server/preferences-router';
import { notificationsRouter } from '@/features/notifications/server/router';
import { onboardingRouter } from '@/features/onboarding/server/router';
import { paletteRouter } from '@/features/palette/server/router';
import { billingRouter } from '@/features/settings/server/billing-router';
import { userSettingsRouter } from '@/features/settings/server/router';
import { tagsRouter } from '@/features/tags/server/router';
import { createTRPCRouter } from '@/platform/trpc/procedures';

/**
 * メインAPIルーター
 */
export const appRouter = createTRPCRouter({
  billing: billingRouter,
  contact: contactRouter,
  email: emailRouter,
  entries: entriesRouter,
  palette: paletteRouter,
  suggestions: suggestionsRouter,
  tags: tagsRouter,
  user: userRouter,
  notifications: notificationsRouter,
  notificationPreferences: notificationPreferencesRouter,
  onboarding: onboardingRouter,
  userSettings: userSettingsRouter,
});

/**
 * AppRouter型のエクスポート
 * クライアント側で型推論に使用
 */
export type AppRouter = typeof appRouter;

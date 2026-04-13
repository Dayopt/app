/**
 * NotificationPreferences Router Integration Tests
 *
 * 通知設定の統合テスト
 * - 設定取得（デフォルト値）
 * - ブラウザ通知ON/OFF
 * - メール通知ON/OFF
 * - プッシュ通知ON/OFF
 * - リマインダー時間の更新
 */

import { createClient } from '@supabase/supabase-js';
import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { notificationPreferencesRouter } from '@/features/notifications/server/preferences-router';
import type { Database } from '@/lib/database.types';
import { createTestCaller } from '@/lib/test/trpc-test-helpers';
import type { Context } from '@/lib/trpc/procedures';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SUPABASE_URL =
  process.env.USE_LOCAL_DB === 'true'
    ? LOCAL_DB_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL || LOCAL_DB_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TEST_USER_ID = crypto.randomUUID();
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe.skipIf(SKIP_INTEGRATION)('NotificationPreferences Router Integration', () => {
  let adminSupabase: ReturnType<typeof createClient<Database>>;
  let supabase: ReturnType<typeof createClient<Database>>;
  let ctx: Context;

  const TEST_EMAIL = `test-notif-prefs-${TEST_USER_ID}@example.com`;
  const TEST_PASSWORD = 'test-password-123';

  beforeAll(async () => {
    adminSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await adminSupabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { username: `testuser_notif_prefs_${Date.now()}` },
      id: TEST_USER_ID,
    });

    if (authError && !authError.message.includes('already exists')) {
      throw new Error(`Failed to create test user: ${authError.message}`);
    }

    await adminSupabase.from('profiles').upsert({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      username: `testuser_notif_prefs_${Date.now()}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    supabase = createClient<Database>(
      SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });

    if (signInError) {
      throw new Error(`Failed to sign in test user: ${signInError.message}`);
    }
  });

  afterAll(async () => {
    await adminSupabase.from('notification_preferences').delete().eq('user_id', TEST_USER_ID);
    await supabase.auth.signOut();
    await adminSupabase.auth.admin.deleteUser(TEST_USER_ID);
  });

  beforeEach(async () => {
    // 各テスト前に設定をリセット
    await adminSupabase.from('notification_preferences').delete().eq('user_id', TEST_USER_ID);

    ctx = {
      req: {
        headers: {},
        cookies: {},
        socket: { remoteAddress: '127.0.0.1' },
      } as Context['req'],
      res: {
        setHeader: () => {},
        end: () => {},
      } as unknown as Context['res'],
      userId: TEST_USER_ID,
      sessionId: 'test-session-id',
      supabase: supabase,
      authMode: 'session' as const,
    };
  });

  describe('Get Preferences', () => {
    it('should return default values for new user', async () => {
      const caller = createTestCaller(notificationPreferencesRouter, ctx);

      const result = await caller.get();

      expect(result).toBeDefined();
      expect(result.defaultReminderMinutes).toBe(10);
      expect(result.enableBrowserNotifications).toBe(true);
      expect(result.enableEmailNotifications).toBe(false);
      expect(result.enablePushNotifications).toBe(false);
    });
  });

  describe('Update Browser Notifications', () => {
    it('should disable browser notifications', async () => {
      const caller = createTestCaller(notificationPreferencesRouter, ctx);

      const result = await caller.updateBrowserNotifications({ enabled: false });
      expect(result.success).toBe(true);

      const prefs = await caller.get();
      expect(prefs.enableBrowserNotifications).toBe(false);
    });

    it('should enable browser notifications', async () => {
      const caller = createTestCaller(notificationPreferencesRouter, ctx);

      await caller.updateBrowserNotifications({ enabled: false });
      await caller.updateBrowserNotifications({ enabled: true });

      const prefs = await caller.get();
      expect(prefs.enableBrowserNotifications).toBe(true);
    });
  });

  describe('Update Email Notifications', () => {
    it('should enable email notifications', async () => {
      const caller = createTestCaller(notificationPreferencesRouter, ctx);

      const result = await caller.updateEmailNotifications({ enabled: true });
      expect(result.success).toBe(true);

      const prefs = await caller.get();
      expect(prefs.enableEmailNotifications).toBe(true);
    });

    it('should disable email notifications', async () => {
      const caller = createTestCaller(notificationPreferencesRouter, ctx);

      await caller.updateEmailNotifications({ enabled: true });
      await caller.updateEmailNotifications({ enabled: false });

      const prefs = await caller.get();
      expect(prefs.enableEmailNotifications).toBe(false);
    });
  });

  describe('Update Push Notifications', () => {
    it('should enable push notifications', async () => {
      const caller = createTestCaller(notificationPreferencesRouter, ctx);

      const result = await caller.updatePushNotifications({ enabled: true });
      expect(result.success).toBe(true);

      const prefs = await caller.get();
      expect(prefs.enablePushNotifications).toBe(true);
    });

    it('should disable push notifications', async () => {
      const caller = createTestCaller(notificationPreferencesRouter, ctx);

      await caller.updatePushNotifications({ enabled: true });
      await caller.updatePushNotifications({ enabled: false });

      const prefs = await caller.get();
      expect(prefs.enablePushNotifications).toBe(false);
    });
  });

  describe('Update Default Reminder Minutes', () => {
    it('should update default reminder minutes', async () => {
      const caller = createTestCaller(notificationPreferencesRouter, ctx);

      const result = await caller.updateDefaultReminderMinutes({ minutes: 30 });

      expect(result.success).toBe(true);

      const prefs = await caller.get();
      expect(prefs.defaultReminderMinutes).toBe(30);
    });

    it('should accept minimum value (0 minutes)', async () => {
      const caller = createTestCaller(notificationPreferencesRouter, ctx);

      const result = await caller.updateDefaultReminderMinutes({ minutes: 0 });
      expect(result.success).toBe(true);
    });
  });

  describe('Authorization', () => {
    it('should not allow unauthenticated access to get', async () => {
      const unauthenticatedCtx = { ...ctx, userId: undefined };
      const caller = createTestCaller(notificationPreferencesRouter, unauthenticatedCtx);

      await expect(caller.get()).rejects.toThrow(TRPCError);
    });

    it('should not allow unauthenticated access to updateBrowserNotifications', async () => {
      const unauthenticatedCtx = { ...ctx, userId: undefined };
      const caller = createTestCaller(notificationPreferencesRouter, unauthenticatedCtx);

      await expect(caller.updateBrowserNotifications({ enabled: true })).rejects.toThrow(TRPCError);
    });

    it('should not allow unauthenticated access to updateEmailNotifications', async () => {
      const unauthenticatedCtx = { ...ctx, userId: undefined };
      const caller = createTestCaller(notificationPreferencesRouter, unauthenticatedCtx);

      await expect(caller.updateEmailNotifications({ enabled: true })).rejects.toThrow(TRPCError);
    });

    it('should not allow unauthenticated access to updatePushNotifications', async () => {
      const unauthenticatedCtx = { ...ctx, userId: undefined };
      const caller = createTestCaller(notificationPreferencesRouter, unauthenticatedCtx);

      await expect(caller.updatePushNotifications({ enabled: true })).rejects.toThrow(TRPCError);
    });

    it('should not allow unauthenticated access to updateDefaultReminderMinutes', async () => {
      const unauthenticatedCtx = { ...ctx, userId: undefined };
      const caller = createTestCaller(notificationPreferencesRouter, unauthenticatedCtx);

      await expect(caller.updateDefaultReminderMinutes({ minutes: 15 })).rejects.toThrow(TRPCError);
    });
  });
});

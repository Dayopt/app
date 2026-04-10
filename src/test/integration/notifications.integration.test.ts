/**
 * Notifications Router Integration Tests
 *
 * 通知機能の統合テスト
 * - CRUD操作
 * - 既読化
 * - 一括操作
 * - 認可
 */

import { createClient } from '@supabase/supabase-js';
import { TRPCError } from '@trpc/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { notificationsRouter } from '@/features/notifications/server/router';
import type { Database } from '@/lib/database.types';
import type { Context } from '@/lib/trpc/procedures';
import { createTestCaller } from '@/test/trpc-test-helpers';

const LOCAL_DB_URL = 'http://127.0.0.1:54321';
const SUPABASE_URL =
  process.env.USE_LOCAL_DB === 'true'
    ? LOCAL_DB_URL
    : process.env.NEXT_PUBLIC_SUPABASE_URL || LOCAL_DB_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const TEST_USER_ID = crypto.randomUUID();
const TEST_PLAN_ID = crypto.randomUUID();
const SKIP_INTEGRATION = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe.skipIf(SKIP_INTEGRATION)('Notifications Router Integration', () => {
  let adminSupabase: ReturnType<typeof createClient<Database>>;
  let supabase: ReturnType<typeof createClient<Database>>;
  let ctx: Context;
  const createdNotificationIds: string[] = [];

  const TEST_EMAIL = `test-notifications-${TEST_USER_ID}@example.com`;
  const TEST_PASSWORD = 'test-password-123';

  beforeAll(async () => {
    adminSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { error: authError } = await adminSupabase.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { username: `testuser_notifications_${Date.now()}` },
      id: TEST_USER_ID,
    });

    if (authError && !authError.message.includes('already exists')) {
      throw new Error(`Failed to create test user: ${authError.message}`);
    }

    await adminSupabase.from('profiles').upsert({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      username: `testuser_notifications_${Date.now()}`,
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
    if (createdNotificationIds.length > 0) {
      await adminSupabase.from('notifications').delete().in('id', createdNotificationIds);
    }
    await supabase.auth.signOut();
    await adminSupabase.auth.admin.deleteUser(TEST_USER_ID);
  });

  beforeEach(() => {
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

  describe('CRUD Operations', () => {
    it('should create a notification', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      const result = await caller.create({
        type: 'reminder',
        plan_id: TEST_PLAN_ID,
      });

      expect(result).toBeDefined();
      expect(result.type).toBe('reminder');
      expect(result.is_read).toBe(false);

      createdNotificationIds.push(result.id);
    });

    it('should list notifications', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      const created = await caller.create({
        type: 'reminder',
        plan_id: TEST_PLAN_ID,
      });
      createdNotificationIds.push(created.id);

      const result = await caller.list();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result.some((n) => n.id === created.id)).toBe(true);
    });

    it('should get notification by id', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      const created = await caller.create({
        type: 'reminder',
        plan_id: TEST_PLAN_ID,
      });
      createdNotificationIds.push(created.id);

      const result = await caller.getById({ id: created.id });

      expect(result).toBeDefined();
      expect(result.id).toBe(created.id);
    });

    it('should delete a notification', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      const created = await caller.create({
        type: 'reminder',
        plan_id: TEST_PLAN_ID,
      });

      const deleted = await caller.delete({ id: created.id });

      expect(deleted).toBeDefined();

      await expect(caller.getById({ id: created.id })).rejects.toThrow();
    });
  });

  describe('Read Status Operations', () => {
    it('should get unread count', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      const created = await caller.create({
        type: 'reminder',
        plan_id: TEST_PLAN_ID,
      });
      createdNotificationIds.push(created.id);

      const result = await caller.unreadCount();

      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it('should mark notification as read', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      const created = await caller.create({
        type: 'reminder',
        plan_id: TEST_PLAN_ID,
      });
      createdNotificationIds.push(created.id);

      const result = await caller.markAsRead({ id: created.id });

      expect(result.is_read).toBe(true);
    });

    it('should mark all notifications as read', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      for (let i = 0; i < 3; i++) {
        const n = await caller.create({
          type: 'reminder',
          plan_id: TEST_PLAN_ID,
        });
        createdNotificationIds.push(n.id);
      }

      const result = await caller.markAllAsRead();

      expect(result).toBeDefined();
    });

    it('should filter notifications by read status', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      const unreadResult = await caller.list({ is_read: false });

      unreadResult.forEach((n) => {
        expect(n.is_read).toBe(false);
      });
    });
  });

  describe('Authorization', () => {
    it('should not allow unauthenticated access', async () => {
      const unauthenticatedCtx = { ...ctx, userId: undefined };
      const caller = createTestCaller(notificationsRouter, unauthenticatedCtx);

      await expect(caller.list()).rejects.toThrow(TRPCError);
    });
  });

  describe('Filtering', () => {
    it('should filter by notification type', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      const reminder = await caller.create({
        type: 'reminder',
        plan_id: TEST_PLAN_ID,
      });
      createdNotificationIds.push(reminder.id);

      const result = await caller.list({ type: 'reminder' });

      result.forEach((n) => {
        expect(n.type).toBe('reminder');
      });
    });

    it('should respect limit parameter', async () => {
      const caller = createTestCaller(notificationsRouter, ctx);

      for (let i = 0; i < 5; i++) {
        const n = await caller.create({
          type: 'reminder',
          plan_id: TEST_PLAN_ID,
        });
        createdNotificationIds.push(n.id);
      }

      const result = await caller.list({ limit: 3 });

      expect(result.length).toBeLessThanOrEqual(3);
    });
  });
});

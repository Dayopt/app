import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { calendarSyncNowRateLimit } from '@/lib/rate-limit/upstash';
import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, proProcedure, protectedProcedure } from '@/lib/trpc/procedures';

import {
  disconnect,
  getSyncStatus,
  listConnections,
  listProviderCalendars,
  updateSelectedCalendars,
} from './connection-service';
import { isGoogleCalendarConfigured, resolveRedirectUri } from './google-oauth';
import { syncConnection } from './sync-service';

/**
 * 外部カレンダー接続の tRPC router（overview.md §7-2）。
 *
 * 読み取り 4 本は protectedProcedure、provider を叩く / 書き込む 3 本は proProcedure
 * （課金ゲート。`BILLING_ENFORCED` off の間は素通り）。ghost 用 `listEvents` / `dismiss` は
 * 次 project の予約席なのでここには置かない。
 */

const connectionIdInput = z.object({ connectionId: z.string().uuid() });

const connectionAvailabilityInput = z.object({
  origin: z
    .string()
    .url()
    .refine(
      (value) => {
        const url = new URL(value);
        return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
      },
      { message: 'origin must be an http(s) origin without a path' },
    ),
});

const updateSelectedCalendarsInput = z.object({
  connectionId: z.string().uuid(),
  calendars: z
    .array(
      z.object({
        providerCalendarId: z.string().min(1).max(1024),
        calendarName: z.string().max(1024).nullish(),
      }),
    )
    .max(50),
});

/** 手動同期の per-user rate limit。upstash 未設定なら素通り（fallback は route 側に無い）。 */
async function enforceSyncNowRateLimit(userId: string): Promise<void> {
  if (!calendarSyncNowRateLimit) return;

  let success: boolean;
  try {
    ({ success } = await calendarSyncNowRateLimit.limit(userId));
  } catch (error) {
    throw new TRPCError({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Calendar sync rate-limit service is unavailable',
      cause: error,
    });
  }

  if (!success) {
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many manual syncs. Please try again later.',
    });
  }
}

export const externalCalendarRouter = createTRPCRouter({
  getConnectionAvailability: protectedProcedure
    .meta({ description: '現在の origin で Google カレンダー接続を開始できるか' })
    .input(connectionAvailabilityInput)
    .query(({ input }) => {
      if (!isGoogleCalendarConfigured()) return { available: false };

      const requestUrl = new URL(input.origin);
      const redirectUri = resolveRedirectUri(requestUrl);
      return {
        available: redirectUri !== null && new URL(redirectUri).origin === requestUrl.origin,
      };
    }),

  listConnections: protectedProcedure
    .meta({ description: '外部カレンダー接続一覧' })
    .query(async ({ ctx }) => {
      try {
        return await listConnections(ctx.supabase, ctx.userId);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  getSyncStatus: protectedProcedure
    .meta({ description: '接続の同期状況（接続 + 選択カレンダー）' })
    .input(connectionIdInput)
    .query(async ({ ctx, input }) => {
      try {
        return await getSyncStatus(ctx.supabase, ctx.userId, input.connectionId);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  listProviderCalendars: proProcedure
    .meta({ description: 'provider のカレンダー一覧をオンデマンド取得' })
    .input(connectionIdInput)
    .query(async ({ ctx, input }) => {
      try {
        return await listProviderCalendars(ctx.userId, input.connectionId);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  updateSelectedCalendars: proProcedure
    .meta({ description: '取り込むカレンダーの選択を差し替え、即時同期する' })
    .input(updateSelectedCalendarsInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await updateSelectedCalendars(
          ctx.userId,
          input.connectionId,
          input.calendars.map((calendar) => ({
            providerCalendarId: calendar.providerCalendarId,
            calendarName: calendar.calendarName ?? null,
          })),
        );
        // ユーザーが待つ導線なので即時 full sync を kick する（overview.md §6-1）。
        return await syncConnection({ connectionId: input.connectionId, userId: ctx.userId });
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  syncNow: proProcedure
    .meta({ description: '今すぐ同期（rate-limited）' })
    .input(connectionIdInput)
    .mutation(async ({ ctx, input }) => {
      await enforceSyncNowRateLimit(ctx.userId);
      try {
        return await syncConnection({ connectionId: input.connectionId, userId: ctx.userId });
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  disconnect: protectedProcedure
    .meta({ description: '接続を切断（解約済みでも実行できる）' })
    .input(connectionIdInput)
    .mutation(async ({ ctx, input }) => {
      try {
        await disconnect(ctx.userId, input.connectionId);
        return { success: true as const };
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});

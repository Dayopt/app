/**
 * tRPC Router: Notifications
 *
 * リマインダー通知管理API
 */

import { handleServiceError } from '@/platform/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/platform/trpc/procedures';
import { listNotificationsSchema, markAllAsReadSchema, notificationIdSchema } from '../schemas';
import { createNotificationService } from './service-index';

export const notificationsRouter = createTRPCRouter({
  /**
   * 通知一覧取得
   */
  list: protectedProcedure
    .input(listNotificationsSchema.optional())
    .query(async ({ ctx, input }) => {
      const service = createNotificationService(ctx.supabase);

      try {
        const options: Parameters<typeof service.list>[0] = {
          userId: ctx.userId,
        };
        if (input?.is_read !== undefined) options.isRead = input.is_read;
        if (input?.type !== undefined) options.type = input.type;
        if (input?.limit !== undefined) options.limit = input.limit;
        if (input?.offset !== undefined) options.offset = input.offset;

        return await service.list(options);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * 未読数取得
   */
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const service = createNotificationService(ctx.supabase);

    try {
      return await service.getUnreadCount(ctx.userId);
    } catch (error) {
      return handleServiceError(error);
    }
  }),

  /**
   * 通知詳細取得
   */
  getById: protectedProcedure.input(notificationIdSchema).query(async ({ ctx, input }) => {
    const service = createNotificationService(ctx.supabase);

    try {
      return await service.getById(ctx.userId, input.id);
    } catch (error) {
      return handleServiceError(error);
    }
  }),

  /**
   * 既読化（単一）
   */
  markAsRead: protectedProcedure.input(notificationIdSchema).mutation(async ({ ctx, input }) => {
    const service = createNotificationService(ctx.supabase);

    try {
      return await service.markAsRead(ctx.userId, input.id);
    } catch (error) {
      return handleServiceError(error);
    }
  }),

  /**
   * 一括既読化
   */
  markAllAsRead: protectedProcedure
    .input(markAllAsReadSchema.optional())
    .mutation(async ({ ctx, input }) => {
      const service = createNotificationService(ctx.supabase);

      try {
        const options: Parameters<typeof service.markAllAsRead>[0] = {
          userId: ctx.userId,
        };
        if (input?.type !== undefined) options.type = input.type;

        return await service.markAllAsRead(options);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * 通知削除（単一）
   */
  delete: protectedProcedure.input(notificationIdSchema).mutation(async ({ ctx, input }) => {
    const service = createNotificationService(ctx.supabase);

    try {
      return await service.delete(ctx.userId, input.id);
    } catch (error) {
      return handleServiceError(error);
    }
  }),

  /**
   * 既読通知を全削除
   */
  deleteAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const service = createNotificationService(ctx.supabase);

    try {
      return await service.deleteAllRead(ctx.userId);
    } catch (error) {
      return handleServiceError(error);
    }
  }),
});

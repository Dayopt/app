/**
 * tRPC Router: Notifications
 *
 * リマインダー通知管理API
 */

import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import { listNotificationsSchema, markAllAsReadSchema, notificationIdSchema } from '../schemas';
import { createNotificationService } from './service-index';

/** 通知 CRUD を提供する tRPC ルーター */
export const notificationsRouter = createTRPCRouter({
  /**
   * 通知一覧取得
   */
  list: protectedProcedure
    .meta({ description: '通知一覧取得（フィルタ・ページネーション対応）' })
    .input(listNotificationsSchema.optional())
    .query(async ({ ctx, input }) => {
      const service = createNotificationService(ctx.supabase);

      try {
        const options: Parameters<typeof service.list>[0] = {
          userId: ctx.userId,
        };
        if (input?.unread_only !== undefined) options.unreadOnly = input.unread_only;
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
  unreadCount: protectedProcedure.meta({ description: '未読通知数取得' }).query(async ({ ctx }) => {
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
  getById: protectedProcedure
    .meta({ description: '通知詳細取得' })
    .input(notificationIdSchema)
    .query(async ({ ctx, input }) => {
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
  markAsRead: protectedProcedure
    .meta({ description: '通知を既読にする（単一）' })
    .input(notificationIdSchema)
    .mutation(async ({ ctx, input }) => {
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
    .meta({ description: '通知を一括既読にする' })
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
  delete: protectedProcedure
    .meta({ description: '通知削除（単一）' })
    .input(notificationIdSchema)
    .mutation(async ({ ctx, input }) => {
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
  deleteAllRead: protectedProcedure
    .meta({ description: '既読通知を全削除' })
    .mutation(async ({ ctx }) => {
      const service = createNotificationService(ctx.supabase);

      try {
        return await service.deleteAllRead(ctx.userId);
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});

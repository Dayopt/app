/**
 * User tRPC Router
 *
 * ユーザー管理のtRPCエンドポイント
 * REST API（src/app/api/user/*）をtRPC化
 *
 * エンドポイント:
 * - user.deleteAccount: アカウント即時削除
 * - user.deleteBlocks: 全ブロック（エントリ）を削除
 * - user.deleteAllData: 全データを削除（アカウント保持）
 * - user.exportData: ユーザーデータエクスポート
 * - user.verifyRecoveryCode: リカバリーコードでMFA認証（MFA無効化 + ログイン許可）
 */

import { z } from 'zod';

import { isValidRecoveryCodeFormat } from '@/lib/auth/recovery-codes';
import { captureBusinessEvent } from '@/lib/sentry';
import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import { createRecoveryService } from './recovery-service';
import { createUserService, UserServiceError } from './user-service';

/** ユーザー管理のtRPCルーター（アカウント削除・データ削除・エクスポート・MFA） */
export const userRouter = createTRPCRouter({
  /**
   * アカウント即時削除
   * auth.users 削除 → CASCADE DELETE で全データ削除
   */
  deleteAccount: protectedProcedure
    .meta({ description: 'アカウント即時削除（CASCADE DELETE）' })
    .input(
      z.object({
        password: z.string().min(1),
        confirmText: z.literal('DELETE'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // ユーザー情報取得
        const {
          data: { user },
          error: authError,
        } = await ctx.supabase.auth.getUser();

        if (authError || !user || !user.email) {
          throw new UserServiceError('UNAUTHORIZED', 'Authentication required');
        }

        const service = createUserService(ctx.supabase);
        const result = await service.deleteAccount({
          userId: ctx.userId!,
          userEmail: user.email,
          password: input.password,
          confirmText: input.confirmText,
        });

        captureBusinessEvent('account.deleted', {}, 'warning');
        return result;
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * 全ブロック（エントリ）を削除
   * タグ・設定は保持
   */
  deleteBlocks: protectedProcedure
    .meta({ description: '全エントリを削除（タグ・設定は保持）' })
    .input(z.object({ confirmText: z.literal('DELETE') }))
    .mutation(async ({ ctx }) => {
      try {
        const service = createUserService(ctx.supabase);
        return await service.deleteBlocks(ctx.userId!);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * 全データを削除（アカウントは保持）
   */
  deleteAllData: protectedProcedure
    .meta({ description: '全データを削除（アカウントは保持）' })
    .input(z.object({ confirmText: z.literal('DELETE') }))
    .mutation(async ({ ctx }) => {
      try {
        const service = createUserService(ctx.supabase);
        return await service.deleteAllData(ctx.userId!);
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * ユーザーデータエクスポート
   * GDPR "Right to Data Portability" 準拠
   */
  exportData: protectedProcedure
    .meta({ description: 'ユーザーデータエクスポート（GDPR対応）' })
    .query(async ({ ctx }) => {
      try {
        const service = createUserService(ctx.supabase);
        const result = await service.exportData({
          userId: ctx.userId!,
        });

        return result;
      } catch (error) {
        return handleServiceError(error);
      }
    }),

  /**
   * リカバリーコードでMFA認証
   *
   * リカバリーコード検証成功時、MFA factorをunenrollしてAAL要件を解除する。
   * ユーザーは設定から再度MFAを有効化できる。
   */
  verifyRecoveryCode: protectedProcedure
    .meta({ description: 'リカバリーコードでMFA認証（MFA無効化 + ログイン許可）' })
    .input(
      z.object({
        code: z.string().refine((val) => isValidRecoveryCodeFormat(val), {
          message: 'Invalid recovery code format',
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await createRecoveryService(ctx.supabase).verify({
          userId: ctx.userId!,
          code: input.code,
        });
      } catch (error) {
        return handleServiceError(error);
      }
    }),
});

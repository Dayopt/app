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

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { isValidRecoveryCodeFormat, verifyRecoveryCode } from '@/lib/auth/recovery-codes';
import { logger } from '@/lib/logger';
import { captureBusinessEvent } from '@/lib/sentry';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, proProcedure, protectedProcedure } from '@/lib/trpc/procedures';
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
  exportData: proProcedure
    .meta({ description: 'ユーザーデータエクスポート（GDPR対応・Pro限定）' })
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
      const userId = ctx.userId!;

      // 未使用のリカバリーコードを取得
      const { data: codes, error: fetchError } = await ctx.supabase
        .from('mfa_recovery_codes')
        .select('id, code_hash')
        .eq('user_id', userId)
        .is('used_at', null);

      if (fetchError) {
        logger.error('Failed to fetch recovery codes:', fetchError);
        handleServiceError(fetchError);
      }

      if (!codes || codes.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'RECOVERY_EXHAUSTED',
        });
      }

      // タイミングセーフ比較で一致するコードを検索
      const matchedCode = codes.find((c) => verifyRecoveryCode(input.code, c.code_hash));

      if (!matchedCode) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'RECOVERY_INVALID',
        });
      }

      // コードを使用済みにマーク（RPC使用）
      const { data: used, error: rpcError } = await ctx.supabase.rpc('use_recovery_code', {
        p_user_id: userId,
        p_code_hash: matchedCode.code_hash,
      });

      if (rpcError || !used) {
        logger.error('Failed to mark recovery code as used:', rpcError);
        handleServiceError(rpcError ?? new Error('Failed to use recovery code'));
      }

      // MFA factorをunenrollしてAAL要件を解除
      // service roleクライアントでadmin APIを使用（AAL1セッションでも操作可能にする）
      try {
        const adminClient = createServiceRoleClient();
        const { data: factors } = await adminClient.auth.admin.mfa.listFactors({ userId });

        if (factors?.factors) {
          for (const factor of factors.factors) {
            if (factor.status === 'verified') {
              await adminClient.auth.admin.mfa.deleteFactor({
                userId,
                id: factor.id,
              });
            }
          }
        }
      } catch (err) {
        logger.error('Failed to unenroll MFA factor:', err);
        handleServiceError(err);
      }

      // 残りのコード数を取得
      const { data: remainingCount, error: countError } = await ctx.supabase.rpc(
        'count_unused_recovery_codes',
        {
          p_user_id: userId,
        },
      );

      if (countError) {
        logger.error('Failed to count remaining recovery codes:', countError);
        // リカバリーコード消費は成功しているため、カウント失敗は非致命的
      }

      return {
        success: true,
        remainingCodes: typeof remainingCount === 'number' ? remainingCount : 0,
      };
    }),
});

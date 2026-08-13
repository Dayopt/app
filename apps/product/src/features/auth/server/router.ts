/**
 * User tRPC Router
 *
 * ユーザー管理のtRPCエンドポイント
 * REST API（src/app/api/user/*）をtRPC化
 *
 * エンドポイント:
 * - user.deleteAccount: アカウント即時削除
 * - user.requestEmailChange: メールアドレス変更（パスワード再認証 + Secure Email Change）
 * - user.deleteBlocks: 全ブロック（エントリ）を削除
 * - user.deleteAllData: 全データを削除（アカウント保持）
 * - user.exportData: ユーザーデータエクスポート
 * - user.verifyRecoveryCode: リカバリーコードでMFA認証（MFA無効化 + ログイン許可）
 */

import { z } from 'zod';

import { hasPasswordIdentity } from '@/lib/auth/domain';
import { isValidRecoveryCodeFormat } from '@/lib/auth/recovery-codes';
import { observeAuthOperation } from '@/lib/sentry';
import { handleServiceError } from '@/lib/trpc/errors';
import { createTRPCRouter, protectedProcedure } from '@/lib/trpc/procedures';
import { getDisplayName } from '@/lib/user';
import { createRecoveryService } from './recovery-service';
import { createUserService, type UserServiceDependencies, UserServiceError } from './user-service';

/** ユーザー管理のtRPCルーター（アカウント削除・データ削除・エクスポート・MFA） */
export function createUserRouter(dependencies: UserServiceDependencies) {
  return createTRPCRouter({
    /**
     * アカウント即時削除
     * auth.users 削除 → CASCADE DELETE で全データ削除
     */
    deleteAccount: protectedProcedure
      .meta({ description: 'アカウント即時削除（CASCADE DELETE）' })
      .input(
        z.object({
          // パスワードを持たないユーザー（Google のみ）は送らない
          password: z.string().min(1).optional(),
          // パスワードを持たず MFA が有効なユーザーの再認証コード
          totpCode: z.string().min(6).max(10).optional(),
          confirmText: z.literal('DELETE'),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          // ユーザー情報取得
          const {
            data: { user },
            error: authError,
          } = await observeAuthOperation('delete_account_get_user', () =>
            ctx.supabase.auth.getUser(),
          );

          if (authError || !user || !user.email) {
            throw new UserServiceError('UNAUTHORIZED', 'Authentication required');
          }

          const service = createUserService(ctx.supabase, dependencies);
          const result = await service.deleteAccount({
            userId: ctx.userId!,
            userEmail: user.email,
            userName: getDisplayName(user, 'there'),
            password: input.password,
            totpCode: input.totpCode,
            // クライアント申告ではなく server 側の identity から判定する
            requiresPassword: hasPasswordIdentity(user),
            confirmText: input.confirmText,
          });

          return result;
        } catch (error) {
          return handleServiceError(error);
        }
      }),

    /**
     * メールアドレス変更（変更前パスワード再認証つき）
     *
     * 双方確認（Secure Email Change）は維持したまま、変更前パスワード再認証を追加する
     * 中間案（#2024）。パスワード検証と `updateUser` 実行を同一 server call 内で完結させ、
     * client がこの2つの間に割り込めないようにする（TOCTOU/gate-bypass 対策）。
     */
    requestEmailChange: protectedProcedure
      .meta({ description: 'メールアドレス変更（パスワード再認証 + Secure Email Change）' })
      .input(
        z.object({
          password: z.string().min(1),
          newEmail: z.string().email(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        try {
          const {
            data: { user },
            error: authError,
          } = await observeAuthOperation('request_email_change_get_user', () =>
            ctx.supabase.auth.getUser(),
          );

          if (authError || !user || !user.email) {
            throw new UserServiceError('UNAUTHORIZED', 'Authentication required');
          }

          // Google のみのユーザーはパスワードを持たない（変更させない仕様。
          // AccountSettings.tsx の canUsePassword 分岐が UI 導線を既にゲートしているが、
          // devtools からの直接呼び出しに対する defense-in-depth として server 側にも置く。
          //
          // code は UNAUTHORIZED ではなく REAUTH_UNAVAILABLE にする（authn ではなく authz の
          // 失敗であるため）。UNAUTHORIZED は query-client.ts の isAuthError に拾われ、
          // エラー文言が出る前に /auth/login へ強制遷移してしまう
          if (!hasPasswordIdentity(user)) {
            throw new UserServiceError('REAUTH_UNAVAILABLE', 'Password identity required');
          }

          const service = createUserService(ctx.supabase, dependencies);
          return await service.requestEmailChange({
            userId: ctx.userId!,
            currentEmail: user.email,
            newEmail: input.newEmail,
            password: input.password,
          });
        } catch (error) {
          return handleServiceError(error);
        }
      }),

    /**
     * 全ブロック（Plan / Record）を削除
     * タグ・設定は保持
     */
    deleteBlocks: protectedProcedure
      .meta({ description: '全Plan / Logを削除（タグ・設定は保持）' })
      .input(z.object({ confirmText: z.literal('DELETE') }))
      .mutation(async ({ ctx }) => {
        try {
          const service = createUserService(ctx.supabase, dependencies);
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
          const service = createUserService(ctx.supabase, dependencies);
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
          const service = createUserService(ctx.supabase, dependencies);
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
}

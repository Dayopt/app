import 'server-only';

/**
 * User Service
 *
 * ユーザー管理のビジネスロジック
 * tRPCルーターから呼び出されるサービス層
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, Row } from '@/lib/database';
import { logger } from '@/lib/logger';
import { getStripe } from '@/lib/stripe/client';
import { createServiceRoleClient } from '@/lib/supabase/oauth';
import { ServiceError } from '@/lib/trpc/errors';

/**
 * User Service エラー
 */
export class UserServiceError extends ServiceError {
  constructor(
    code:
      | 'DELETE_FAILED'
      | 'DELETE_DATA_FAILED'
      | 'EXPORT_FAILED'
      | 'UNAUTHORIZED'
      | 'INVALID_PASSWORD'
      | 'INVALID_INPUT',
    message: string,
  ) {
    super(code, message);
    this.name = 'UserServiceError';
  }
}

/**
 * アカウント削除オプション
 */
interface DeleteAccountOptions {
  userId: string;
  userEmail: string;
  password: string;
  confirmText: string;
}

/**
 * データエクスポートオプション
 */
interface ExportDataOptions {
  userId: string;
}

/**
 * アカウント削除レスポンス
 */
interface DeleteAccountResult {
  success: true;
}

/**
 * データエクスポートレスポンス
 */
interface ExportDataResult {
  exportedAt: string;
  userId: string;
  data: {
    profile: Row<'profiles'> | null;
    plans: Row<'plans'>[];
    logs: Row<'logs'>[];
    tags: Row<'tags'>[];
    userSettings: Row<'user_settings'> | null;
  };
}

/**
 * User Service ファクトリ
 */
export function createUserService(supabase: SupabaseClient<Database>) {
  return {
    /**
     * アカウント即時削除
     *
     * auth.users を削除すると CASCADE DELETE により
     * entries, tags 等すべてのユーザーデータが自動削除される
     */
    async deleteAccount(options: DeleteAccountOptions): Promise<DeleteAccountResult> {
      const { userId, userEmail, password, confirmText } = options;

      if (!password || !confirmText) {
        throw new UserServiceError('INVALID_INPUT', 'Password and confirmation text are required');
      }

      if (confirmText !== 'DELETE') {
        throw new UserServiceError('INVALID_INPUT', 'Confirmation text must be "DELETE"');
      }

      // パスワード確認
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password,
      });

      if (signInError) {
        throw new UserServiceError('INVALID_PASSWORD', 'Invalid password');
      }

      // Storage のアバター画像を削除
      try {
        const { data: files } = await supabase.storage.from('avatars').list(userId);
        if (files && files.length > 0) {
          const filePaths = files.map((f) => `${userId}/${f.name}`);
          await supabase.storage.from('avatars').remove(filePaths);
        }
      } catch (storageError) {
        logger.warn(
          'Failed to delete avatar files, continuing with account deletion',
          storageError,
        );
      }

      // Stripe サブスクリプション解約 + Customer 削除（GDPR対応）
      const stripe = getStripe();
      if (stripe) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

          const stripeCustomerId = (profile as Record<string, unknown> | null)
            ?.stripe_customer_id as string | null;

          if (stripeCustomerId) {
            // 全サブスクリプションを即時解約（active, trialing, past_due, paused）
            const subscriptions = await stripe.subscriptions.list({
              customer: stripeCustomerId,
            });
            for (const sub of subscriptions.data) {
              if (['active', 'trialing', 'past_due', 'paused'].includes(sub.status)) {
                await stripe.subscriptions.cancel(sub.id);
              }
            }

            // Customer 削除（支払い情報・請求書も削除）
            await stripe.customers.del(stripeCustomerId);
          }
        } catch (stripeError) {
          logger.warn(
            'Failed to cancel Stripe subscription, continuing with account deletion',
            stripeError,
          );
        }
      }

      // auth.users を削除 → CASCADE DELETE により全テーブルのユーザーデータが自動削除される
      const adminClient = createServiceRoleClient();
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

      if (deleteError) {
        throw new UserServiceError(
          'DELETE_FAILED',
          `Failed to delete account: ${deleteError.message}`,
        );
      }

      logger.info('Account deleted successfully', { userId });

      return { success: true };
    },

    /**
     * 全ブロック（plans / logs）を削除
     * タグ・設定・プロフィールは保持
     */
    async deleteBlocks(userId: string): Promise<{ deletedCount: number }> {
      const adminClient = createServiceRoleClient();
      let deletedCount = 0;

      // logs.plan_id は plans を参照するため、logs → plans の順で削除する。
      for (const table of ['logs', 'plans'] as const) {
        const { data: deleted, error } = await adminClient
          .from(table)
          .delete()
          .eq('user_id', userId)
          .select('id');
        if (error) {
          throw new UserServiceError(
            'DELETE_DATA_FAILED',
            `${table} deletion failed: ${error.message}`,
          );
        }
        deletedCount += deleted?.length ?? 0;
      }

      logger.info('Blocks deleted', { userId, count: deletedCount });
      return { deletedCount };
    },

    /**
     * 全データを削除（アカウントは保持）
     * plans, logs, tags, 設定を全削除
     */
    async deleteAllData(userId: string): Promise<{ success: true }> {
      const adminClient = createServiceRoleClient();
      // FK 依存順。service-role を使うが、全操作を認証済み userId で明示的に制限する。
      for (const table of ['logs', 'plans', 'tags', 'user_settings'] as const) {
        const { error } = await adminClient.from(table).delete().eq('user_id', userId);
        if (error) {
          throw new UserServiceError(
            'DELETE_DATA_FAILED',
            `${table} deletion failed: ${error.message}`,
          );
        }
      }

      logger.info('All user data deleted (account preserved)', { userId });
      return { success: true };
    },

    /**
     * ユーザーデータエクスポート
     * GDPR "Right to Data Portability" 準拠
     */
    async exportData(options: ExportDataOptions): Promise<ExportDataResult> {
      const { userId } = options;

      const adminClient = createServiceRoleClient();
      const [profileResult, plansResult, logsResult, tagsResult, userSettingsResult] =
        await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          adminClient.from('plans').select('*').eq('user_id', userId),
          adminClient.from('logs').select('*').eq('user_id', userId),
          supabase.from('tags').select('*').eq('user_id', userId),
          supabase.from('user_settings').select('*').eq('user_id', userId).single(),
        ]);

      if (profileResult.error && profileResult.error.code !== 'PGRST116') {
        throw new UserServiceError(
          'EXPORT_FAILED',
          `Profile fetch error: ${profileResult.error.message}`,
        );
      }
      if (plansResult.error) {
        throw new UserServiceError(
          'EXPORT_FAILED',
          `Plans fetch error: ${plansResult.error.message}`,
        );
      }
      if (logsResult.error) {
        throw new UserServiceError(
          'EXPORT_FAILED',
          `Logs fetch error: ${logsResult.error.message}`,
        );
      }
      if (tagsResult.error) {
        throw new UserServiceError(
          'EXPORT_FAILED',
          `Tags fetch error: ${tagsResult.error.message}`,
        );
      }
      return {
        exportedAt: new Date().toISOString(),
        userId,
        data: {
          profile: profileResult.data || null,
          plans: plansResult.data || [],
          logs: logsResult.data || [],
          tags: tagsResult.data || [],
          userSettings: userSettingsResult.data || null,
        },
      };
    },
  };
}

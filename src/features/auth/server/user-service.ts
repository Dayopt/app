/**
 * User Service
 *
 * ユーザー管理のビジネスロジック
 * tRPCルーターから呼び出されるサービス層
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/database.types';
import { logger } from '@/lib/logger';
import { getStripe } from '@/platform/stripe/client';
import { createServiceRoleClient } from '@/platform/supabase/oauth';

/**
 * User Service エラー
 */
export class UserServiceError extends Error {
  constructor(
    public code:
      | 'DELETE_FAILED'
      | 'DELETE_DATA_FAILED'
      | 'EXPORT_FAILED'
      | 'UNAUTHORIZED'
      | 'INVALID_PASSWORD'
      | 'INVALID_INPUT',
    message: string,
  ) {
    super(message);
    this.name = 'UserServiceError';
  }
}

/**
 * アカウント削除オプション
 */
export interface DeleteAccountOptions {
  userId: string;
  userEmail: string;
  password: string;
  confirmText: string;
}

/**
 * データエクスポートオプション
 */
export interface ExportDataOptions {
  userId: string;
}

/**
 * アカウント削除レスポンス
 */
export interface DeleteAccountResult {
  success: true;
}

/** テーブル行型のエイリアス */
type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];

/**
 * データエクスポートレスポンス
 */
export interface ExportDataResult {
  exportedAt: string;
  userId: string;
  data: {
    profile: Row<'profiles'> | null;
    entries: Row<'entries'>[];
    tags: Row<'tags'>[];
    entryTags: Row<'entry_tags'>[];
    notificationPreferences: Row<'notification_preferences'> | null;
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
     * entries, tags, notifications 等すべてのユーザーデータが自動削除される
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

      // Service Role クライアントで CASCADE 対象外のPIIデータを削除
      const adminClient = createServiceRoleClient();

      try {
        // login_attempts: email基準でCASCADE対象外
        await adminClient.from('login_attempts').delete().eq('email', userEmail);
        // auth_audit_logs: ON DELETE SET NULL でIP/UA等のPIIが残存するため手動削除
        await adminClient.from('auth_audit_logs').delete().eq('user_id', userId);
      } catch (cleanupError) {
        logger.warn(
          'Failed to delete PII from non-cascaded tables, continuing with account deletion',
          cleanupError,
        );
      }

      // auth.users を削除 → CASCADE DELETE により全テーブルのユーザーデータが自動削除される
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
     * 全ブロック（entries + entry_tags + 関連activities）を削除
     * タグ・設定・プロフィールは保持
     */
    async deleteBlocks(userId: string): Promise<{ deletedCount: number }> {
      // entry_tags → entry_activities → entries の順で削除
      // RLSがuser_idで制約しているため、他ユーザーのデータは影響しない
      const { error: tagError } = await supabase.from('entry_tags').delete().eq('user_id', userId);
      if (tagError) {
        throw new UserServiceError(
          'DELETE_DATA_FAILED',
          `entry_tags deletion failed: ${tagError.message}`,
        );
      }

      const { error: actError } = await supabase
        .from('entry_activities')
        .delete()
        .eq('user_id', userId);
      if (actError) {
        throw new UserServiceError(
          'DELETE_DATA_FAILED',
          `entry_activities deletion failed: ${actError.message}`,
        );
      }

      const { data: deleted, error: entryError } = await supabase
        .from('entries')
        .delete()
        .eq('user_id', userId)
        .select('id');
      if (entryError) {
        throw new UserServiceError(
          'DELETE_DATA_FAILED',
          `entries deletion failed: ${entryError.message}`,
        );
      }

      logger.info('Blocks deleted', { userId, count: deleted?.length ?? 0 });
      return { deletedCount: deleted?.length ?? 0 };
    },

    /**
     * 全データを削除（アカウントは保持）
     * entries, tags, 設定, 通知設定を全削除
     */
    async deleteAllData(userId: string): Promise<{ success: true }> {
      // 依存関係順に削除: entry_tags → activities → instances → entries → tags → settings
      const { error: etError } = await supabase.from('entry_tags').delete().eq('user_id', userId);
      if (etError) {
        throw new UserServiceError(
          'DELETE_DATA_FAILED',
          `entry_tags deletion failed: ${etError.message}`,
        );
      }

      const { error: eaError } = await supabase
        .from('entry_activities')
        .delete()
        .eq('user_id', userId);
      if (eaError) {
        throw new UserServiceError(
          'DELETE_DATA_FAILED',
          `entry_activities deletion failed: ${eaError.message}`,
        );
      }

      const { error: entryError } = await supabase.from('entries').delete().eq('user_id', userId);
      if (entryError) {
        throw new UserServiceError(
          'DELETE_DATA_FAILED',
          `entries deletion failed: ${entryError.message}`,
        );
      }

      const { error: tagError } = await supabase.from('tags').delete().eq('user_id', userId);
      if (tagError) {
        throw new UserServiceError(
          'DELETE_DATA_FAILED',
          `tags deletion failed: ${tagError.message}`,
        );
      }

      const { error: settingsError } = await supabase
        .from('user_settings')
        .delete()
        .eq('user_id', userId);
      if (settingsError) {
        throw new UserServiceError(
          'DELETE_DATA_FAILED',
          `user_settings deletion failed: ${settingsError.message}`,
        );
      }

      const { error: notifError } = await supabase
        .from('notification_preferences')
        .delete()
        .eq('user_id', userId);
      if (notifError) {
        throw new UserServiceError(
          'DELETE_DATA_FAILED',
          `notification_preferences deletion failed: ${notifError.message}`,
        );
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

      const [
        profileResult,
        entriesResult,
        tagsResult,
        entryTagsResult,
        notificationPreferencesResult,
        userSettingsResult,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).single(),
        supabase.from('entries').select('*').eq('user_id', userId),
        supabase.from('tags').select('*').eq('user_id', userId),
        supabase.from('entry_tags').select('*').eq('user_id', userId),
        supabase.from('notification_preferences').select('*').eq('user_id', userId).single(),
        supabase.from('user_settings').select('*').eq('user_id', userId).single(),
      ]);

      if (profileResult.error && profileResult.error.code !== 'PGRST116') {
        throw new UserServiceError(
          'EXPORT_FAILED',
          `Profile fetch error: ${profileResult.error.message}`,
        );
      }
      if (entriesResult.error) {
        throw new UserServiceError(
          'EXPORT_FAILED',
          `Entries fetch error: ${entriesResult.error.message}`,
        );
      }
      if (tagsResult.error) {
        throw new UserServiceError(
          'EXPORT_FAILED',
          `Tags fetch error: ${tagsResult.error.message}`,
        );
      }
      if (entryTagsResult.error) {
        throw new UserServiceError(
          'EXPORT_FAILED',
          `Entry tags fetch error: ${entryTagsResult.error.message}`,
        );
      }

      return {
        exportedAt: new Date().toISOString(),
        userId,
        data: {
          profile: profileResult.data || null,
          entries: entriesResult.data || [],
          tags: tagsResult.data || [],
          entryTags: entryTagsResult.data || [],
          notificationPreferences: notificationPreferencesResult.data || null,
          userSettings: userSettingsResult.data || null,
        },
      };
    },
  };
}

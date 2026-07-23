import 'server-only';

/**
 * User Service
 *
 * ユーザー管理のビジネスロジック
 * tRPCルーターから呼び出されるサービス層
 */

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database, PublicRecordRow, PublicUserSettingsRow, Row } from '@/lib/database';
import { databaseTables, publicRecordSelect, publicUserSettingsSelect } from '@/lib/database';
import { logger } from '@/lib/logger';
import {
  captureUnexpectedDatabaseError,
  captureUnexpectedError,
  observeAuthOperation,
} from '@/lib/sentry';
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
      | 'FETCH_FAILED'
      | 'UNAUTHORIZED'
      | 'INVALID_PASSWORD'
      | 'INVALID_INPUT'
      | 'CONFLICT'
      | 'NOT_FOUND',
    message: string,
    options?: ErrorOptions,
  ) {
    super(code, message);
    this.name = 'UserServiceError';
    if (options?.cause !== undefined) this.cause = options.cause;
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

function isRetryableDatabaseContention(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === '40P01' || error.code === '55P03' || error.code === '57014')
  );
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
    records: PublicRecordRow[];
    tags: Row<'tags'>[];
    userSettings: PublicUserSettingsRow | null;
  };
}

interface OAuthConnectionSummary {
  id: string;
  clientId: string;
  scopes: string[];
  authorizedAt: string;
  lastUsedAt: string | null;
}

const OAUTH_CONNECTION_SUMMARY_SELECT =
  'id, client_id, scopes, authorized_at, last_used_at' as const;

/**
 * User Service ファクトリ
 */
export function createUserService(supabase: SupabaseClient<Database>) {
  return {
    async listOAuthConnections(userId: string): Promise<OAuthConnectionSummary[]> {
      const { data, error } = await supabase
        .from(databaseTables.oauthConnections)
        .select(OAUTH_CONNECTION_SUMMARY_SELECT)
        .eq('user_id', userId)
        .is('revoked_at', null)
        .order('authorized_at', { ascending: false });

      if (error) {
        const original = captureUnexpectedDatabaseError(error, {
          feature: 'oauth_connections',
          operation: 'list_connections',
        });
        throw new UserServiceError('FETCH_FAILED', 'OAuth connections could not be loaded', {
          cause: original,
        });
      }

      return (data ?? []).map((connection) => ({
        id: connection.id,
        clientId: connection.client_id,
        scopes: connection.scopes,
        authorizedAt: connection.authorized_at,
        lastUsedAt: connection.last_used_at,
      }));
    },

    async revokeOAuthConnection(userId: string, connectionId: string): Promise<{ success: true }> {
      const { data: revoked, error } = await supabase.rpc('revoke_oauth_connection', {
        p_connection_id: connectionId,
      });

      if (error) {
        const original = captureUnexpectedDatabaseError(error, {
          feature: 'oauth_connections',
          operation: 'revoke_connection',
        });
        throw new UserServiceError('DELETE_FAILED', 'OAuth connection could not be revoked', {
          cause: original,
        });
      }

      if (revoked !== true) {
        throw new UserServiceError('NOT_FOUND', 'OAuth connection was not found');
      }

      logger.info('OAuth connection revoked', { userId, connectionId });
      return { success: true };
    },

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
      const { error: signInError } = await observeAuthOperation(
        'delete_account_reauthenticate',
        () =>
          supabase.auth.signInWithPassword({
            email: userEmail,
            password,
          }),
      );

      if (signInError) {
        throw new UserServiceError('INVALID_PASSWORD', 'Invalid password');
      }

      // Storage のアバター画像を削除
      try {
        const { data: files, error: listError } = await supabase.storage
          .from('avatars')
          .list(userId);
        if (listError) throw new Error('Avatar listing failed', { cause: listError });
        if (files && files.length > 0) {
          const filePaths = files.map((f) => `${userId}/${f.name}`);
          const { error: removeError } = await supabase.storage.from('avatars').remove(filePaths);
          if (removeError) throw new Error('Avatar removal failed', { cause: removeError });
        }
      } catch (storageError) {
        const original =
          storageError instanceof Error ? storageError : new Error('Avatar cleanup failed');
        captureUnexpectedError(original, {
          feature: 'account_deletion',
          operation: 'delete_avatar_files',
          source: 'supabase_storage',
        });
        throw new UserServiceError('DELETE_FAILED', 'Failed to delete avatar files', {
          cause: original,
        });
      }

      // Stripe サブスクリプション解約 + Customer 削除（GDPR対応）
      try {
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();
        if (profileError) throw new Error('Billing profile lookup failed', { cause: profileError });

        const stripeCustomerId = (profile as Record<string, unknown> | null)?.stripe_customer_id as
          string | null;

        if (stripeCustomerId) {
          const stripe = getStripe();
          if (!stripe) throw new Error('Stripe is not configured for billing data deletion');

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
        const original =
          stripeError instanceof Error ? stripeError : new Error('Stripe cleanup failed');
        captureUnexpectedError(original, {
          feature: 'account_deletion',
          operation: 'delete_stripe_customer',
          source: 'stripe',
        });
        throw new UserServiceError('DELETE_FAILED', 'Failed to delete billing data', {
          cause: original,
        });
      }

      // auth.users を削除 → CASCADE DELETE により全テーブルのユーザーデータが自動削除される
      const adminClient = createServiceRoleClient();
      const { error: deleteError } = await observeAuthOperation(
        'delete_account_admin_delete_user',
        () => adminClient.auth.admin.deleteUser(userId),
        { feature: 'account_deletion' },
      );

      if (deleteError) {
        throw new UserServiceError('DELETE_FAILED', 'Failed to delete account', {
          cause: deleteError,
        });
      }

      logger.info('Account deleted successfully', { userId });

      return { success: true };
    },

    /**
     * 全ブロック（plans / records）を削除
     * タグ・設定・プロフィールは保持
     */
    async deleteBlocks(userId: string): Promise<{ deletedCount: number }> {
      const adminClient = createServiceRoleClient();
      const { data: deletedCount, error } = await adminClient.rpc(
        'delete_user_timeblocks_command_v2',
        { p_user_id: userId },
      );

      if (error || deletedCount === null) {
        if (isRetryableDatabaseContention(error)) {
          throw new UserServiceError('CONFLICT', 'Timeblock deletion is busy. Try again.');
        }
        const original = captureUnexpectedDatabaseError(
          error ?? { message: 'Timeblock purge returned no result' },
          {
            feature: 'account_data',
            operation: 'delete_user_timeblocks',
          },
        );
        throw new UserServiceError('DELETE_DATA_FAILED', 'Timeblock deletion failed', {
          cause: original,
        });
      }

      logger.info('Blocks deleted', { userId, count: deletedCount });
      return { deletedCount };
    },

    /**
     * 全データを削除（アカウントは保持）
     * plans, records, tags, 設定を全削除
     */
    async deleteAllData(userId: string): Promise<{ success: true }> {
      const adminClient = createServiceRoleClient();
      const { data: deleted, error } = await adminClient.rpc('delete_all_user_data_command_v2', {
        p_user_id: userId,
      });

      if (error || deleted !== true) {
        if (isRetryableDatabaseContention(error)) {
          throw new UserServiceError('CONFLICT', 'User data deletion is busy. Try again.');
        }
        const original = captureUnexpectedDatabaseError(
          error ?? { message: 'Full data purge returned no success result' },
          {
            feature: 'account_data',
            operation: 'delete_all_user_data',
          },
        );
        throw new UserServiceError('DELETE_DATA_FAILED', 'User data deletion failed', {
          cause: original,
        });
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
      const [profileResult, plansResult, recordsResult, tagsResult, userSettingsResult] =
        await Promise.all([
          supabase.from('profiles').select('*').eq('id', userId).single(),
          adminClient.from('plans').select('*').eq('user_id', userId),
          adminClient.from(databaseTables.records).select(publicRecordSelect).eq('user_id', userId),
          supabase.from('tags').select('*').eq('user_id', userId),
          supabase
            .from('user_settings')
            .select(publicUserSettingsSelect)
            .eq('user_id', userId)
            .single(),
        ]);

      if (profileResult.error && profileResult.error.code !== 'PGRST116') {
        const original = captureUnexpectedDatabaseError(profileResult.error, {
          feature: 'account_export',
          operation: 'fetch_profile',
        });
        throw new UserServiceError('EXPORT_FAILED', 'Profile fetch failed', { cause: original });
      }
      if (plansResult.error) {
        const original = captureUnexpectedDatabaseError(plansResult.error, {
          feature: 'account_export',
          operation: 'fetch_plans',
        });
        throw new UserServiceError('EXPORT_FAILED', 'Plans fetch failed', { cause: original });
      }
      if (recordsResult.error) {
        const original = captureUnexpectedDatabaseError(recordsResult.error, {
          feature: 'account_export',
          operation: 'fetch_records',
        });
        throw new UserServiceError('EXPORT_FAILED', 'Records fetch failed', { cause: original });
      }
      if (tagsResult.error) {
        const original = captureUnexpectedDatabaseError(tagsResult.error, {
          feature: 'account_export',
          operation: 'fetch_tags',
        });
        throw new UserServiceError('EXPORT_FAILED', 'Tags fetch failed', { cause: original });
      }
      if (userSettingsResult.error && userSettingsResult.error.code !== 'PGRST116') {
        const original = captureUnexpectedDatabaseError(userSettingsResult.error, {
          feature: 'account_export',
          operation: 'fetch_user_settings',
        });
        throw new UserServiceError('EXPORT_FAILED', 'User settings fetch failed', {
          cause: original,
        });
      }
      return {
        exportedAt: new Date().toISOString(),
        userId,
        data: {
          profile: profileResult.data || null,
          plans: plansResult.data || [],
          records: recordsResult.data || [],
          tags: tagsResult.data || [],
          userSettings: userSettingsResult.data || null,
        },
      };
    },
  };
}

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
import { sendAccountDeletionEmail } from '@/lib/email/router';
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
      | 'UNAUTHORIZED'
      | 'INVALID_PASSWORD'
      | 'INVALID_INPUT',
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
  /** 表示名。削除通知メールの宛名に使う */
  userName: string;
  /** パスワードを持つユーザーのみ必須 */
  password?: string | undefined;
  /** パスワードを持たないユーザーが MFA を有効にしている場合に必須 */
  totpCode?: string | undefined;
  /**
   * パスワードで再認証すべきユーザーか。
   * クライアント入力ではなく server 側の `app_metadata` から判定した値を渡すこと
   */
  requiresPassword: boolean;
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
    records: PublicRecordRow[];
    tags: Row<'tags'>[];
    userSettings: PublicUserSettingsRow | null;
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
      const { userId, userEmail, userName, password, totpCode, requiresPassword, confirmText } =
        options;

      if (confirmText !== 'DELETE') {
        throw new UserServiceError('INVALID_INPUT', 'Confirmation text must be "DELETE"');
      }

      // 再認証。ユーザーが実際に持っている手段で確認する
      // （Google のみのユーザーはパスワードを持たないため、パスワードに固定しない）
      if (requiresPassword) {
        if (!password) {
          throw new UserServiceError('INVALID_INPUT', 'Password is required');
        }

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
      } else {
        // パスワードを持たないユーザーは、MFA があれば TOTP で再認証する
        const { data: factors, error: factorsError } = await observeAuthOperation(
          'delete_account_list_factors',
          () => supabase.auth.mfa.listFactors(),
        );

        if (factorsError) {
          // 検証手段を確認できない状態では削除を通さない（fail closed）
          throw new UserServiceError('DELETE_FAILED', 'Failed to verify authentication factors');
        }

        const verifiedTotp = factors?.totp?.find((factor) => factor.status === 'verified');
        if (verifiedTotp) {
          if (!totpCode) {
            throw new UserServiceError('INVALID_INPUT', 'Verification code is required');
          }

          const { error: mfaError } = await observeAuthOperation('delete_account_verify_totp', () =>
            supabase.auth.mfa.challengeAndVerify({
              factorId: verifiedTotp.id,
              code: totpCode,
            }),
          );

          if (mfaError) {
            throw new UserServiceError('INVALID_PASSWORD', 'Invalid verification code');
          }
        }
        // MFA も無い場合は、確認テキストの明示入力と削除通知メールで担保する
      }

      // 削除の通知メール。auth.users を消したあとは送信経路が無くなるため先に送る。
      // 送信失敗で削除を止めない（GDPR の削除要求を優先する）
      try {
        await sendAccountDeletionEmail({
          supabase,
          userId,
          email: userEmail,
          userName,
        });
      } catch (emailError) {
        const original =
          emailError instanceof Error
            ? emailError
            : new Error('Account deletion email failed', { cause: emailError });
        captureUnexpectedError(original, {
          feature: 'account_deletion',
          operation: 'send_deletion_email',
          source: 'resend',
        });
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
      let deletedCount = 0;

      // records.plan_id は plans を参照するため、records → plans の順で削除する。
      for (const table of [databaseTables.records, databaseTables.plans] as const) {
        const { data: deleted, error } = await adminClient
          .from(table)
          .delete()
          .eq('user_id', userId)
          .select('id');
        if (error) {
          const resource = table === databaseTables.records ? 'records' : table;
          const original = captureUnexpectedDatabaseError(error, {
            feature: 'account_data',
            operation: `delete_${resource}`,
          });
          throw new UserServiceError('DELETE_DATA_FAILED', `${resource} deletion failed`, {
            cause: original,
          });
        }
        deletedCount += deleted?.length ?? 0;
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
      // FK 依存順。service-role を使うが、全操作を認証済み userId で明示的に制限する。
      for (const table of [
        databaseTables.records,
        databaseTables.plans,
        databaseTables.tags,
        databaseTables.userSettings,
      ] as const) {
        const { error } = await adminClient.from(table).delete().eq('user_id', userId);
        if (error) {
          const resource = table === databaseTables.records ? 'records' : table;
          const original = captureUnexpectedDatabaseError(error, {
            feature: 'account_data',
            operation: `delete_all_${resource}`,
          });
          throw new UserServiceError('DELETE_DATA_FAILED', `${resource} deletion failed`, {
            cause: original,
          });
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

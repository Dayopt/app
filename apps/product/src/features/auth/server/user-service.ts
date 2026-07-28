import 'server-only';

/**
 * User Service
 *
 * ユーザー管理のビジネスロジック
 * tRPCルーターから呼び出されるサービス層
 */

import { createHash } from 'node:crypto';

import type { SupabaseClient } from '@supabase/supabase-js';

import type { EmailLocale } from '@/emails/i18n';
import type { Database, PublicRecordRow, PublicUserSettingsRow, Row } from '@/lib/database';
import { databaseTables, publicRecordSelect, publicUserSettingsSelect } from '@/lib/database';
import { getUserLocale, sendAccountDeletionEmail } from '@/lib/email/router';
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

export type UserServiceDependencies = Readonly<{
  beforeIdentityDeletion: (input: {
    userId: string;
  }) => Promise<{ status: 'completed' | 'contention' }>;
  deleteAllData: (input: {
    expectedGeneration: number;
    operationId: string;
    userId: string;
  }) => Promise<{ status: 'completed' | 'contention' }>;
  prepareDeleteAllData: (input: { userId: string }) => Promise<
    | {
        expectedGeneration: number;
        operationId: string;
        status: 'ready';
      }
    | { status: 'contention' }
  >;
}>;

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

const CANCELLABLE_SUBSCRIPTION_STATUSES = new Set([
  'active',
  'incomplete',
  'past_due',
  'paused',
  'trialing',
  'unpaid',
]);

function stripeDeletionIdempotencyKey(
  userId: string,
  resourceKind: 'customer' | 'subscription',
  resourceId: string,
): string {
  const digest = createHash('sha256')
    .update(`dayopt-account-deletion-v1:${userId}:${resourceKind}:${resourceId}`)
    .digest('hex');
  return `dayopt-account-deletion-v1-${resourceKind}-${digest}`;
}

async function deleteAvatarFiles(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data: files, error: listError } = await supabase.storage.from('avatars').list(userId);
  if (listError) throw new Error('Avatar listing failed');
  if (!files || files.length === 0) return;

  const filePaths = files.map((file) => `${userId}/${file.name}`);
  const { error: removeError } = await supabase.storage.from('avatars').remove(filePaths);
  if (removeError) throw new Error('Avatar removal failed');
}

async function deleteStripeCustomer(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw new Error('Billing profile lookup failed');

  const stripeCustomerId = profile?.stripe_customer_id;
  if (!stripeCustomerId) return;

  const stripe = getStripe();
  if (!stripe) throw new Error('Stripe is not configured for billing data deletion');

  // Customer削除後のresponse lossではretrieveがDeletedCustomerを返すため、
  // 後続のaccount deletion retryでprovider mutationを繰り返さず完了扱いにできる。
  const customer = await stripe.customers.retrieve(stripeCustomerId);
  if ('deleted' in customer && customer.deleted) return;

  // listはauto-pagination対応のasync iterable。既にcancel済みのsubscriptionは
  // default filterに含まれず、response loss時も同じidempotency keyで安全に再送できる。
  for await (const subscription of stripe.subscriptions.list({
    customer: stripeCustomerId,
  })) {
    if (!CANCELLABLE_SUBSCRIPTION_STATUSES.has(subscription.status)) continue;

    await stripe.subscriptions.cancel(
      subscription.id,
      {},
      {
        idempotencyKey: stripeDeletionIdempotencyKey(userId, 'subscription', subscription.id),
      },
    );
  }

  await stripe.customers.del(
    stripeCustomerId,
    {},
    {
      idempotencyKey: stripeDeletionIdempotencyKey(userId, 'customer', stripeCustomerId),
    },
  );
}

/**
 * User Service ファクトリ
 */
export function createUserService(
  supabase: SupabaseClient<Database>,
  dependencies: UserServiceDependencies,
) {
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

      // 通知メールの locale は user_settings 由来。削除で CASCADE 消滅するため先に引いておく
      // （メール本文は「削除されました」と完了を伝えるので、送信自体は削除確定後に行う）
      let emailLocale: EmailLocale = 'en';
      try {
        emailLocale = await getUserLocale(supabase, userId);
      } catch {
        // locale が引けなくても既定言語で送れるので削除は続ける
      }

      // Calendarはauth.usersのBEFORE DELETE triggerでもsealを必須にする。
      // Storage / Stripeより先にprovider attemptとdurable receiptを確定する。
      try {
        const preparation = await dependencies.beforeIdentityDeletion({ userId });
        if (preparation.status === 'contention') {
          throw new UserServiceError('CONFLICT', 'Account deletion is busy. Try again.');
        }
      } catch (error) {
        if (error instanceof UserServiceError) throw error;
        const failure = new Error('Calendar account deletion preparation failed');
        captureUnexpectedError(failure, {
          feature: 'account_deletion',
          operation: 'prepare_identity_deletion',
          source: 'identity_deletion_dependency',
        });
        throw new UserServiceError('DELETE_FAILED', 'Failed to prepare calendar deletion', {
          cause: failure,
        });
      }

      // Storage のアバター画像を削除
      try {
        await deleteAvatarFiles(supabase, userId);
      } catch {
        const failure = new Error('Avatar cleanup failed');
        captureUnexpectedError(failure, {
          feature: 'account_deletion',
          operation: 'delete_avatar_files',
          source: 'supabase_storage',
        });
        throw new UserServiceError('DELETE_FAILED', 'Failed to delete avatar files', {
          cause: failure,
        });
      }

      // Stripe サブスクリプション解約 + Customer 削除（GDPR対応）
      try {
        await deleteStripeCustomer(supabase, userId);
      } catch {
        const failure = new Error('Stripe cleanup failed');
        captureUnexpectedError(failure, {
          feature: 'account_deletion',
          operation: 'delete_stripe_customer',
          source: 'stripe',
        });
        throw new UserServiceError('DELETE_FAILED', 'Failed to delete billing data', {
          cause: failure,
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

      // 削除が確定してから通知する。送信失敗で削除をなかったことにはできないので、
      // 記録だけ残して成功を返す（GDPR の削除要求を優先する）
      try {
        await sendAccountDeletionEmail({
          email: userEmail,
          userName,
          locale: emailLocale,
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
    async prepareDeleteAllData(
      userId: string,
    ): Promise<{ expectedGeneration: number; operationId: string }> {
      try {
        const preflight = await dependencies.prepareDeleteAllData({ userId });
        if (preflight.status === 'contention') {
          throw new UserServiceError('CONFLICT', 'User data deletion is busy. Try again.');
        }
        return {
          expectedGeneration: preflight.expectedGeneration,
          operationId: preflight.operationId,
        };
      } catch (error) {
        if (error instanceof UserServiceError) throw error;
        const failure = new Error('User data deletion preflight dependency failed');
        captureUnexpectedError(failure, {
          feature: 'account_data',
          operation: 'prepare_delete_all_user_data',
          source: 'user_data_deletion_dependency',
        });
        throw new UserServiceError('DELETE_DATA_FAILED', 'User data deletion preparation failed', {
          cause: failure,
        });
      }
    },

    async deleteAllData(
      userId: string,
      operationId: string,
      expectedGeneration: number,
    ): Promise<{ success: true }> {
      try {
        const deletion = await dependencies.deleteAllData({
          expectedGeneration,
          operationId,
          userId,
        });
        if (deletion.status === 'contention') {
          throw new UserServiceError('CONFLICT', 'User data deletion is busy. Try again.');
        }
      } catch (error) {
        if (error instanceof UserServiceError) throw error;
        const failure = new Error('User data deletion dependency failed');
        captureUnexpectedError(failure, {
          feature: 'account_data',
          operation: 'delete_all_user_data',
          source: 'user_data_deletion_dependency',
        });
        throw new UserServiceError('DELETE_DATA_FAILED', 'User data deletion failed', {
          cause: failure,
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

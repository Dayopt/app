import { beforeEach, describe, expect, it, vi } from 'vitest';

import { publicRecordSelect, publicUserSettingsSelect } from '@/lib/database';
import { createChainableMock } from '@/lib/test/trpc-test-helpers';

const getStripe = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() => vi.fn());
const loggerInfo = vi.hoisted(() => vi.fn());
const loggerWarn = vi.hoisted(() => vi.fn());
const adminFrom = vi.hoisted(() => vi.fn());
const adminRpc = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());
const beforeIdentityDeletion = vi.hoisted(() => vi.fn());
const deleteAllData = vi.hoisted(() => vi.fn());
const prepareDeleteAllData = vi.hoisted(() => vi.fn());
const sendAccountDeletionEmail = vi.hoisted(() => vi.fn());
const getUserLocale = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email/router', () => ({ sendAccountDeletionEmail, getUserLocale }));

vi.mock('@/lib/stripe/client', () => ({ getStripe }));
vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({
    auth: { admin: { deleteUser } },
    from: adminFrom,
    rpc: adminRpc,
  }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: loggerInfo, warn: loggerWarn },
}));
vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError,
  captureUnexpectedError,
  observeAuthOperation: async (_operation: string, call: () => PromiseLike<unknown>) => call(),
}));

import { createUserService } from '../user-service';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const PURGE_OPERATION_ID = '00000000-0000-4000-8000-000000000002';
const PURGE_EXPECTED_GENERATION = 7;
const USER_EMAIL = 'user@example.com';

type QueryResult = {
  data?: unknown;
  error?: { message: string; code?: string } | null;
};

function createSupabase(options?: {
  tables?: Record<string, QueryResult>;
  rpcResult?: QueryResult;
  signInError?: { message: string } | null;
  files?: Array<{ name: string }> | null;
  storageError?: Error;
  /** MFA factor 一覧。省略時は factor 無し */
  totpFactors?: Array<{ id: string; status: string }>;
  listFactorsError?: { message: string } | null;
  verifyTotpError?: { message: string } | null;
}) {
  const queries = new Map(
    Object.entries(options?.tables ?? {}).map(([table, result]) => [
      table,
      createChainableMock(result.data ?? null, result.error ?? null),
    ]),
  );
  const from = vi.fn((table: string) => {
    const query = queries.get(table) ?? createChainableMock([], null);
    queries.set(table, query);
    return query;
  });
  const signInWithPassword = vi.fn().mockResolvedValue({
    data: { user: null, session: null },
    error: options?.signInError ?? null,
  });
  const list = options?.storageError
    ? vi.fn().mockRejectedValue(options.storageError)
    : vi.fn().mockResolvedValue({ data: options?.files ?? [], error: null });
  const remove = vi.fn().mockResolvedValue({ data: [], error: null });
  const rpc = vi.fn().mockResolvedValue({
    data: options?.rpcResult?.data ?? null,
    error: options?.rpcResult?.error ?? null,
  });

  const listFactors = vi.fn().mockResolvedValue({
    data: { totp: options?.totpFactors ?? [] },
    error: options?.listFactorsError ?? null,
  });
  const challengeAndVerify = vi.fn().mockResolvedValue({
    data: null,
    error: options?.verifyTotpError ?? null,
  });

  return {
    service: createUserService(
      {
        from,
        rpc,
        auth: { signInWithPassword, mfa: { listFactors, challengeAndVerify } },
        storage: { from: vi.fn(() => ({ list, remove })) },
      } as never,
      { beforeIdentityDeletion, deleteAllData, prepareDeleteAllData },
    ),
    from,
    list,
    remove,
    rpc,
    signInWithPassword,
    listFactors,
    challengeAndVerify,
    query: (table: string) => queries.get(table)!,
  };
}

function mockAdminTables(tables: Record<string, QueryResult>) {
  const queries = new Map(
    Object.entries(tables).map(([table, result]) => [
      table,
      createChainableMock(result.data ?? null, result.error ?? null),
    ]),
  );
  adminFrom.mockImplementation((table: string) => {
    const query = queries.get(table) ?? createChainableMock([], null);
    queries.set(table, query);
    return query;
  });
  return queries;
}

function deleteOptions(
  overrides?: Partial<{
    password: string;
    totpCode: string;
    requiresPassword: boolean;
    confirmText: string;
  }>,
) {
  return {
    userId: USER_ID,
    userEmail: USER_EMAIL,
    userName: 'Tomoya',
    password: 'correct-password',
    requiresPassword: true,
    confirmText: 'DELETE',
    ...overrides,
  };
}

/** Google のみで登録したユーザー（パスワードを持たない） */
function googleUserDeleteOptions(overrides?: Partial<{ totpCode: string; confirmText: string }>) {
  return {
    userId: USER_ID,
    userEmail: USER_EMAIL,
    userName: 'Tomoya',
    requiresPassword: false,
    confirmText: 'DELETE',
    ...overrides,
  };
}

function asAsyncIterable<T>(items: T[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const item of items) yield item;
    },
  };
}

describe('createUserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStripe.mockReturnValue(null);
    sendAccountDeletionEmail.mockResolvedValue({ success: true });
    getUserLocale.mockResolvedValue('ja');
    deleteUser.mockResolvedValue({ data: {}, error: null });
    adminFrom.mockImplementation(() => createChainableMock([], null));
    adminRpc.mockResolvedValue({ data: null, error: null });
    beforeIdentityDeletion.mockResolvedValue({ status: 'completed' });
    deleteAllData.mockResolvedValue({ status: 'completed' });
    prepareDeleteAllData.mockResolvedValue({
      expectedGeneration: PURGE_EXPECTED_GENERATION,
      operationId: PURGE_OPERATION_ID,
      status: 'ready',
    });
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  describe('OAuth connections', () => {
    const connection = {
      id: '00000000-0000-4000-8000-000000000010',
      client_id: 'chatgpt',
      scopes: ['read:entries'],
      authorized_at: '2026-07-23T00:00:00.000Z',
      last_used_at: null,
    };

    it('有効な自分の接続だけを新しい順で返す', async () => {
      const { service, query } = createSupabase({
        tables: { oauth_connections: { data: [connection] } },
      });

      await expect(service.listOAuthConnections(USER_ID)).resolves.toEqual([
        {
          id: connection.id,
          clientId: 'chatgpt',
          scopes: ['read:entries'],
          authorizedAt: connection.authorized_at,
          lastUsedAt: null,
        },
      ]);

      const connectionQuery = query('oauth_connections');
      expect(connectionQuery.select).toHaveBeenCalledWith(
        'id, client_id, scopes, authorized_at, last_used_at',
      );
      expect(connectionQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
      expect(connectionQuery.is).toHaveBeenCalledWith('revoked_at', null);
      expect(connectionQuery.order).toHaveBeenCalledWith('authorized_at', { ascending: false });
    });

    it('接続一覧のDB失敗をsanitized errorへ変換する', async () => {
      const dbError = { message: 'private database detail' };
      const { service } = createSupabase({
        tables: { oauth_connections: { error: dbError } },
      });

      await expect(service.listOAuthConnections(USER_ID)).rejects.toMatchObject({
        code: 'FETCH_FAILED',
        message: 'OAuth connections could not be loaded',
      });
      expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(dbError, {
        feature: 'oauth_connections',
        operation: 'list_connections',
      });
    });

    it('session RPCで選択した接続を失効する', async () => {
      const { service, rpc } = createSupabase({ rpcResult: { data: true } });

      await expect(service.revokeOAuthConnection(USER_ID, connection.id)).resolves.toEqual({
        success: true,
      });
      expect(rpc).toHaveBeenCalledWith('revoke_oauth_connection', {
        p_connection_id: connection.id,
      });
    });

    it('foreignまたは存在しない接続をNOT_FOUNDとして扱う', async () => {
      const { service } = createSupabase({ rpcResult: { data: false } });

      await expect(service.revokeOAuthConnection(USER_ID, connection.id)).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('接続失効のDB失敗をsanitized errorへ変換する', async () => {
      const dbError = { message: 'private revoke detail' };
      const { service } = createSupabase({ rpcResult: { error: dbError } });

      await expect(service.revokeOAuthConnection(USER_ID, connection.id)).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        message: 'OAuth connection could not be revoked',
      });
      expect(captureUnexpectedDatabaseError).toHaveBeenCalledWith(dbError, {
        feature: 'oauth_connections',
        operation: 'revoke_connection',
      });
    });
  });

  describe('deleteAccount', () => {
    it('パスワードを持つユーザーでpasswordが空ならINVALID_INPUTを投げる', async () => {
      const { service, signInWithPassword } = createSupabase();

      await expect(service.deleteAccount(deleteOptions({ password: '' }))).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
      expect(signInWithPassword).not.toHaveBeenCalled();
    });

    it('確認文字列がDELETEでなければINVALID_INPUTを投げる', async () => {
      const { service } = createSupabase();

      await expect(
        service.deleteAccount(deleteOptions({ confirmText: 'delete' })),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('再認証に失敗したらINVALID_PASSWORDを投げる', async () => {
      const { service } = createSupabase({ signInError: { message: 'invalid credentials' } });

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'INVALID_PASSWORD',
      });
      expect(beforeIdentityDeletion).not.toHaveBeenCalled();
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('再認証後にCalendarをsealしてからavatarとauth userを削除する', async () => {
      const { service, remove } = createSupabase({
        files: [{ name: 'avatar.png' }, { name: 'old.png' }],
      });

      await expect(service.deleteAccount(deleteOptions())).resolves.toEqual({ success: true });
      expect(beforeIdentityDeletion).toHaveBeenCalledWith({ userId: USER_ID });
      expect(remove).toHaveBeenCalledWith([`${USER_ID}/avatar.png`, `${USER_ID}/old.png`]);
      expect(deleteUser).toHaveBeenCalledWith(USER_ID);
      expect(beforeIdentityDeletion.mock.invocationCallOrder[0]).toBeLessThan(
        remove.mock.invocationCallOrder[0]!,
      );
      expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
        deleteUser.mock.invocationCallOrder[0]!,
      );
    });

    it('Calendar準備失敗時はStorage / Stripe / auth userを変更しない', async () => {
      beforeIdentityDeletion.mockRejectedValue(new Error('private calendar failure'));
      const { service, list } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        message: 'Failed to prepare calendar deletion',
        cause: expect.objectContaining({
          message: 'Calendar account deletion preparation failed',
        }),
      });
      expect(list).not.toHaveBeenCalled();
      expect(getStripe).not.toHaveBeenCalled();
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('Calendar authority contentionをretryable conflictへ変換する', async () => {
      beforeIdentityDeletion.mockResolvedValue({ status: 'contention' });
      const { service, list } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'CONFLICT',
      });
      expect(list).not.toHaveBeenCalled();
      expect(captureUnexpectedError).not.toHaveBeenCalled();
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('Storage削除失敗時はfail closedでaccount削除を止める', async () => {
      const storageError = new Error('storage unavailable');
      const { service } = createSupabase({ storageError });

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        message: 'Failed to delete avatar files',
        cause: expect.objectContaining({ message: 'Avatar cleanup failed' }),
      });
      expect(captureUnexpectedError).toHaveBeenCalledOnce();
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('全pageの有効なStripe subscriptionを冪等に解約してcustomerを削除する', async () => {
      const listSubscriptions = vi.fn().mockReturnValue(
        asAsyncIterable([
          { id: 'sub-active', status: 'active' },
          { id: 'sub-canceled', status: 'canceled' },
          { id: 'sub-paused', status: 'paused' },
        ]),
      );
      const cancelSubscription = vi.fn().mockResolvedValue({});
      const deleteCustomer = vi.fn().mockResolvedValue({});
      const retrieveCustomer = vi.fn().mockResolvedValue({ id: 'cus_123', deleted: false });
      getStripe.mockReturnValue({
        subscriptions: { list: listSubscriptions, cancel: cancelSubscription },
        customers: { del: deleteCustomer, retrieve: retrieveCustomer },
      });
      const { service } = createSupabase({
        tables: { profiles: { data: { stripe_customer_id: 'cus_123' } } },
      });

      await service.deleteAccount(deleteOptions());

      expect(listSubscriptions).toHaveBeenCalledWith({ customer: 'cus_123' });
      expect(cancelSubscription).toHaveBeenCalledTimes(2);
      expect(cancelSubscription).toHaveBeenCalledWith(
        'sub-active',
        {},
        { idempotencyKey: expect.stringMatching(/^dayopt-account-deletion-v1-subscription-/) },
      );
      expect(cancelSubscription).toHaveBeenCalledWith(
        'sub-paused',
        {},
        { idempotencyKey: expect.stringMatching(/^dayopt-account-deletion-v1-subscription-/) },
      );
      expect(deleteCustomer).toHaveBeenCalledWith(
        'cus_123',
        {},
        { idempotencyKey: expect.stringMatching(/^dayopt-account-deletion-v1-customer-/) },
      );
    });

    it('既に削除済みのStripe customerはresponse-loss replayとして完了扱いにする', async () => {
      const listSubscriptions = vi.fn();
      const deleteCustomer = vi.fn();
      getStripe.mockReturnValue({
        subscriptions: { list: listSubscriptions, cancel: vi.fn() },
        customers: {
          del: deleteCustomer,
          retrieve: vi.fn().mockResolvedValue({ id: 'cus_123', deleted: true }),
        },
      });
      const { service } = createSupabase({
        tables: { profiles: { data: { stripe_customer_id: 'cus_123' } } },
      });

      await expect(service.deleteAccount(deleteOptions())).resolves.toEqual({ success: true });
      expect(listSubscriptions).not.toHaveBeenCalled();
      expect(deleteCustomer).not.toHaveBeenCalled();
      expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    });

    it('Stripe処理失敗時はfail closedでaccount削除を止める', async () => {
      const stripeError = new Error('stripe unavailable');
      getStripe.mockReturnValue({
        subscriptions: { list: vi.fn(), cancel: vi.fn() },
        customers: { del: vi.fn(), retrieve: vi.fn().mockRejectedValue(stripeError) },
      });
      const { service } = createSupabase({
        tables: { profiles: { data: { stripe_customer_id: 'cus_123' } } },
      });

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        message: 'Failed to delete billing data',
        cause: expect.objectContaining({ message: 'Stripe cleanup failed' }),
      });
      expect(captureUnexpectedError).toHaveBeenCalledOnce();
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('削除が確定してから通知メールを送る', async () => {
      const { service } = createSupabase();

      await service.deleteAccount(deleteOptions());

      expect(sendAccountDeletionEmail).toHaveBeenCalledWith({
        email: USER_EMAIL,
        userName: 'Tomoya',
        locale: 'ja',
      });
      // 本文が「削除されました」と完了を伝えるため、削除の後に送る必要がある
      const [deleteOrder] = deleteUser.mock.invocationCallOrder;
      const [emailOrder] = sendAccountDeletionEmail.mock.invocationCallOrder;
      expect(deleteOrder).toBeDefined();
      expect(emailOrder).toBeGreaterThan(deleteOrder!);
    });

    it('削除が中断されたら通知メールを送らない（誤報を出さない）', async () => {
      const { service } = createSupabase({ storageError: new Error('storage unavailable') });

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'DELETE_FAILED',
      });
      expect(sendAccountDeletionEmail).not.toHaveBeenCalled();
    });

    it('locale が引けなくても既定言語で送って削除を続ける', async () => {
      getUserLocale.mockRejectedValueOnce(new Error('user_settings unavailable'));
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).resolves.toEqual({ success: true });
      expect(sendAccountDeletionEmail).toHaveBeenCalledWith(
        expect.objectContaining({ locale: 'en' }),
      );
    });

    it('通知メールの送信失敗では削除を止めない（削除要求を優先する）', async () => {
      sendAccountDeletionEmail.mockRejectedValueOnce(new Error('resend down'));
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).resolves.toEqual({ success: true });
      expect(captureUnexpectedError).toHaveBeenCalledOnce();
      expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    });

    describe('パスワードを持たないユーザー（Google のみ）', () => {
      it('MFA が無ければ確認テキストだけで削除できる', async () => {
        const { service, signInWithPassword } = createSupabase();

        await expect(service.deleteAccount(googleUserDeleteOptions())).resolves.toEqual({
          success: true,
        });
        expect(signInWithPassword).not.toHaveBeenCalled();
        expect(deleteUser).toHaveBeenCalledWith(USER_ID);
      });

      it('MFA が有効でコード未入力ならINVALID_INPUTを投げる', async () => {
        const { service } = createSupabase({
          totpFactors: [{ id: 'factor-1', status: 'verified' }],
        });

        await expect(service.deleteAccount(googleUserDeleteOptions())).rejects.toMatchObject({
          code: 'INVALID_INPUT',
        });
        expect(deleteUser).not.toHaveBeenCalled();
      });

      it('MFA のコードが誤っていればINVALID_PASSWORDを投げる', async () => {
        const { service } = createSupabase({
          totpFactors: [{ id: 'factor-1', status: 'verified' }],
          verifyTotpError: { message: 'invalid code' },
        });

        await expect(
          service.deleteAccount(googleUserDeleteOptions({ totpCode: '000000' })),
        ).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
        expect(deleteUser).not.toHaveBeenCalled();
      });

      it('MFA のコードが正しければ削除できる', async () => {
        const { service, challengeAndVerify } = createSupabase({
          totpFactors: [{ id: 'factor-1', status: 'verified' }],
        });

        await expect(
          service.deleteAccount(googleUserDeleteOptions({ totpCode: '123456' })),
        ).resolves.toEqual({ success: true });
        expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: 'factor-1', code: '123456' });
      });

      it('未検証の factor は再認証を要求しない', async () => {
        const { service, challengeAndVerify } = createSupabase({
          totpFactors: [{ id: 'factor-1', status: 'unverified' }],
        });

        await expect(service.deleteAccount(googleUserDeleteOptions())).resolves.toEqual({
          success: true,
        });
        expect(challengeAndVerify).not.toHaveBeenCalled();
      });

      it('factor 一覧の取得に失敗したらfail closedで削除を止める', async () => {
        const { service } = createSupabase({ listFactorsError: { message: 'mfa unavailable' } });

        await expect(service.deleteAccount(googleUserDeleteOptions())).rejects.toMatchObject({
          code: 'DELETE_FAILED',
        });
        expect(deleteUser).not.toHaveBeenCalled();
      });
    });

    it('admin user削除失敗をDELETE_FAILEDに変換する', async () => {
      const deleteError = new Error('delete failed');
      deleteUser.mockResolvedValue({ data: null, error: deleteError });
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        message: 'Failed to delete account',
        cause: deleteError,
      });
    });
  });

  describe('deleteBlocks', () => {
    it('atomic purge RPCが返す合計件数を返す', async () => {
      adminRpc.mockResolvedValue({ data: 3, error: null });
      const { service } = createSupabase();

      await expect(service.deleteBlocks(USER_ID)).resolves.toEqual({ deletedCount: 3 });
      expect(adminRpc).toHaveBeenCalledWith('delete_user_timeblocks_command_v2', {
        p_user_id: USER_ID,
      });
    });

    it('削除エラーをDELETE_DATA_FAILEDに変換する', async () => {
      adminRpc.mockResolvedValue({ data: null, error: { message: 'purge failed' } });
      const { service } = createSupabase();

      await expect(service.deleteBlocks(USER_ID)).rejects.toMatchObject({
        code: 'DELETE_DATA_FAILED',
        message: 'Timeblock deletion failed',
      });
    });

    it.each(['55P03', '57014'] as const)('%sをretryable conflictへ変換する', async (code) => {
      adminRpc.mockResolvedValue({ data: null, error: { code, message: 'private lock detail' } });
      const { service } = createSupabase();

      await expect(service.deleteBlocks(USER_ID)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(captureUnexpectedDatabaseError).not.toHaveBeenCalled();
    });
  });

  describe('deleteAllData', () => {
    it('server-issued operationとgenerationを返す', async () => {
      const { service } = createSupabase();

      await expect(service.prepareDeleteAllData(USER_ID)).resolves.toEqual({
        expectedGeneration: PURGE_EXPECTED_GENERATION,
        operationId: PURGE_OPERATION_ID,
      });
      expect(prepareDeleteAllData).toHaveBeenCalledWith({ userId: USER_ID });
    });

    it('Calendar authorityのatomic purge dependencyへ委譲する', async () => {
      const { service } = createSupabase();

      await expect(
        service.deleteAllData(USER_ID, PURGE_OPERATION_ID, PURGE_EXPECTED_GENERATION),
      ).resolves.toEqual({ success: true });
      expect(deleteAllData).toHaveBeenCalledWith({
        expectedGeneration: PURGE_EXPECTED_GENERATION,
        operationId: PURGE_OPERATION_ID,
        userId: USER_ID,
      });
      expect(adminRpc).not.toHaveBeenCalled();
    });

    it('authority purge失敗をsanitized DELETE_DATA_FAILEDへ変換する', async () => {
      deleteAllData.mockRejectedValue(new Error('private purge detail'));
      const { service } = createSupabase();

      await expect(
        service.deleteAllData(USER_ID, PURGE_OPERATION_ID, PURGE_EXPECTED_GENERATION),
      ).rejects.toMatchObject({
        code: 'DELETE_DATA_FAILED',
        message: 'User data deletion failed',
        cause: expect.objectContaining({ message: 'User data deletion dependency failed' }),
      });
      expect(captureUnexpectedError).toHaveBeenCalledOnce();
    });

    it('authority contentionをretryable conflictへ変換する', async () => {
      deleteAllData.mockResolvedValue({ status: 'contention' });
      const { service } = createSupabase();

      await expect(
        service.deleteAllData(USER_ID, PURGE_OPERATION_ID, PURGE_EXPECTED_GENERATION),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(captureUnexpectedError).not.toHaveBeenCalled();
    });
  });

  describe('exportData', () => {
    it('plans / records / tags / settings をexportする', async () => {
      const profile = { id: USER_ID, email: USER_EMAIL };
      const plans = [{ id: 'plan-1', user_id: USER_ID }];
      const records = [{ id: 'record-1', user_id: USER_ID }];
      const tags = [{ id: 'tag-1', user_id: USER_ID }];
      const settings = { id: 'settings-1', user_id: USER_ID };
      const adminQueries = mockAdminTables({ plans: { data: plans }, records: { data: records } });
      const { service, query } = createSupabase({
        tables: {
          profiles: { data: profile },
          tags: { data: tags },
          user_settings: { data: settings },
        },
      });

      const result = await service.exportData({ userId: USER_ID });

      expect(result.userId).toBe(USER_ID);
      expect(result.exportedAt).toEqual(expect.any(String));
      expect(result.data).toEqual({
        profile,
        plans,
        records,
        tags,
        userSettings: settings,
      });
      expect(result.data.records).toHaveLength(1);
      expect(result.data.records[0]).not.toHaveProperty('fulfillment_score');
      expect(result.data.userSettings).not.toHaveProperty('chronotype_settings');
      expect(adminQueries.get('records')?.select).toHaveBeenCalledWith(publicRecordSelect);
      expect(query('user_settings').select).toHaveBeenCalledWith(publicUserSettingsSelect);
    });

    it('profileが未作成ならnullとしてexportする', async () => {
      mockAdminTables({ plans: { data: [] }, records: { data: [] } });
      const { service } = createSupabase({
        tables: {
          profiles: { error: { code: 'PGRST116', message: 'not found' } },
          tags: { data: [] },
          user_settings: { data: null },
        },
      });

      await expect(service.exportData({ userId: USER_ID })).resolves.toMatchObject({
        data: { profile: null },
      });
    });

    it('plans取得失敗をEXPORT_FAILEDに変換する', async () => {
      mockAdminTables({
        plans: { error: { message: 'plans fetch failed' } },
        records: { data: [] },
      });
      const { service } = createSupabase({
        tables: {
          profiles: { data: null },
          tags: { data: [] },
          user_settings: { data: null },
        },
      });

      await expect(service.exportData({ userId: USER_ID })).rejects.toMatchObject({
        code: 'EXPORT_FAILED',
        message: 'Plans fetch failed',
      });
    });

    it('tags取得失敗をEXPORT_FAILEDに変換する', async () => {
      mockAdminTables({ plans: { data: [] }, records: { data: [] } });
      const { service } = createSupabase({
        tables: {
          profiles: { data: null },
          tags: { error: { message: 'tags fetch failed' } },
          user_settings: { data: null },
        },
      });

      await expect(service.exportData({ userId: USER_ID })).rejects.toMatchObject({
        code: 'EXPORT_FAILED',
        message: 'Tags fetch failed',
      });
    });
  });
});

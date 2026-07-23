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
const USER_EMAIL = 'user@example.com';

type QueryResult = {
  data?: unknown;
  error?: { message: string; code?: string } | null;
};

function createSupabase(options?: {
  tables?: Record<string, QueryResult>;
  signInError?: { message: string } | null;
  files?: Array<{ name: string }> | null;
  storageError?: Error;
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

  return {
    service: createUserService({
      from,
      auth: { signInWithPassword },
      storage: { from: vi.fn(() => ({ list, remove })) },
    } as never),
    from,
    list,
    remove,
    signInWithPassword,
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

function deleteOptions(overrides?: Partial<{ password: string; confirmText: string }>) {
  return {
    userId: USER_ID,
    userEmail: USER_EMAIL,
    password: 'correct-password',
    confirmText: 'DELETE',
    ...overrides,
  };
}

describe('createUserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStripe.mockReturnValue(null);
    deleteUser.mockResolvedValue({ data: {}, error: null });
    adminFrom.mockImplementation(() => createChainableMock([], null));
    adminRpc.mockResolvedValue({ data: null, error: null });
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  describe('deleteAccount', () => {
    it('passwordが空ならINVALID_INPUTを投げる', async () => {
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
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('avatarを削除してからauth userを削除する', async () => {
      const { service, remove } = createSupabase({
        files: [{ name: 'avatar.png' }, { name: 'old.png' }],
      });

      await expect(service.deleteAccount(deleteOptions())).resolves.toEqual({ success: true });
      expect(remove).toHaveBeenCalledWith([`${USER_ID}/avatar.png`, `${USER_ID}/old.png`]);
      expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    });

    it('Storage削除失敗時はfail closedでaccount削除を止める', async () => {
      const storageError = new Error('storage unavailable');
      const { service } = createSupabase({ storageError });

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        message: 'Failed to delete avatar files',
        cause: storageError,
      });
      expect(captureUnexpectedError).toHaveBeenCalledOnce();
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('有効なStripe subscriptionを解約してcustomerを削除する', async () => {
      const listSubscriptions = vi.fn().mockResolvedValue({
        data: [
          { id: 'sub-active', status: 'active' },
          { id: 'sub-canceled', status: 'canceled' },
          { id: 'sub-paused', status: 'paused' },
        ],
      });
      const cancelSubscription = vi.fn().mockResolvedValue({});
      const deleteCustomer = vi.fn().mockResolvedValue({});
      getStripe.mockReturnValue({
        subscriptions: { list: listSubscriptions, cancel: cancelSubscription },
        customers: { del: deleteCustomer },
      });
      const { service } = createSupabase({
        tables: { profiles: { data: { stripe_customer_id: 'cus_123' } } },
      });

      await service.deleteAccount(deleteOptions());

      expect(listSubscriptions).toHaveBeenCalledWith({ customer: 'cus_123' });
      expect(cancelSubscription).toHaveBeenCalledTimes(2);
      expect(cancelSubscription).toHaveBeenCalledWith('sub-active');
      expect(cancelSubscription).toHaveBeenCalledWith('sub-paused');
      expect(deleteCustomer).toHaveBeenCalledWith('cus_123');
    });

    it('Stripe処理失敗時はfail closedでaccount削除を止める', async () => {
      const stripeError = new Error('stripe unavailable');
      getStripe.mockReturnValue({
        subscriptions: { list: vi.fn().mockRejectedValue(stripeError) },
        customers: { del: vi.fn() },
      });
      const { service } = createSupabase({
        tables: { profiles: { data: { stripe_customer_id: 'cus_123' } } },
      });

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        message: 'Failed to delete billing data',
        cause: stripeError,
      });
      expect(captureUnexpectedError).toHaveBeenCalledOnce();
      expect(deleteUser).not.toHaveBeenCalled();
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
    it('全データを1つのatomic purge RPCで削除する', async () => {
      adminRpc.mockResolvedValue({ data: true, error: null });
      const { service } = createSupabase();

      await expect(service.deleteAllData(USER_ID)).resolves.toEqual({ success: true });
      expect(adminRpc).toHaveBeenCalledWith('delete_all_user_data_command_v2', {
        p_user_id: USER_ID,
      });
    });

    it('atomic purge RPCの失敗をDELETE_DATA_FAILEDに変換する', async () => {
      adminRpc.mockResolvedValue({ data: null, error: { message: 'purge failed' } });
      const { service } = createSupabase();

      await expect(service.deleteAllData(USER_ID)).rejects.toMatchObject({
        code: 'DELETE_DATA_FAILED',
        message: 'User data deletion failed',
      });
    });

    it('lock timeoutをretryable conflictへ変換する', async () => {
      adminRpc.mockResolvedValue({
        data: null,
        error: { code: '55P03', message: 'private lock detail' },
      });
      const { service } = createSupabase();

      await expect(service.deleteAllData(USER_ID)).rejects.toMatchObject({ code: 'CONFLICT' });
      expect(captureUnexpectedDatabaseError).not.toHaveBeenCalled();
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

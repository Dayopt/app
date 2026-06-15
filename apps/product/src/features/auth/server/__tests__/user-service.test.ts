import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock } from '@/lib/test/trpc-test-helpers';

const getStripe = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() => vi.fn());
const loggerInfo = vi.hoisted(() => vi.fn());
const loggerWarn = vi.hoisted(() => vi.fn());

vi.mock('@/lib/stripe/client', () => ({ getStripe }));
vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ auth: { admin: { deleteUser } } }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { info: loggerInfo, warn: loggerWarn },
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

    it('Storage削除失敗時もaccount削除を継続する', async () => {
      const storageError = new Error('storage unavailable');
      const { service } = createSupabase({ storageError });

      await expect(service.deleteAccount(deleteOptions())).resolves.toEqual({ success: true });
      expect(loggerWarn).toHaveBeenCalledWith(
        'Failed to delete avatar files, continuing with account deletion',
        storageError,
      );
      expect(deleteUser).toHaveBeenCalledWith(USER_ID);
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

    it('Stripe処理失敗時もaccount削除を継続する', async () => {
      const stripeError = new Error('stripe unavailable');
      getStripe.mockReturnValue({
        subscriptions: { list: vi.fn().mockRejectedValue(stripeError) },
        customers: { del: vi.fn() },
      });
      const { service } = createSupabase({
        tables: { profiles: { data: { stripe_customer_id: 'cus_123' } } },
      });

      await expect(service.deleteAccount(deleteOptions())).resolves.toEqual({ success: true });
      expect(loggerWarn).toHaveBeenCalledWith(
        'Failed to cancel Stripe subscription, continuing with account deletion',
        stripeError,
      );
      expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    });

    it('admin user削除失敗をDELETE_FAILEDに変換する', async () => {
      deleteUser.mockResolvedValue({ data: null, error: { message: 'delete failed' } });
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        message: 'Failed to delete account: delete failed',
      });
    });
  });

  describe('deleteBlocks', () => {
    it('削除件数を返す', async () => {
      const { service, query } = createSupabase({
        tables: { entries: { data: [{ id: 'entry-1' }, { id: 'entry-2' }] } },
      });

      await expect(service.deleteBlocks(USER_ID)).resolves.toEqual({ deletedCount: 2 });
      expect(query('entries').eq).toHaveBeenCalledWith('user_id', USER_ID);
      expect(query('entries').select).toHaveBeenCalledWith('id');
    });

    it('削除エラーをDELETE_DATA_FAILEDに変換する', async () => {
      const { service } = createSupabase({
        tables: { entries: { error: { message: 'entries failed' } } },
      });

      await expect(service.deleteBlocks(USER_ID)).rejects.toMatchObject({
        code: 'DELETE_DATA_FAILED',
        message: 'entries deletion failed: entries failed',
      });
    });
  });

  describe('deleteAllData', () => {
    it('entries、tags、user_settingsの順に削除する', async () => {
      const { service, from } = createSupabase({
        tables: {
          entries: { data: [] },
          tags: { data: [] },
          user_settings: { data: [] },
        },
      });

      await expect(service.deleteAllData(USER_ID)).resolves.toEqual({ success: true });
      expect(from.mock.calls.map(([table]) => table)).toEqual(['entries', 'tags', 'user_settings']);
    });

    it('途中の削除失敗で後続tableを削除しない', async () => {
      const { service, from } = createSupabase({
        tables: {
          entries: { data: [] },
          tags: { error: { message: 'tags failed' } },
          user_settings: { data: [] },
        },
      });

      await expect(service.deleteAllData(USER_ID)).rejects.toMatchObject({
        code: 'DELETE_DATA_FAILED',
        message: 'tags deletion failed: tags failed',
      });
      expect(from).not.toHaveBeenCalledWith('user_settings');
    });
  });

  describe('exportData', () => {
    it('現行dataとlegacy互換の空配列を返す', async () => {
      const profile = { id: USER_ID, email: USER_EMAIL };
      const entries = [{ id: 'entry-1', user_id: USER_ID }];
      const tags = [{ id: 'tag-1', user_id: USER_ID }];
      const settings = { id: 'settings-1', user_id: USER_ID };
      const { service } = createSupabase({
        tables: {
          profiles: { data: profile },
          entries: { data: entries },
          tags: { data: tags },
          user_settings: { data: settings },
        },
      });

      const result = await service.exportData({ userId: USER_ID });

      expect(result.userId).toBe(USER_ID);
      expect(result.exportedAt).toEqual(expect.any(String));
      expect(result.data).toEqual({
        profile,
        entries,
        plans: entries,
        tags,
        records: [],
        planTags: [],
        recordTags: [],
        userSettings: settings,
      });
    });

    it('profileが未作成ならnullとしてexportする', async () => {
      const { service } = createSupabase({
        tables: {
          profiles: { error: { code: 'PGRST116', message: 'not found' } },
          entries: { data: [] },
          tags: { data: [] },
          user_settings: { data: null },
        },
      });

      await expect(service.exportData({ userId: USER_ID })).resolves.toMatchObject({
        data: { profile: null },
      });
    });

    it('entries取得失敗をEXPORT_FAILEDに変換する', async () => {
      const { service } = createSupabase({
        tables: {
          profiles: { data: null },
          entries: { error: { message: 'entries fetch failed' } },
          tags: { data: [] },
          user_settings: { data: null },
        },
      });

      await expect(service.exportData({ userId: USER_ID })).rejects.toMatchObject({
        code: 'EXPORT_FAILED',
        message: 'Entries fetch error: entries fetch failed',
      });
    });

    it('tags取得失敗をEXPORT_FAILEDに変換する', async () => {
      const { service } = createSupabase({
        tables: {
          profiles: { data: null },
          entries: { data: [] },
          tags: { error: { message: 'tags fetch failed' } },
          user_settings: { data: null },
        },
      });

      await expect(service.exportData({ userId: USER_ID })).rejects.toMatchObject({
        code: 'EXPORT_FAILED',
        message: 'Tags fetch error: tags fetch failed',
      });
    });
  });
});

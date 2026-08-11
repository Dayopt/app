import { beforeEach, describe, expect, it, vi } from 'vitest';

import { publicRecordSelect, publicUserSettingsSelect } from '@/lib/database';
import { createChainableMock } from '@/lib/test/trpc-test-helpers';

const deleteUser = vi.hoisted(() => vi.fn());
// 再認証は service-role 経由の専用モジュールへ移した（#1925）。ここでは契約だけを固定し、
// 迂回そのものの挙動は password-reauthentication.test.ts が担う
const verifyPasswordWithCaptchaBypass = vi.hoisted(() => vi.fn());
const beforeIdentityDeletion = vi.hoisted(() => vi.fn());
const loggerInfo = vi.hoisted(() => vi.fn());
const loggerWarn = vi.hoisted(() => vi.fn());
const adminFrom = vi.hoisted(() => vi.fn());
const captureUnexpectedError = vi.hoisted(() => vi.fn());
const captureUnexpectedDatabaseError = vi.hoisted(() => vi.fn());
const sendAccountDeletionEmail = vi.hoisted(() => vi.fn());
const getUserLocale = vi.hoisted(() => vi.fn());

vi.mock('@/lib/email/router', () => ({ sendAccountDeletionEmail, getUserLocale }));

vi.mock('@/lib/supabase/oauth', () => ({
  createServiceRoleClient: () => ({ auth: { admin: { deleteUser } }, from: adminFrom }),
}));
vi.mock('../password-reauthentication', () => ({ verifyPasswordWithCaptchaBypass }));
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
        auth: { signInWithPassword, mfa: { listFactors, challengeAndVerify } },
        storage: { from: vi.fn(() => ({ list, remove })) },
      } as never,
      { beforeIdentityDeletion },
    ),
    from,
    list,
    remove,
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

describe('createUserService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    verifyPasswordWithCaptchaBypass.mockResolvedValue({ outcome: 'verified' });
    beforeIdentityDeletion.mockResolvedValue({ status: 'completed' });
    sendAccountDeletionEmail.mockResolvedValue({ success: true });
    getUserLocale.mockResolvedValue('ja');
    deleteUser.mockResolvedValue({ data: {}, error: null });
    adminFrom.mockImplementation(() => createChainableMock([], null));
    captureUnexpectedDatabaseError.mockImplementation((error: unknown) =>
      error instanceof Error ? error : new Error('Unexpected database failure', { cause: error }),
    );
  });

  describe('deleteAccount', () => {
    it('パスワードを持つユーザーでpasswordが空ならINVALID_INPUTを投げる', async () => {
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions({ password: '' }))).rejects.toMatchObject({
        code: 'INVALID_INPUT',
      });
      expect(verifyPasswordWithCaptchaBypass).not.toHaveBeenCalled();
    });

    it('確認文字列がDELETEでなければINVALID_INPUTを投げる', async () => {
      const { service } = createSupabase();

      await expect(
        service.deleteAccount(deleteOptions({ confirmText: 'delete' })),
      ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    it('パスワードが違えばINVALID_PASSWORDを投げる', async () => {
      verifyPasswordWithCaptchaBypass.mockResolvedValue({ outcome: 'invalid_password' });
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'INVALID_PASSWORD',
      });
      expect(deleteUser).not.toHaveBeenCalled();
    });

    // 迂回が壊れた時に「パスワードが違います」と誤って伝えない。削除も通さない（fail closed）
    it('再認証手段が使えなければREAUTH_UNAVAILABLEを投げて削除しない', async () => {
      verifyPasswordWithCaptchaBypass.mockResolvedValue({ outcome: 'unavailable' });
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'REAUTH_UNAVAILABLE',
      });
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('外部データの準備を完了してからauth userを削除する', async () => {
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).resolves.toEqual({ success: true });
      expect(beforeIdentityDeletion).toHaveBeenCalledWith({ userId: USER_ID });
      expect(deleteUser).toHaveBeenCalledWith(USER_ID);
    });

    it('外部データの準備失敗時はfail closedでaccount削除を止める', async () => {
      beforeIdentityDeletion.mockRejectedValueOnce(new Error('external cleanup unavailable'));
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'DELETE_FAILED',
        message: 'Failed to prepare account deletion',
      });
      expect(captureUnexpectedError).toHaveBeenCalledOnce();
      expect(deleteUser).not.toHaveBeenCalled();
    });

    it('外部データの準備が競合中なら再試行可能なCONFLICTにする', async () => {
      beforeIdentityDeletion.mockResolvedValueOnce({ status: 'contention' });
      const { service } = createSupabase();

      await expect(service.deleteAccount(deleteOptions())).rejects.toMatchObject({
        code: 'CONFLICT',
      });
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
      beforeIdentityDeletion.mockRejectedValueOnce(new Error('cleanup unavailable'));
      const { service } = createSupabase();

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
        const { service } = createSupabase();

        await expect(service.deleteAccount(googleUserDeleteOptions())).resolves.toEqual({
          success: true,
        });
        expect(verifyPasswordWithCaptchaBypass).not.toHaveBeenCalled();
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
    it('records、plansを依存順に削除して合計件数を返す', async () => {
      const adminQueries = mockAdminTables({
        records: { data: [{ id: 'record-1' }] },
        plans: { data: [{ id: 'plan-1' }, { id: 'plan-2' }] },
      });
      const { service } = createSupabase();

      await expect(service.deleteBlocks(USER_ID)).resolves.toEqual({ deletedCount: 3 });
      expect(adminFrom.mock.calls.map(([table]) => table)).toEqual(['records', 'plans']);
      for (const query of adminQueries.values()) {
        expect(query.eq).toHaveBeenCalledWith('user_id', USER_ID);
        expect(query.select).toHaveBeenCalledWith('id');
      }
    });

    it('削除エラーをDELETE_DATA_FAILEDに変換する', async () => {
      mockAdminTables({
        records: { error: { message: 'records failed' } },
      });
      const { service } = createSupabase();

      await expect(service.deleteBlocks(USER_ID)).rejects.toMatchObject({
        code: 'DELETE_DATA_FAILED',
        message: 'records deletion failed',
      });
    });
  });

  describe('deleteAllData', () => {
    it('records、plans、tags、user_settingsの順に削除する', async () => {
      mockAdminTables({
        records: { data: [] },
        plans: { data: [] },
        tags: { data: [] },
        user_settings: { data: [] },
      });
      const { service } = createSupabase();

      await expect(service.deleteAllData(USER_ID)).resolves.toEqual({ success: true });
      expect(adminFrom.mock.calls.map(([table]) => table)).toEqual([
        'records',
        'plans',
        'tags',
        'user_settings',
      ]);
    });

    it('途中の削除失敗で後続tableを削除しない', async () => {
      mockAdminTables({
        records: { data: [] },
        plans: { error: { message: 'plans failed' } },
      });
      const { service } = createSupabase();

      await expect(service.deleteAllData(USER_ID)).rejects.toMatchObject({
        code: 'DELETE_DATA_FAILED',
        message: 'plans deletion failed',
      });
      expect(adminFrom).not.toHaveBeenCalledWith('tags');
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

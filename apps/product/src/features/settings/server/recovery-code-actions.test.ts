import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetWriteFenceCacheForTestsOnly } from '@/lib/ops/write-fence';

const mocks = vi.hoisted(() => ({
  captureUnexpectedDatabaseError: vi.fn(),
  createClient: vi.fn(),
  deleteRows: vi.fn(),
  deleteEq: vi.fn(),
  from: vi.fn(),
  generateRecoveryCodes: vi.fn(),
  getUser: vi.fn(),
  hashRecoveryCode: vi.fn(),
  insertRows: vi.fn(),
  observeAuthOperation: vi.fn(),
  writeFenceMaybeSingle: vi.fn(),
}));

vi.mock('@/lib/auth/recovery-codes', () => ({
  generateRecoveryCodes: mocks.generateRecoveryCodes,
  hashRecoveryCode: mocks.hashRecoveryCode,
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: mocks.captureUnexpectedDatabaseError,
  observeAuthOperation: mocks.observeAuthOperation,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mocks.createClient,
}));

import { generateAndSaveRecoveryCodesAction } from './recovery-code-actions';

const USER_ID = '12345678-1234-4234-9234-123456789abc';
const FIXED_FAILURE = 'Failed to generate recovery codes';

describe('generateAndSaveRecoveryCodesAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetWriteFenceCacheForTestsOnly();
    mocks.generateRecoveryCodes.mockReturnValue(['recovery-a', 'recovery-b']);
    mocks.hashRecoveryCode.mockImplementation((code: string) => `hash:${code}`);
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.observeAuthOperation.mockImplementation(
      async (_operation: string, call: () => PromiseLike<unknown>) => call(),
    );
    mocks.deleteRows.mockReturnValue({ eq: mocks.deleteEq });
    mocks.deleteEq.mockResolvedValue({ error: null });
    mocks.insertRows.mockResolvedValue({ error: null });
    mocks.writeFenceMaybeSingle.mockResolvedValue({ data: { fence_enabled: false }, error: null });
    mocks.from.mockImplementation((table: string) =>
      table === 'write_fence_control'
        ? { select: () => ({ eq: () => ({ maybeSingle: mocks.writeFenceMaybeSingle }) }) }
        : { delete: mocks.deleteRows, insert: mocks.insertRows },
    );
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, from: mocks.from });
  });

  it('replaces existing codes and returns the newly generated values', async () => {
    await expect(generateAndSaveRecoveryCodesAction()).resolves.toEqual({
      codes: ['recovery-a', 'recovery-b'],
      error: null,
    });

    expect(mocks.deleteEq).toHaveBeenCalledWith('user_id', USER_ID);
    expect(mocks.insertRows).toHaveBeenCalledWith([
      { user_id: USER_ID, code_hash: 'hash:recovery-a' },
      { user_id: USER_ID, code_hash: 'hash:recovery-b' },
    ]);
    expect(mocks.captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });

  it('captures a delete failure once and does not continue to insert', async () => {
    const deleteError = { code: 'DATABASE_UNAVAILABLE', message: 'private database detail' };
    mocks.deleteEq.mockResolvedValueOnce({ error: deleteError });

    const result = await generateAndSaveRecoveryCodesAction();

    expect(result).toEqual({ codes: null, error: FIXED_FAILURE });
    expect(mocks.insertRows).not.toHaveBeenCalled();
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledTimes(1);
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(deleteError, {
      feature: 'mfa_recovery_codes',
      operation: 'delete_existing_codes',
    });
    expect(JSON.stringify(result)).not.toContain(deleteError.message);
  });

  it('captures an insert failure once without returning provider details', async () => {
    const insertError = { code: '23514', message: 'private constraint detail' };
    mocks.insertRows.mockResolvedValueOnce({ error: insertError });

    const result = await generateAndSaveRecoveryCodesAction();

    expect(result).toEqual({ codes: null, error: FIXED_FAILURE });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledTimes(1);
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(insertError, {
      feature: 'mfa_recovery_codes',
      operation: 'insert_new_codes',
    });
    expect(JSON.stringify(result)).not.toContain(insertError.message);
  });

  it('captures a thrown original Error once and returns the fixed failure', async () => {
    const originalError = new Error('connection failed');
    mocks.createClient.mockRejectedValueOnce(originalError);

    await expect(generateAndSaveRecoveryCodesAction()).resolves.toEqual({
      codes: null,
      error: FIXED_FAILURE,
    });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(originalError, {
      feature: 'mfa_recovery_codes',
      operation: 'generate_and_save_codes',
    });
  });

  it('treats an unauthenticated user as an expected outcome', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });

    await expect(generateAndSaveRecoveryCodesAction()).resolves.toEqual({
      codes: null,
      error: 'User not found',
    });
    expect(mocks.captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });

  it('write fence が有効な時は既存コードを削除せずに拒否する', async () => {
    mocks.writeFenceMaybeSingle.mockResolvedValue({ data: { fence_enabled: true }, error: null });

    const result = await generateAndSaveRecoveryCodesAction();

    expect(result).toEqual({
      codes: null,
      error: 'Writes are temporarily paused for maintenance',
    });
    expect(mocks.deleteRows).not.toHaveBeenCalled();
    expect(mocks.insertRows).not.toHaveBeenCalled();
  });
});

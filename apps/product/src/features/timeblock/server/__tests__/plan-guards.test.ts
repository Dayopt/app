import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

import {
  ensurePlanNotRecorded,
  handleMutationError,
  handleRecordMutationError,
} from '../plan-guards';
import { TimeblockServiceError } from '../timeblock-service-error';
import type { ServiceSupabaseClient } from '../types';

const mocks = vi.hoisted(() => ({
  captureUnexpectedDatabaseError: vi.fn(),
  normalizedError: new Error('normalized database error'),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: mocks.captureUnexpectedDatabaseError,
}));

describe('plan guards observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captureUnexpectedDatabaseError.mockReturnValue(mocks.normalizedError);
  });

  it('record確認のDB障害を一度captureし、generic errorへcauseを保持する', async () => {
    const databaseError = { code: 'XX000', message: 'private database detail' };
    const query = createChainableMock([], databaseError);
    const supabase = createMockSupabase({ from: vi.fn(() => query) });

    const caught = await ensurePlanNotRecorded(
      supabase as unknown as ServiceSupabaseClient,
      'user-1',
      'plan-1',
    ).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(TimeblockServiceError);
    expect(caught).toMatchObject({
      cause: mocks.normalizedError,
      code: 'FETCH_FAILED',
      message: 'Failed to check recorded plan',
    });
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(databaseError, {
      feature: 'timeblock',
      operation: 'check_plan_recorded',
    });
  });

  it('予期しないmutation障害だけをcaptureし、raw messageを公開しない', () => {
    const databaseError = { code: 'XX000', message: 'private database detail' };

    expect(() =>
      handleMutationError(databaseError, 'UPDATE_FAILED', 'Failed to update plan'),
    ).toThrowError(
      expect.objectContaining({
        cause: mocks.normalizedError,
        code: 'UPDATE_FAILED',
        message: 'Failed to update plan',
      }),
    );
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(databaseError, {
      feature: 'timeblock',
      operation: 'update_failed',
    });
  });

  it.each([
    [
      '23P01',
      () => handleMutationError({ code: '23P01', message: 'overlap' }, 'CREATE_FAILED', ''),
    ],
    ['23505', () => handleRecordMutationError({ code: '23505', message: 'duplicate' }, '')],
  ])('%sはexpected errorとしてcaptureしない', (_code, run) => {
    expect(run).toThrow(TimeblockServiceError);
    expect(mocks.captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const addEventProcessor = vi.hoisted(() => vi.fn());
const suppressTracing = vi.hoisted(() => vi.fn());
const withScope = vi.hoisted(() => vi.fn());

vi.mock('@sentry/nextjs', () => ({
  suppressTracing,
  withScope,
}));

import { runPrivateTimeblockSearchQuery } from '../private-timeblock-search-query';

describe('runPrivateTimeblockSearchQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    suppressTracing.mockImplementation(async (callback: () => Promise<unknown>) => callback());
    withScope.mockImplementation(async (callback: (scope: unknown) => Promise<unknown>) =>
      callback({ addEventProcessor }),
    );
  });

  it('queryのawaitをSentry抑止scope内で実行する', async () => {
    const operation = vi.fn(async () => ({ data: ['result'], error: null }));

    await expect(runPrivateTimeblockSearchQuery(operation)).resolves.toEqual({
      data: ['result'],
      error: null,
    });

    expect(withScope).toHaveBeenCalledTimes(1);
    expect(addEventProcessor).toHaveBeenCalledWith(expect.any(Function));
    expect(suppressTracing).toHaveBeenCalledTimes(1);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('transport例外のURLや検索語を呼び出し側へ出さない', async () => {
    const privateMessage = 'GET /rest/v1/plans?or=note.ilike.private-words';

    const caught = await runPrivateTimeblockSearchQuery(() =>
      Promise.reject(new Error(privateMessage)),
    ).catch((error: unknown) => error);

    expect(caught).toMatchObject({
      code: 'FETCH_FAILED',
      message: 'Failed to execute timeblock search',
    });
    expect((caught as Error).message).not.toContain('private-words');
  });
});

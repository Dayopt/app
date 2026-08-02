import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const trackReviewOpened = vi.hoisted(() => vi.fn());

vi.mock('../review-analytics-service', () => ({ trackReviewOpened }));

import { reviewRouter } from '../router';

const createCaller = createCallerFactory(reviewRouter);

describe('review analytics router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackReviewOpened.mockResolvedValue(undefined);
  });

  it('rejects unauthenticated calls', async () => {
    await expect(
      createCaller(createMockContext({ userId: undefined })).trackOpened(),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('uses the authenticated context user without client input', async () => {
    const caller = createCaller(createMockContext({ userId: 'user-1' }));

    await expect(caller.trackOpened()).resolves.toEqual({ success: true });
    expect(trackReviewOpened).toHaveBeenCalledWith('user-1');
  });
});

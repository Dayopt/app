import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const trackReviewOpened = vi.hoisted(() => vi.fn());

vi.mock('./review-analytics-service', () => ({ trackReviewOpened }));

import { reviewRouter } from './router';

const createCaller = createCallerFactory(reviewRouter);

describe('review analytics router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    trackReviewOpened.mockResolvedValue(undefined);
  });

  // 「未認証は UNAUTHORIZED」の契約は write-fence-coverage.test.ts が全 procedure 横断で
  // 機械検証する（#2187 E-3）。ここでの個別 assert は重複だったため削除した。
  it('uses the authenticated context user without client input', async () => {
    const caller = createCaller(createMockContext({ userId: 'user-1' }));

    await expect(caller.trackOpened()).resolves.toEqual({ success: true });
    expect(trackReviewOpened).toHaveBeenCalledWith('user-1');
  });
});

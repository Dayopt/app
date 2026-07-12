import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const getTagDashboard = vi.hoisted(() => vi.fn());

vi.mock('../statistics-service', () => ({
  StatisticsService: class {
    getTagDashboard = getTagDashboard;
  },
}));

import { tagStatisticsRouter } from '../tag-statistics';

const createCaller = createCallerFactory(tagStatisticsRouter);
const TAG_ID = '11111111-1111-4111-8111-111111111111';
const INPUT = {
  tagId: TAG_ID,
  startDate: '2026-05-01T00:00:00.000Z',
  endDate: '2026-05-07T23:59:59.999Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  getTagDashboard.mockResolvedValue({
    tag: { id: TAG_ID, name: 'Work' },
    summary: { recordCount: 0 },
    dailyRows: [],
    entries: [],
  });
});

describe('tag-statistics router', () => {
  it('未認証では UNAUTHORIZED を返す', async () => {
    const caller = createCaller(createMockContext({ userId: undefined }));

    await expect(caller.getTagDashboard(INPUT)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(getTagDashboard).not.toHaveBeenCalled();
  });

  it('入力とdefault limitをStatisticsServiceへ渡す', async () => {
    const caller = createCaller(createMockContext({ userId: 'user-1' }));

    await expect(caller.getTagDashboard(INPUT)).resolves.toMatchObject({
      tag: { id: TAG_ID, name: 'Work' },
      summary: { recordCount: 0 },
    });
    expect(getTagDashboard).toHaveBeenCalledWith('user-1', { ...INPUT, limit: 50 });
  });

  it('Pro未契約でも認証済みなら取得できる', async () => {
    const caller = createCaller(createMockContext({ userId: 'user-1' }));

    await expect(caller.getTagDashboard({ ...INPUT, limit: 1 })).resolves.toBeDefined();
    expect(getTagDashboard).toHaveBeenCalledWith('user-1', { ...INPUT, limit: 1 });
  });
});

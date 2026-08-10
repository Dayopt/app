import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const warn = vi.hoisted(() => vi.fn());

vi.mock('@/lib/logger', () => ({
  logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const planService = vi.hoisted(() => ({
  list: vi.fn(),
  delete: vi.fn(),
}));
const recordService = vi.hoisted(() => ({
  delete: vi.fn(),
}));

vi.mock('../service-index', () => ({
  createPlanService: () => planService,
  createRecordService: () => recordService,
}));

import { createTRPCRouter } from '@/lib/trpc/procedures';
import { plansRouter } from '../plans-router';
import { recordsRouter } from '../records-router';

// app-router.ts と同じ mount 名で束ねる。middleware が受け取る path は
// mount prefix 込み（plans.delete）で、観測 log の判定キーもこの形。
const testRouter = createTRPCRouter({ plans: plansRouter, records: recordsRouter });
const callPlans = (ctx: ReturnType<typeof createMockContext>) =>
  createCallerFactory(testRouter)(ctx).plans;
const callRecords = (ctx: ReturnType<typeof createMockContext>) =>
  createCallerFactory(testRouter)(ctx).records;

describe('legacy timeblock route observation (candidate 8 Stage 8-1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    planService.list.mockResolvedValue([]);
    planService.delete.mockResolvedValue({ success: true });
    recordService.delete.mockResolvedValue({ success: true });
  });

  it('legacy mutation は path 付きの構造化 warn を 1 回出す', async () => {
    const caller = callPlans(createMockContext({ userId: 'user-1' }));

    await caller.delete({ id: '00000000-0000-4000-8000-000000000001' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('legacy_timeblock_route_invoked', {
      path: 'plans.delete',
    });
  });

  it('records 側の legacy mutation も同じ観測を通る', async () => {
    const caller = callRecords(createMockContext({ userId: 'user-1' }));

    await caller.delete({ id: '00000000-0000-4000-8000-000000000002' });

    expect(warn).toHaveBeenCalledWith('legacy_timeblock_route_invoked', {
      path: 'records.delete',
    });
  });

  it('現役の read 経路（plans.list）では観測 warn を出さない', async () => {
    const caller = callPlans(createMockContext({ userId: 'user-1' }));

    await caller.list();

    expect(warn).not.toHaveBeenCalled();
  });
});

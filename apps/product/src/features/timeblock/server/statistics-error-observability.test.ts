import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';

import {
  fetchPlans,
  fetchRecords,
  fetchRecordsByPlanIds,
  fetchTagsById,
} from './statistics-fetchers';
import { StatisticsTagDashboardService } from './statistics-tag-dashboard-service';
import type { ServiceSupabaseClient } from './types';

const mocks = vi.hoisted(() => ({
  captureUnexpectedDatabaseError: vi.fn(),
  normalizedError: new Error('normalized database error'),
}));

vi.mock('@/lib/sentry', () => ({
  captureUnexpectedDatabaseError: mocks.captureUnexpectedDatabaseError,
}));
vi.mock('@/lib/server/user-timezone-cache', () => ({
  getUserTimezone: vi.fn(async () => 'UTC'),
}));

const DATABASE_ERROR = { code: 'XX000', message: 'private database detail' };
const USER_ID = 'user-1';

function clientFor(tableData: Record<string, ReturnType<typeof createChainableMock>>) {
  const supabase = createMockSupabase();
  supabase.from.mockImplementation((table: string) => {
    const query = tableData[table];
    if (!query) throw new Error(`Unexpected test table: ${table}`);
    return query;
  });
  return supabase as unknown as ServiceSupabaseClient;
}

describe('statistics fetcher observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captureUnexpectedDatabaseError.mockReturnValue(mocks.normalizedError);
  });

  it.each([
    ['fetch_records', (client: ServiceSupabaseClient) => fetchRecords(client, USER_ID)],
    [
      'fetch_records_by_plan_ids',
      (client: ServiceSupabaseClient) => fetchRecordsByPlanIds(client, USER_ID, ['plan-1']),
    ],
    ['fetch_plans', (client: ServiceSupabaseClient) => fetchPlans(client, USER_ID)],
    ['fetch_tags', (client: ServiceSupabaseClient) => fetchTagsById(client, USER_ID)],
  ])('%sは元DB障害を一度captureしてnormalized errorをthrowする', async (operation, run) => {
    const query = createChainableMock([], DATABASE_ERROR);
    const client = clientFor({ plans: query, records: query, tags: query });

    await expect(run(client)).rejects.toBe(mocks.normalizedError);
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(DATABASE_ERROR, {
      feature: 'statistics',
      operation,
    });
  });
});

describe('StatisticsTagDashboardService observability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.captureUnexpectedDatabaseError.mockReturnValue(mocks.normalizedError);
  });

  function serviceWith(
    tagQuery: ReturnType<typeof createChainableMock>,
    recordQuery = createChainableMock([]),
    planQuery = createChainableMock([]),
  ) {
    return new StatisticsTagDashboardService(
      clientFor({ plans: planQuery, records: recordQuery, tags: tagQuery }),
    );
  }

  const input = {
    tagId: 'tag-1',
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2026-07-02T00:00:00.000Z',
    limit: 10,
  };

  it('tag不存在はexpected NOT_FOUNDとしてcaptureしない', async () => {
    await expect(
      serviceWith(createChainableMock(null)).getTagDashboard(USER_ID, input),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Tag not found' });
    expect(mocks.captureUnexpectedDatabaseError).not.toHaveBeenCalled();
  });

  it.each([
    ['fetch_tag_by_id', 'tags'],
    ['fetch_tag_dashboard_records', 'records'],
    ['fetch_tag_dashboard_plans', 'plans'],
  ] as const)('%sのDB障害を一度captureする', async (operation, failingTable) => {
    const queries = {
      plans: createChainableMock([]),
      records: createChainableMock([]),
      tags: createChainableMock({ id: 'tag-1', name: 'Tag', color: null, icon: null }),
    };
    queries[failingTable] = createChainableMock([], DATABASE_ERROR);
    const service = new StatisticsTagDashboardService(clientFor(queries));

    await expect(service.getTagDashboard(USER_ID, input)).rejects.toBe(mocks.normalizedError);
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledOnce();
    expect(mocks.captureUnexpectedDatabaseError).toHaveBeenCalledWith(DATABASE_ERROR, {
      feature: 'statistics',
      operation,
    });
  });
});

import { describe, expect, it } from 'vitest';

import type { Database } from '@/lib/database';
import { databaseTables } from '@/lib/database';
import { createChainableMock, createMockSupabase } from '@/lib/test/trpc-test-helpers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TagStatisticsService } from '../tag-statistics-service';

const USER_ID = 'user-1';

function createService(tableData: Record<string, ReturnType<typeof createChainableMock>>) {
  const mockSupabase = createMockSupabase();
  mockSupabase.from.mockImplementation((table: string) => {
    const mock = tableData[table];
    if (!mock) throw new Error(`Unexpected table access in test: ${table}`);
    return mock;
  });
  return new TagStatisticsService(mockSupabase as unknown as SupabaseClient<Database>);
}

describe('TagStatisticsService.getStatsFromRecords', () => {
  it('records を実績として集計し record_count 降順で返す', async () => {
    const service = createService({
      tags: createChainableMock([
        { id: 'tag-1', name: 'Deep Work', color: 'blue', icon: null },
        { id: 'tag-2', name: 'Meeting', color: 'red', icon: null },
      ]),
      [databaseTables.records]: createChainableMock([
        { tag_id: 'tag-2', start_at: '2026-07-01T00:00:00Z' },
        { tag_id: 'tag-1', start_at: '2026-07-02T00:00:00Z' },
        { tag_id: 'tag-1', start_at: '2026-07-03T00:00:00Z' },
      ]),
    });

    const result = await service.getStatsFromRecords(USER_ID);

    expect(result).toEqual([
      {
        id: 'tag-1',
        name: 'Deep Work',
        color: 'blue',
        icon: null,
        record_count: 2,
        last_used_at: '2026-07-03T00:00:00Z',
      },
      {
        id: 'tag-2',
        name: 'Meeting',
        color: 'red',
        icon: null,
        record_count: 1,
        last_used_at: '2026-07-01T00:00:00Z',
      },
    ]);
  });

  it('tag が無ければ空配列を返す（records は問い合わせない）', async () => {
    const service = createService({ tags: createChainableMock([]) });
    expect(await service.getStatsFromRecords(USER_ID)).toEqual([]);
  });

  it('record の無いタグは record_count=0, last_used_at=null になる', async () => {
    const service = createService({
      tags: createChainableMock([{ id: 'tag-1', name: 'Deep Work', color: 'blue', icon: null }]),
      [databaseTables.records]: createChainableMock([]),
    });

    const result = await service.getStatsFromRecords(USER_ID);
    expect(result).toEqual([
      {
        id: 'tag-1',
        name: 'Deep Work',
        color: 'blue',
        icon: null,
        record_count: 0,
        last_used_at: null,
      },
    ]);
  });
});

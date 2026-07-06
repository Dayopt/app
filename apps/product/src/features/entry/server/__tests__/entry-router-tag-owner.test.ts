/**
 * entries router tag owner guard regression tests.
 *
 * caller supplied tagId must belong to ctx.userId before entries.tag_id is written.
 */

import { TRPCError } from '@trpc/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

const serviceMocks = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('@/lib/rate-limit/entry-create-limit', () => ({
  isEntryCreateLimited: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/lib/server/user-timezone-cache', () => ({
  getUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

vi.mock('../service-index', () => ({
  createEntryService: vi.fn(() => serviceMocks),
}));

import { entriesCoreRouter } from '../router';

const createCaller = createCallerFactory(entriesCoreRouter);

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ENTRY_ID = '22222222-2222-2222-2222-222222222222';
const TAG_ID = '33333333-3333-3333-3333-333333333333';

interface QueryResult {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}

function createQuery(result: QueryResult) {
  const query = {
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    then: vi.fn().mockImplementation((resolve: (value: QueryResult) => void) => resolve(result)),
  };
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  serviceMocks.create.mockResolvedValue({ id: ENTRY_ID });
});

describe('entries router tag owner guard', () => {
  it('create rejects a foreign tag before creating an entry', async () => {
    const tagQuery = createQuery({ data: null, error: null });
    const ctx = createMockContext({ userId: USER_ID });
    ctx.supabase.from = vi.fn(() => tagQuery) as never;
    const caller = createCaller(ctx);

    await expect(
      caller.create({
        title: 'Focus',
        start_time: '2026-07-06T00:00:00.000Z',
        end_time: '2026-07-06T01:00:00.000Z',
        tagId: TAG_ID,
      }),
    ).rejects.toThrow(expect.objectContaining({ code: 'BAD_REQUEST' }));

    expect(ctx.supabase.from).toHaveBeenCalledWith('tags');
    expect(serviceMocks.create).not.toHaveBeenCalled();
  });

  it('bulkAddTags rejects a foreign tag before updating entries', async () => {
    const tagQuery = createQuery({ data: null, error: null });
    const ctx = createMockContext({ userId: USER_ID });
    ctx.supabase.from = vi.fn(() => tagQuery) as never;
    const caller = createCaller(ctx);

    await expect(caller.bulkAddTags({ entryIds: [ENTRY_ID], tagId: TAG_ID })).rejects.toThrow(
      expect.objectContaining({ code: 'BAD_REQUEST' }),
    );

    expect(ctx.supabase.from).toHaveBeenCalledTimes(1);
    expect(ctx.supabase.from).toHaveBeenCalledWith('tags');
  });

  it('bulkAddTags updates user-owned entries when the tag belongs to the caller', async () => {
    const tagQuery = createQuery({ data: { id: TAG_ID }, error: null });
    const entriesQuery = createQuery({ data: [], error: null, count: 1 });
    const ctx = createMockContext({ userId: USER_ID });
    ctx.supabase.from = vi.fn((table: string) =>
      table === 'tags' ? tagQuery : entriesQuery,
    ) as never;
    const caller = createCaller(ctx);

    const result = await caller.bulkAddTags({ entryIds: [ENTRY_ID], tagId: TAG_ID });

    expect(result).toEqual({ success: true, count: 1 });
    expect(entriesQuery.update).toHaveBeenCalledWith({ tag_id: TAG_ID });
    expect(entriesQuery.in).toHaveBeenCalledWith('id', [ENTRY_ID]);
    expect(entriesQuery.eq).toHaveBeenCalledWith('user_id', USER_ID);
  });

  it('throws TRPCError for invalid tag ids', async () => {
    const tagQuery = createQuery({ data: null, error: null });
    const ctx = createMockContext({ userId: USER_ID });
    ctx.supabase.from = vi.fn(() => tagQuery) as never;
    const caller = createCaller(ctx);

    await expect(
      caller.bulkAddTags({ entryIds: [ENTRY_ID], tagId: TAG_ID }),
    ).rejects.toBeInstanceOf(TRPCError);
  });
});

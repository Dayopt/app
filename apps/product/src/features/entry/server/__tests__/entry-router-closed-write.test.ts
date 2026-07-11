/**
 * entries router closed-write regression tests（Step 8 cutover）。
 *
 * runtime の正は plans / logs へ切り替え済み。entries への書き込みは
 * PRECONDITION_FAILED（ENTRIES_WRITE_CLOSED）を返すことを保証する。
 * list / getById は read として引き続き動作する。
 */

import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

import { createMockContext } from '@/lib/test/trpc-test-helpers';
import { createCallerFactory } from '@/lib/trpc/procedures';

vi.mock('../service-index', () => ({
  createEntryService: vi.fn(() => ({
    list: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue({ id: ENTRY_ID }),
  })),
}));

import { entriesCoreRouter } from '../router';

const createCaller = createCallerFactory(entriesCoreRouter);

const USER_ID = '11111111-1111-1111-1111-111111111111';
const ENTRY_ID = '22222222-2222-2222-2222-222222222222';
const TAG_ID = '33333333-3333-3333-3333-333333333333';

function expectClosed(promise: Promise<unknown>) {
  return expect(promise).rejects.toMatchObject({
    code: 'PRECONDITION_FAILED',
    message: 'ENTRIES_WRITE_CLOSED',
  });
}

describe('entries router — closed write / read remains', () => {
  it('list はそのまま動作する', async () => {
    const ctx = createMockContext({ userId: USER_ID });
    const caller = createCaller(ctx);

    await expect(caller.list()).resolves.toEqual([]);
  });

  it('getById はそのまま動作する', async () => {
    const ctx = createMockContext({ userId: USER_ID });
    const caller = createCaller(ctx);

    await expect(caller.getById({ id: ENTRY_ID })).resolves.toMatchObject({ id: ENTRY_ID });
  });

  it('create は PRECONDITION_FAILED を返す', async () => {
    const ctx = createMockContext({ userId: USER_ID });
    const caller = createCaller(ctx);

    await expectClosed(
      caller.create({
        title: 'Focus',
        start_time: '2026-07-06T00:00:00.000Z',
        end_time: '2026-07-06T01:00:00.000Z',
        tagId: TAG_ID,
      }),
    );
  });

  it('update は PRECONDITION_FAILED を返す', async () => {
    const ctx = createMockContext({ userId: USER_ID });
    const caller = createCaller(ctx);

    await expectClosed(caller.update({ id: ENTRY_ID, data: { title: 'x' } }));
  });

  it('delete は PRECONDITION_FAILED を返す', async () => {
    const ctx = createMockContext({ userId: USER_ID });
    const caller = createCaller(ctx);

    await expectClosed(caller.delete({ id: ENTRY_ID }));
  });

  it('bulkAddTags は PRECONDITION_FAILED を返す', async () => {
    const ctx = createMockContext({ userId: USER_ID });
    const caller = createCaller(ctx);

    await expectClosed(caller.bulkAddTags({ entryIds: [ENTRY_ID], tagId: TAG_ID }));
  });

  it('closed mutation は TRPCError のインスタンスを投げる', async () => {
    const ctx = createMockContext({ userId: USER_ID });
    const caller = createCaller(ctx);

    await expect(caller.skip({ id: ENTRY_ID })).rejects.toBeInstanceOf(TRPCError);
  });
});

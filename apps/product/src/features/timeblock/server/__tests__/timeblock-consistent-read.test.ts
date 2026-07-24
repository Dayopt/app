import { describe, expect, it, vi } from 'vitest';

import { readCompleteTimeblockPages } from '../timeblock-consistent-read';

describe('readCompleteTimeblockPages', () => {
  it('exact countへ到達するまで決定offsetで全pageを読む', async () => {
    const rows = ['a', 'b', 'c'];
    const readPage = vi.fn(async (offset: number, limit: number) => ({
      rows: rows.slice(offset, offset + limit),
      totalCount: offset === 0 ? rows.length : null,
    }));

    await expect(
      readCompleteTimeblockPages({
        subject: 'review',
        maxItems: 5,
        pageSize: 2,
        signal: new AbortController().signal,
        readPage,
      }),
    ).resolves.toEqual(rows);
    expect(readPage.mock.calls).toEqual([
      [0, 2],
      [2, 1],
    ]);
  });

  it('count欠落・unsafe count・requested limit超過をfail closedにする', async () => {
    const base = {
      subject: 'review' as const,
      maxItems: 5,
      pageSize: 2,
      signal: new AbortController().signal,
    };

    await expect(
      readCompleteTimeblockPages({
        ...base,
        readPage: async () => ({ rows: [], totalCount: null }),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' });
    await expect(
      readCompleteTimeblockPages({
        ...base,
        readPage: async () => ({
          rows: [],
          totalCount: Number.MAX_SAFE_INTEGER + 1,
        }),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' });
    await expect(
      readCompleteTimeblockPages({
        ...base,
        readPage: async () => ({ rows: ['a', 'b', 'c'], totalCount: 3 }),
      }),
    ).rejects.toMatchObject({ code: 'FETCH_FAILED' });
  });

  it('exact count未到達のshort pageを内部PAGE_INCOMPLETEにする', async () => {
    await expect(
      readCompleteTimeblockPages({
        subject: 'occupancy',
        maxItems: 5,
        pageSize: 2,
        signal: new AbortController().signal,
        readPage: async () => ({ rows: ['a'], totalCount: 2 }),
      }),
    ).rejects.toMatchObject({ code: 'PAGE_INCOMPLETE' });
  });
});

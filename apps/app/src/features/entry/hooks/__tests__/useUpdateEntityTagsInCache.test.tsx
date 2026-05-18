import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const setDataById = vi.fn();
const setDataByIdWithTags = vi.fn();

vi.mock('@/lib/trpc', () => ({
  api: {
    useUtils: () => ({
      entries: {
        getById: {
          setData: vi.fn((input: unknown, updater: unknown) => {
            const inputObj = input as { id: string; include?: { tags: boolean } };
            if (inputObj.include?.tags) {
              setDataByIdWithTags(input, updater);
            } else {
              setDataById(input, updater);
            }
          }),
        },
      },
    }),
  },
}));

const { useUpdateEntityTagsInCache } = await import('../useUpdateEntityTagsInCache');

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe('useUpdateEntityTagsInCache', () => {
  beforeEach(() => {
    setDataById.mockClear();
    setDataByIdWithTags.mockClear();
  });

  describe('list キャッシュ更新', () => {
    it('entries.list キャッシュの該当 entity の tagId を更新する', () => {
      const { queryClient, wrapper } = createWrapper();

      const seed = [
        { id: 'e1', tagId: 'tag-old', title: 'A' },
        { id: 'e2', tagId: 'tag-other', title: 'B' },
      ];
      queryClient.setQueryData([['entries', 'list']], seed);

      const { result } = renderHook(() => useUpdateEntityTagsInCache('entries'), { wrapper });
      result.current('e1', ['tag-new']);

      const updated = queryClient.getQueryData<typeof seed>([['entries', 'list']]);
      expect(updated?.[0]).toMatchObject({ id: 'e1', tagId: 'tag-new' });
      // 別 entity は影響を受けない
      expect(updated?.[1]).toMatchObject({ id: 'e2', tagId: 'tag-other' });
    });

    it('newTagIds が空配列なら tagId=null に設定する', () => {
      const { queryClient, wrapper } = createWrapper();

      queryClient.setQueryData([['entries', 'list']], [{ id: 'e1', tagId: 'tag-old' }]);

      const { result } = renderHook(() => useUpdateEntityTagsInCache('entries'), { wrapper });
      result.current('e1', []);

      const updated = queryClient.getQueryData<{ id: string; tagId: string | null }[]>([
        ['entries', 'list'],
      ]);
      expect(updated?.[0]?.tagId).toBeNull();
    });

    it('複数の list キャッシュ（input 違い）を全て更新する', () => {
      const { queryClient, wrapper } = createWrapper();

      queryClient.setQueryData(
        [['entries', 'list'], { input: { status: 'open' }, type: 'query' }],
        [{ id: 'e1', tagId: 'tag-old' }],
      );
      queryClient.setQueryData(
        [['entries', 'list'], { input: { status: 'closed' }, type: 'query' }],
        [{ id: 'e1', tagId: 'tag-old' }],
      );

      const { result } = renderHook(() => useUpdateEntityTagsInCache('entries'), { wrapper });
      result.current('e1', ['tag-new']);

      const open = queryClient.getQueryData<{ id: string; tagId: string }[]>([
        ['entries', 'list'],
        { input: { status: 'open' }, type: 'query' },
      ]);
      const closed = queryClient.getQueryData<{ id: string; tagId: string }[]>([
        ['entries', 'list'],
        { input: { status: 'closed' }, type: 'query' },
      ]);
      expect(open?.[0]?.tagId).toBe('tag-new');
      expect(closed?.[0]?.tagId).toBe('tag-new');
    });

    it('entries.getById のキャッシュは predicate にマッチせず list 経由では触らない', () => {
      const { queryClient, wrapper } = createWrapper();

      queryClient.setQueryData([['entries', 'getById'], { input: { id: 'e1' }, type: 'query' }], {
        id: 'e1',
        tagId: 'tag-old',
      });

      const { result } = renderHook(() => useUpdateEntityTagsInCache('entries'), { wrapper });
      result.current('e1', ['tag-new']);

      // setQueriesData の predicate は list だけにマッチするので getById キャッシュはそのまま
      const got = queryClient.getQueryData<{ tagId: string }>([
        ['entries', 'getById'],
        { input: { id: 'e1' }, type: 'query' },
      ]);
      expect(got?.tagId).toBe('tag-old');
    });

    it('対象 list が空配列でも throw しない（no-op）', () => {
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData([['entries', 'list']], []);

      const { result } = renderHook(() => useUpdateEntityTagsInCache('entries'), { wrapper });
      expect(() => result.current('e1', ['tag-new'])).not.toThrow();
    });
  });

  describe('getById setData', () => {
    it('include なし / include={tags:true} の両方を更新する', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useUpdateEntityTagsInCache('entries'), { wrapper });

      result.current('e1', ['tag-new']);

      expect(setDataById).toHaveBeenCalledWith({ id: 'e1' }, expect.any(Function));
      expect(setDataByIdWithTags).toHaveBeenCalledWith(
        { id: 'e1', include: { tags: true } },
        expect.any(Function),
      );
    });

    it('updater は oldData が null/undefined なら同じ値を返す（no-op）', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useUpdateEntityTagsInCache('entries'), { wrapper });

      result.current('e1', ['tag-new']);

      const updaterCall = setDataById.mock.calls[0]?.[1] as (data: unknown) => unknown;
      expect(updaterCall(null)).toBeNull();
      expect(updaterCall(undefined)).toBeUndefined();
    });

    it('updater は tagId のみ書き換えて他フィールドは保持する', () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useUpdateEntityTagsInCache('entries'), { wrapper });

      result.current('e1', ['tag-new']);

      const updaterCall = setDataById.mock.calls[0]?.[1] as (
        data: Record<string, unknown> | null,
      ) => Record<string, unknown> | null;
      const result2 = updaterCall({ id: 'e1', title: 'A', tagId: 'tag-old' });
      expect(result2).toEqual({ id: 'e1', title: 'A', tagId: 'tag-new' });
    });
  });
});

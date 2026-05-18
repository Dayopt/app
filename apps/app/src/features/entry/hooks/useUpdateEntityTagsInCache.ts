import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api } from '@/lib/trpc';

/**
 * エンティティのtagIdsキャッシュを楽観的に更新するフック
 *
 * list / getById 両方のキャッシュを一括更新する。
 * CalendarCard等での即時表示に必要。
 */
export function useUpdateEntityTagsInCache(entity: 'entries') {
  const queryClient = useQueryClient();
  const utils = api.useUtils();

  return useCallback(
    (entityId: string, newTagIds: string[]) => {
      // 1. entity.list のすべてのキャッシュを更新
      // tRPC v11 のクエリキー形式: [procedurePath, { input, type }]
      queryClient.setQueriesData(
        {
          predicate: (query) => {
            const key = query.queryKey;
            return (
              Array.isArray(key) &&
              key.length >= 1 &&
              Array.isArray(key[0]) &&
              key[0][0] === entity &&
              key[0][1] === 'list'
            );
          },
        },
        (oldData: unknown) => {
          if (!oldData || !Array.isArray(oldData)) return oldData;
          const newTagId = newTagIds[0] ?? null;
          return oldData.map((item: { id: string; tagId?: string | null }) =>
            item.id === entityId ? { ...item, tagId: newTagId } : item,
          );
        },
      );

      // 2. entries.getById のキャッシュを更新
      const newTagId = newTagIds[0] ?? null;
      const updater = (oldData: ReturnType<typeof utils.entries.getById.getData>) => {
        if (!oldData) return oldData;
        return { ...oldData, tagId: newTagId };
      };
      utils.entries.getById.setData({ id: entityId }, updater);
      utils.entries.getById.setData({ id: entityId, include: { tags: true } }, updater);
    },
    [queryClient, entity, utils],
  );
}

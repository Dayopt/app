// タグアーカイブ / 復元用のフック

import { trpc } from '@/lib/trpc/client';

/**
 * アーカイブ済みタグ一覧取得フック（新しくアーカイブした順）
 */
export function useArchivedTags() {
  return trpc.tags.listArchived.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
}

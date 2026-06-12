/**
 * タグマスタからタグ情報をルックアップするためのフック
 *
 * plan.tagIdからタグの詳細情報（name, color等）を取得するために使用。
 * これにより、タグマスタの変更が全UIで即時反映される。
 *
 * @example
 * ```tsx
 * const { getTagById } = useTagsMap();
 * const tag = plan.tagId ? getTagById(plan.tagId) : undefined;
 * ```
 */

import { useCallback, useMemo } from 'react';

import { useTags } from './useTagsQuery';

/** タグの表示情報（ID・名前・色） */
type TagInfo = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
};

/** タグIDからタグ情報へのMapを提供するフック。plan.tagIdからタグ詳細を高速ルックアップできる */
export function useTagsMap() {
  const { data: tags } = useTags();

  // タグIDからタグ情報へのMapを構築
  const tagsMap = useMemo(() => {
    const map = new Map<string, TagInfo>();
    tags?.forEach((tag) => {
      map.set(tag.id, {
        id: tag.id,
        name: tag.name,
        color: tag.color ?? 'gray',
        icon: tag.icon,
      });
    });
    return map;
  }, [tags]);

  // タグIDリストからタグ情報リストを取得
  const getTagsByIds = useCallback(
    (tagIds: string[]): TagInfo[] => {
      return tagIds.map((id) => tagsMap.get(id)).filter((t): t is TagInfo => t !== undefined);
    },
    [tagsMap],
  );

  // 単一のタグIDからタグ情報を取得
  const getTagById = useCallback(
    (tagId: string): TagInfo | undefined => {
      return tagsMap.get(tagId);
    },
    [tagsMap],
  );

  return {
    tagsMap,
    getTagsByIds,
    getTagById,
    isLoading: !tags,
  };
}

/**
 * タグマスタからタグ情報をルックアップするためのフック（表示専用の全タグ lookup）
 *
 * plan.tagIdからタグの詳細情報（name, color等）を取得するために使用。
 * これにより、タグマスタの変更が全UIで即時反映される。
 *
 * アクティブ + アーカイブ済みの両方を含める。過去の Plan / Record はアーカイブ後も
 * 元のタグ名・色で表示を続ける仕様のため（docs/product/specs/tags.md 「タグのアーカイブ」）。
 * `useTags()` 単体（アーカイブ済みを含まない）だと、アーカイブ済みタグを持つ過去ブロックが
 * 「タグなし」表示に落ちてしまう。
 *
 * 選択候補（タグセレクタ・フィルタの新規付与候補）が必要な場合はこのフックを使わず、
 * `useTags()` / `useTagsHierarchy()` を直接使う（意図的にアーカイブ済みを含まない）。
 *
 * @example
 * ```tsx
 * const { getTagById } = useTagsMap();
 * const tag = plan.tagId ? getTagById(plan.tagId) : undefined;
 * ```
 */

import { useCallback, useMemo } from 'react';

import { useArchivedTags } from './useTagArchiveMutations';
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
  const { data: archivedTags } = useArchivedTags();

  // タグIDからタグ情報へのMapを構築（アクティブ + アーカイブ済みをマージ）
  const tagsMap = useMemo(() => {
    const map = new Map<string, TagInfo>();
    const addToMap = (tag: {
      id: string;
      name: string;
      color: string | null;
      icon: string | null;
    }) => {
      map.set(tag.id, {
        id: tag.id,
        name: tag.name,
        color: tag.color ?? 'gray',
        icon: tag.icon,
      });
    };
    tags?.forEach(addToMap);
    archivedTags?.forEach(addToMap);
    return map;
  }, [tags, archivedTags]);

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
    // 両クエリが揃うまで loading 扱いにする。片方だけ未取得の間に「タグなし」へ
    // 誤フォールバックしうることを呼び出し側が isLoading で判別できるようにするため。
    isLoading: !tags || !archivedTags,
  };
}

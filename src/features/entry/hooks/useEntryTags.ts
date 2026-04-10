import { api } from '@/lib/trpc';
import { useEntityTagsHook } from './createEntityTagsHook';

/**
 * エントリとタグの関連付け管理フック
 *
 * tRPC APIを使用してエントリとタグの関連付けを管理します。
 * 楽観的更新により、タグの追加・削除が即座にUIに反映されます。
 *
 * 注意: entry.tagId（単一タグID）を管理し、タグの詳細情報はtags.listキャッシュから取得する。
 */
export function useEntryTags() {
  const utils = api.useUtils();

  const { isLoading, error, addTag, removeTag, setTags } = useEntityTagsHook(
    {
      entityName: 'entries',
      entityIdField: 'entryId',
      enableTagStats: true,
    },
    utils,
  );

  return {
    // State
    isLoading,
    error,

    // Entry Tag Actions
    addEntryTag: addTag,
    removeEntryTag: removeTag,
    setEntryTags: setTags,
  };
}

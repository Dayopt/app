// タグCRUD用ミューテーションフック（作成・削除）

import { toast } from '@/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { generateTempId, snapshotQuery } from '@/lib/tanstack-query/optimistic-mutation';
import { trpc } from '@/lib/trpc/client';
import { DEFAULT_TAG_COLOR } from '../lib/tag-colors';

import { buildTagTree, flattenTagTree } from '../domain/tag-tree';
import type { Tag, TagTreeNode } from '../types';

type TagListData = {
  data: Tag[];
  count: number;
};

function isTagsListQuery(query: { queryKey: unknown }): boolean {
  const key = query.queryKey;
  return (
    Array.isArray(key) &&
    key.length >= 1 &&
    Array.isArray(key[0]) &&
    key[0][0] === 'tags' &&
    key[0][1] === 'list'
  );
}

export function upsertTagInListCache(
  oldData: TagListData | undefined,
  tag: Tag,
  replaceId?: string,
): TagListData {
  if (!oldData) return { data: [tag], count: 1 };

  const existingIndex = oldData.data.findIndex((item) =>
    replaceId ? item.id === replaceId || item.id === tag.id : item.id === tag.id,
  );

  if (existingIndex >= 0) {
    return {
      ...oldData,
      data: oldData.data.map((item, index) => (index === existingIndex ? tag : item)),
    };
  }

  return {
    ...oldData,
    data: [tag, ...oldData.data],
    count: oldData.count + 1,
  };
}

export function upsertTagInHierarchyCache(
  oldData: TagTreeNode[] | undefined,
  tag: Tag,
  replaceId?: string,
): TagTreeNode[] {
  const flat = oldData ? flattenTagTree(oldData) : [];
  const existingIndex = flat.findIndex((item) =>
    replaceId ? item.id === replaceId || item.id === tag.id : item.id === tag.id,
  );
  const nextFlat =
    existingIndex >= 0
      ? flat.map((item, index) => (index === existingIndex ? tag : item))
      : [tag, ...flat];

  return buildTagTree(nextFlat);
}

/**
 * タグ作成フック（楽観的更新付き）
 * @param showToast - トースト通知を表示するか。インラインタグ作成時はfalseで重複防止
 */
export function useCreateTag({ showToast = true }: { showToast?: boolean } = {}) {
  const utils = trpc.useUtils();
  const queryClient = useQueryClient();
  const t = useTranslations('tags');

  return trpc.tags.create.useMutation({
    onMutate: async (input) => {
      await Promise.all([utils.tags.list.cancel(), utils.tags.listHierarchy.cancel()]);
      const previousListQueries = queryClient.getQueriesData<TagListData>({
        predicate: isTagsListQuery,
      });
      const defaultListSnapshot = utils.tags.list.getData();
      const hierarchySnapshot = utils.tags.listHierarchy.getData();

      const tempId = generateTempId('tag');
      const tempTag: Tag = {
        id: tempId,
        name: input.name,
        color: input.color || DEFAULT_TAG_COLOR,
        icon: input.icon ?? null,
        parent_id: input.parentId ?? null,
        sort_order: 0,
        is_active: true,
        archived_at: null,
        user_id: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      queryClient.setQueriesData<TagListData>({ predicate: isTagsListQuery }, (old) =>
        upsertTagInListCache(old, tempTag),
      );
      utils.tags.list.setData(undefined, (old) => upsertTagInListCache(old, tempTag));
      utils.tags.listHierarchy.setData(undefined, (old) => upsertTagInHierarchyCache(old, tempTag));

      // Calendar filter store の sync は useCalendarData / ActivityFilterList の effect が
      // utils.tags.list 変更を検知して syncWithActivities 経由で行う（Layer 0 境界を保つため、
      // tags hook からは calendar store を直接触らない）。
      return {
        previousListQueries,
        defaultListSnapshot,
        hierarchySnapshot,
        tempId,
        tagName: input.name,
      };
    },
    onSuccess: (result, _input, context) => {
      queryClient.setQueriesData<TagListData>({ predicate: isTagsListQuery }, (old) =>
        upsertTagInListCache(old, result, context?.tempId),
      );
      utils.tags.list.setData(undefined, (old) =>
        upsertTagInListCache(old, result, context?.tempId),
      );
      utils.tags.listHierarchy.setData(undefined, (old) =>
        upsertTagInHierarchyCache(old, result, context?.tempId),
      );
      utils.tags.getById.setData({ id: result.id }, result);

      if (showToast) toast.success(t('toast.created', { name: result.name }));
    },
    onError: (_err, _input, context) => {
      if (context?.previousListQueries) {
        for (const [queryKey, data] of context.previousListQueries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      utils.tags.list.setData(undefined, context?.defaultListSnapshot);
      utils.tags.listHierarchy.setData(undefined, context?.hierarchySnapshot);
      if (showToast) toast.error(t('toast.createFailed'));
    },
    onSettled: () => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
    },
  });
}

/** タグ削除フック（楽観的更新付き）。削除戦略（エントリ削除/再割当て）対応 */
export function useDeleteTag() {
  const utils = trpc.useUtils();
  const t = useTranslations('tags');

  return trpc.tags.delete.useMutation({
    onMutate: async ({ id }) => {
      const listSnapshot = await snapshotQuery(utils.tags.list);
      const detailSnapshot = await snapshotQuery(utils.tags.getById, { id });

      // 削除対象のタグ名を保存（成功toast用）
      const deletedTag = listSnapshot.previous?.data.find((tag: Tag) => tag.id === id);

      utils.tags.list.setData(undefined, (old) => {
        if (!old) return old;
        return {
          ...old,
          data: old.data.filter((tag) => tag.id !== id),
          count: old.count - 1,
        };
      });

      utils.tags.getById.setData({ id }, undefined);

      return { listSnapshot, detailSnapshot, deletedTagName: deletedTag?.name };
    },
    onSuccess: (_data, _input, context) => {
      if (context?.deletedTagName) {
        toast.success(t('toast.deleted', { name: context.deletedTagName }));
      }
    },
    onError: (_err, _input, context) => {
      context?.listSnapshot?.restore();
      context?.detailSnapshot?.restore();
      toast.error(t('errors.deleteFailed'));
    },
    onSettled: (_data, _err, input) => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
      // アーカイブ済み一覧から削除した場合も対象。invalidate しないと staleTime 5分の間
      // 削除済みタグが一覧に残り、再クリックで not-found になる（#1576）。
      void utils.tags.listArchived.invalidate();
      void utils.tags.getById.invalidate({ id: input.id });
      void utils.plans.list.invalidate();
      void utils.records.list.invalidate();
      void utils.statistics.getTagStats.invalidate();
    },
  });
}

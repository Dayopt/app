// タグCRUD用ミューテーションフック（作成・削除）

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { snapshotQuery } from '@/lib/tanstack-query/optimistic-mutation';
import { trpc } from '@/lib/trpc/client';

import { buildTagTree, flattenTagTree } from '../domain/tag-tree';
import type { Tag, TagTreeNode } from '../types';

type TagListData = {
  data: Tag[];
  count: number;
};

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

// タグアーカイブ / 復元用のフック

import { useTranslations } from 'next-intl';

import { snapshotQuery } from '@/lib/tanstack-query/optimistic-mutation';
import { toast } from '@/lib/toast';
import { trpc } from '@/lib/trpc/client';
import type { TagTreeNode } from '../types';

/**
 * アーカイブ済みタグ一覧取得フック（新しくアーカイブした順）
 */
export function useArchivedTags() {
  return trpc.tags.listArchived.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });
}

/** 階層キャッシュから対象タグ（親なら node ごと、子なら children から）を除去する */
function removeTagFromHierarchy(nodes: TagTreeNode[] | undefined, tagId: string) {
  if (!nodes) return nodes;
  return nodes
    .filter((node) => node.tag.id !== tagId)
    .map((node) =>
      node.children.some((child) => child.id === tagId)
        ? { ...node, children: node.children.filter((child) => child.id !== tagId) }
        : node,
    );
}

/**
 * タグアーカイブフック
 *
 * 楽観的にサイドバー（listHierarchy）とフラット一覧（list）から除去し、
 * 成功 toast の「元に戻す」で復元できる。
 */
export function useArchiveTag() {
  const utils = trpc.useUtils();
  const t = useTranslations('tags');

  const invalidate = (id: string) => {
    void utils.tags.list.invalidate();
    void utils.tags.listHierarchy.invalidate();
    void utils.tags.listArchived.invalidate();
    void utils.tags.getById.invalidate({ id });
  };

  return trpc.tags.archive.useMutation({
    onMutate: async ({ id }) => {
      const listSnapshot = await snapshotQuery(utils.tags.list);
      const hierarchySnapshot = await snapshotQuery(utils.tags.listHierarchy);

      const archivedTag = listSnapshot.previous?.data.find((tag) => tag.id === id);

      utils.tags.list.setData(undefined, (old) => {
        if (!old) return old;
        const next = old.data.filter((tag) => tag.id !== id && tag.parent_id !== id);
        return { ...old, data: next, count: next.length };
      });
      utils.tags.listHierarchy.setData(undefined, (old) => removeTagFromHierarchy(old, id));

      return { listSnapshot, hierarchySnapshot, archivedTagName: archivedTag?.name };
    },
    onSuccess: (data, input, context) => {
      const name = context?.archivedTagName ?? data.tag.name;
      const message =
        data.archivedChildCount > 0
          ? t('archive.toast.archivedWithChildren', { name, count: data.archivedChildCount })
          : t('archive.toast.archived', { name });
      toast.success(message, {
        action: {
          label: t('archive.toast.undo'),
          onClick: () => {
            void utils.client.tags.restore
              .mutate({ id: input.id })
              .then(() => invalidate(input.id))
              .catch(() => toast.error(t('errors.restoreFailed')));
          },
        },
      });
    },
    onError: (_err, _input, context) => {
      context?.listSnapshot?.restore();
      context?.hierarchySnapshot?.restore();
      toast.error(t('errors.archiveFailed'));
    },
    onSettled: (_data, _err, input) => {
      invalidate(input.id);
    },
  });
}

/**
 * アーカイブ済みタグの復元フック
 *
 * 楽観的にアーカイブ一覧から除去する。通常一覧への再挿入は並び順の解決が
 * サーバー側にあるため invalidate に任せる。
 */
export function useRestoreTag() {
  const utils = trpc.useUtils();
  const t = useTranslations('tags');

  return trpc.tags.restore.useMutation({
    onMutate: async ({ id }) => {
      const archivedSnapshot = await snapshotQuery(utils.tags.listArchived);
      const restoredTag = archivedSnapshot.previous?.find((tag) => tag.id === id);

      utils.tags.listArchived.setData(undefined, (old) => old?.filter((tag) => tag.id !== id));

      return { archivedSnapshot, restoredTagName: restoredTag?.name };
    },
    onSuccess: (data, _input, context) => {
      const name = context?.restoredTagName ?? data.tag.name;
      if (data.conflictedChildCount > 0) {
        toast(t('archive.toast.restoredWithConflicts', { name, count: data.conflictedChildCount }));
        return;
      }
      toast.success(t('archive.toast.restored', { name }));
    },
    onError: (err, _input, context) => {
      context?.archivedSnapshot?.restore();
      if (err.message.includes('same name') || err.message.includes('DUPLICATE_NAME')) {
        toast.error(t('errors.restoreDuplicateName'));
        return;
      }
      toast.error(t('errors.restoreFailed'));
    },
    onSettled: (_data, _err, input) => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
      void utils.tags.listArchived.invalidate();
      void utils.tags.getById.invalidate({ id: input.id });
    },
  });
}

// タグCRUD用ミューテーションフック（作成・更新・削除・リネーム・色変更・並び替え）

import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

import { useCalendarFilterStore } from '@/lib/stores/useCalendarFilterStore';
import type { TagColorName } from '@/lib/tag-colors';
import { DEFAULT_TAG_COLOR } from '@/lib/tag-colors';
import {
  generateTempId,
  replaceInPaginatedList,
  snapshotQuery,
  updatePaginatedList,
} from '@/lib/tanstack-query/optimistic-mutation';
import { trpc } from '@/lib/trpc/client';

import { buildTagTree, flattenTagTree } from '../lib/tag-tree';
import type { Tag } from '../types';

// 新しい入力型（tRPC形式）
interface TrpcTagUpdateInput {
  id: string;
  name?: string | undefined;
  color?: TagColorName | undefined;
  icon?: string | null | undefined;
  parentId?: string | null | undefined;
}

/** タグ更新の入力型 */
export type UpdateTagInput = TrpcTagUpdateInput;

/**
 * タグ作成フック（楽観的更新付き）
 * @param showToast - トースト通知を表示するか。インラインタグ作成時はfalseで重複防止
 */
export function useCreateTag({ showToast = true }: { showToast?: boolean } = {}) {
  const utils = trpc.useUtils();
  const t = useTranslations('tags');

  return trpc.tags.create.useMutation({
    onMutate: async (input) => {
      const listSnapshot = await snapshotQuery(utils.tags.list);

      const tempId = generateTempId('tag');
      const tempTag: Tag = {
        id: tempId,
        name: input.name,
        color: input.color || DEFAULT_TAG_COLOR,
        icon: input.icon ?? null,
        parent_id: input.parentId ?? null,
        sort_order: 0,
        is_active: true,
        user_id: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      utils.tags.list.setData(undefined, (old) => {
        if (!old) return { data: [tempTag], count: 1 };
        return { ...old, data: [tempTag, ...old.data], count: old.count + 1 };
      });

      useCalendarFilterStore.getState().initializeWithTags([tempId]);
      return { listSnapshot, tempId, tagName: input.name };
    },
    onSuccess: (result, _input, context) => {
      if (!context?.tempId) return;

      utils.tags.list.setData(undefined, (old) =>
        replaceInPaginatedList(old, 'id', context.tempId, result),
      );
      utils.tags.getById.setData({ id: result.id }, result);

      const filterStore = useCalendarFilterStore.getState();
      filterStore.removeTag(context.tempId);
      filterStore.initializeWithTags([result.id]);

      if (showToast) toast.success(t('toast.created', { name: result.name }));
    },
    onError: (_err, _input, context) => {
      context?.listSnapshot?.restore();
      if (context?.tempId) useCalendarFilterStore.getState().removeTag(context.tempId);
      if (showToast) toast.error(t('toast.createFailed'));
    },
    onSettled: () => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
    },
  });
}

/** タグ更新フック（楽観的更新付き）。名前・色の変更に対応 */
export function useUpdateTag() {
  const utils = trpc.useUtils();
  const t = useTranslations('tags');

  const mutation = trpc.tags.update.useMutation({
    onMutate: async (newData) => {
      const listSnapshot = await snapshotQuery(utils.tags.list);
      const detailSnapshot = await snapshotQuery(utils.tags.getById, { id: newData.id });

      const updateTag = (tag: Tag) => {
        if (tag.id !== newData.id) return tag;
        return {
          ...tag,
          name: newData.name ?? tag.name,
          color: newData.color ?? tag.color,
          icon: newData.icon !== undefined ? newData.icon : tag.icon,
          parent_id: newData.parentId !== undefined ? newData.parentId : tag.parent_id,
        };
      };

      utils.tags.list.setData(undefined, (old) => updatePaginatedList(old, updateTag));
      utils.tags.getById.setData({ id: newData.id }, (old) => (old ? updateTag(old) : undefined));

      return { listSnapshot, detailSnapshot };
    },
    onSuccess: (result) => {
      utils.tags.list.setData(undefined, (old) =>
        updatePaginatedList(old, (tag) => (tag.id === result.id ? result : tag)),
      );
      utils.tags.getById.setData({ id: result.id }, result);
    },
    onError: (err, _newData, context) => {
      context?.listSnapshot?.restore();
      context?.detailSnapshot?.restore();

      const message = err.message;
      if (message.includes('already exists') || message.includes('DUPLICATE_NAME')) {
        toast.error(t('errors.duplicateName'));
      } else {
        toast.error(t('errors.updateFailed'));
      }
    },
    onSettled: (_data, _err, input) => {
      void utils.entries.list.invalidate();
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
      void utils.tags.getById.invalidate({ id: input.id });
    },
  });

  return {
    ...mutation,
    mutate: (input: UpdateTagInput) => {
      return mutation.mutate(input);
    },
    mutateAsync: async (input: UpdateTagInput) => {
      return mutation.mutateAsync(input);
    },
  };
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
      void utils.tags.getById.invalidate({ id: input.id });
      void utils.entries.list.invalidate();
      void utils.entries.getTagStats.invalidate();
    },
  });
}

/** タグリネームフック（楽観的更新付き）。重複名エラー時はトーストで通知 */
export function useRenameTag() {
  const utils = trpc.useUtils();
  const t = useTranslations('tags');

  return trpc.tags.update.useMutation({
    onMutate: async (input) => {
      const listSnapshot = await snapshotQuery(utils.tags.list);
      const detailSnapshot = await snapshotQuery(utils.tags.getById, { id: input.id });

      const updateName = (tag: Tag) =>
        tag.id === input.id ? { ...tag, name: input.name ?? tag.name } : tag;

      utils.tags.list.setData(undefined, (old) => updatePaginatedList(old, updateName));
      utils.tags.getById.setData({ id: input.id }, (old) => (old ? updateName(old) : undefined));

      return { listSnapshot, detailSnapshot };
    },
    onError: (err, _input, context) => {
      context?.listSnapshot?.restore();
      context?.detailSnapshot?.restore();

      const message = err.message;
      if (message.includes('already exists') || message.includes('DUPLICATE_NAME')) {
        toast.error(t('errors.duplicateName'));
      } else {
        toast.error(t('errors.updateFailed'));
      }
    },
    onSettled: (_data, _err, input) => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
      void utils.tags.getById.invalidate({ id: input.id });
      void utils.entries.list.invalidate();
    },
  });
}

/** タグ色変更フック（楽観的更新付き）。エラー時はキャッシュをロールバック */
export function useUpdateTagColor() {
  const utils = trpc.useUtils();

  return trpc.tags.update.useMutation({
    onMutate: async (input) => {
      const listSnapshot = await snapshotQuery(utils.tags.list);
      const detailSnapshot = await snapshotQuery(utils.tags.getById, { id: input.id });

      const updateColor = (tag: Tag) =>
        tag.id === input.id ? { ...tag, color: input.color ?? tag.color } : tag;

      utils.tags.list.setData(undefined, (old) => updatePaginatedList(old, updateColor));
      utils.tags.getById.setData({ id: input.id }, (old) => (old ? updateColor(old) : undefined));

      return { listSnapshot, detailSnapshot };
    },
    onError: (_err, _input, context) => {
      context?.listSnapshot?.restore();
      context?.detailSnapshot?.restore();
    },
    onSettled: (_data, _err, input) => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
      void utils.tags.getById.invalidate({ id: input.id });
      void utils.entries.list.invalidate();
    },
  });
}

/** グループリネームフック（楽観的更新付き）。コロン記法プレフィックスを一括変更する */
export function useRenameGroup() {
  const utils = trpc.useUtils();
  const t = useTranslations('tags');

  return trpc.tags.renameGroup.useMutation({
    onMutate: async ({ oldPrefix, newPrefix }) => {
      const listSnapshot = await snapshotQuery(utils.tags.list);

      // 楽観的更新: キャッシュ内の全該当タグの name を一括置換
      utils.tags.list.setData(undefined, (old) => {
        if (!old) return old;
        const prefixPattern = `${oldPrefix}:`;
        return {
          ...old,
          data: old.data.map((tag) => {
            if (tag.name.startsWith(prefixPattern)) {
              const suffix = tag.name.slice(prefixPattern.length);
              return { ...tag, name: `${newPrefix}:${suffix}` };
            }
            return tag;
          }),
        };
      });

      return { listSnapshot };
    },
    onSuccess: (_data, input) => {
      toast.success(t('toast.groupNameChanged', { name: input.newPrefix }));
    },
    onError: (err, _input, context) => {
      context?.listSnapshot?.restore();

      const message = err.message;
      if (message.includes('already exists') || message.includes('DUPLICATE_NAME')) {
        toast.error(t('errors.duplicateName'));
      } else {
        toast.error(t('errors.updateFailed'));
      }
    },
    onSettled: () => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
      void utils.entries.list.invalidate();
    },
  });
}

/** グループ解除フック（楽観的更新付き）。コロン記法プレフィックスを除去してフラット化する */
export function useUngroupTags() {
  const utils = trpc.useUtils();
  const t = useTranslations('calendar');

  return trpc.tags.ungroupTags.useMutation({
    onMutate: async ({ prefix, mergeConflicts }) => {
      const listSnapshot = await snapshotQuery(utils.tags.list);

      const prefixPattern = `${prefix}:`;
      utils.tags.list.setData(undefined, (old) => {
        if (!old) return old;
        const existingNames = new Set(old.data.map((tag) => tag.name));
        const updated: Tag[] = [];
        let needsParent = !existingNames.has(prefix);

        for (const tag of old.data) {
          if (tag.name.startsWith(prefixPattern)) {
            const suffix = tag.name.slice(prefixPattern.length);
            if (existingNames.has(suffix)) {
              if (mergeConflicts) {
                // 衝突タグ: マージされるためキャッシュから除去
                continue;
              }
              // mergeConflicts なし: サーバーがエラーを返すのでリネームしない
              updated.push(tag);
              continue;
            }
            // 非衝突: suffix にリネーム
            updated.push({ ...tag, name: suffix });
            if (suffix === prefix) needsParent = false;
          } else {
            updated.push(tag);
          }
        }

        // prefix 名の単体タグがどこにもなければ楽観的に追加
        if (needsParent) {
          const representative = old.data.find((tag) => tag.name.startsWith(prefixPattern));
          updated.unshift({
            id: generateTempId('tag'),
            name: prefix,
            color: representative?.color ?? DEFAULT_TAG_COLOR,
            icon: representative?.icon ?? null,
            parent_id: null,
            sort_order: 0,
            is_active: true,
            user_id: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        return { ...old, data: updated, count: updated.length };
      });

      return { listSnapshot, prefix };
    },
    onSuccess: (result, _input, context) => {
      if (context?.prefix) {
        toast.success(
          t('filter.ungroupTagsSuccess', { name: context.prefix, count: result.count }),
        );
      }
    },
    onError: (err, _input, context) => {
      context?.listSnapshot?.restore();

      // UNGROUP_CONFLICTS エラーはUI側でハンドリングするのでtoastは出さない
      if (err.message.includes('UNGROUP_CONFLICTS')) return;

      toast.error(t('filter.ungroupTagsFailed'));
    },
    onSettled: () => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
      void utils.entries.list.invalidate();
    },
  });
}

/** グループ削除フック（楽観的更新付き）。コロン記法プレフィックスのタグを一括削除する */
export function useDeleteGroup() {
  const utils = trpc.useUtils();
  const t = useTranslations('calendar');

  return trpc.tags.deleteGroup.useMutation({
    onMutate: async ({ prefix }) => {
      const listSnapshot = await snapshotQuery(utils.tags.list);

      // 楽観的更新: prefix: で始まるタグをキャッシュから除去
      const prefixPattern = `${prefix}:`;
      utils.tags.list.setData(undefined, (old) => {
        if (!old) return old;
        const remaining = old.data.filter((tag) => !tag.name.startsWith(prefixPattern));
        return {
          ...old,
          data: remaining,
          count: remaining.length,
        };
      });

      return { listSnapshot, prefix };
    },
    onSuccess: (result, _input, context) => {
      if (context?.prefix) {
        toast.success(
          t('filter.deleteGroup.success', { name: context.prefix, count: result.deletedCount }),
        );
      }
    },
    onError: (_err, _input, context) => {
      context?.listSnapshot?.restore();
      toast.error(t('filter.deleteGroup.failed'));
    },
    onSettled: () => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
      void utils.entries.list.invalidate();
      void utils.entries.getTagStats.invalidate();
    },
  });
}

/** タグ並び替えの入力型 */
export interface ReorderTagInput {
  id: string;
  parent_id: string | null;
  sort_order: number;
}

/** タグ並び替えフック（楽観的更新付き）。sort_orderをバッチ更新してドラッグ&ドロップに対応 */
export function useReorderTags() {
  const utils = trpc.useUtils();
  const t = useTranslations('tags');

  return trpc.tags.reorder.useMutation({
    onMutate: async ({ updates }) => {
      await Promise.all([utils.tags.list.cancel(), utils.tags.listHierarchy.cancel()]);

      const previousList = utils.tags.list.getData();
      const previousHierarchy = utils.tags.listHierarchy.getData();

      const applyUpdate = (tag: Tag): Tag => {
        const update = updates.find((u) => u.id === tag.id);
        if (!update) return tag;
        return { ...tag, parent_id: update.parent_id, sort_order: update.sort_order };
      };

      utils.tags.list.setData(undefined, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, data: oldData.data.map(applyUpdate) };
      });

      // listHierarchy も楽観更新しないと、onSettled の invalidate → refetch で
      // 一瞬だけ古い順序が描画され reload のようなチラつきになる
      utils.tags.listHierarchy.setData(undefined, (oldData) => {
        if (!oldData) return oldData;
        const flat = flattenTagTree(oldData).map(applyUpdate);
        return buildTagTree(flat);
      });

      return { previousList, previousHierarchy };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousList) utils.tags.list.setData(undefined, context.previousList);
      if (context?.previousHierarchy)
        utils.tags.listHierarchy.setData(undefined, context.previousHierarchy);
      toast.error(t('errors.updateFailed'));
    },
    onSettled: () => {
      void utils.tags.list.invalidate();
      void utils.tags.listHierarchy.invalidate();
    },
  });
}

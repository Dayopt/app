/**
 * カテゴリーの CRUD / アーカイブ用ミューテーションフック（楽観的更新つき）。
 *
 * 色とアイコンを持つのはカテゴリーだけで、所属アクティビティはそれを継承する（#2162 §4-6）。
 * したがって色・アイコンの変更はこのファイルの `useUpdateCategory` に一本化される。
 */

import { useTranslations } from 'next-intl';

import { generateTempId } from '@/lib/tanstack-query/optimistic-mutation';
import { toast } from '@/lib/toast';
import { trpc } from '@/lib/trpc/client';
import { DEFAULT_CATEGORY_COLOR } from '../lib/category-colors';
import type { Category } from '../types';
import {
  deleteCategoryFromCaches,
  invalidateActivityAssignments,
  invalidateActivityCaches,
  readCategoryFromCaches,
  snapshotActivityCaches,
  writeCategoryToCaches,
} from './activities-cache';

function isDuplicateNameError(message: string): boolean {
  return message.includes('already exists') || message.includes('DUPLICATE_NAME');
}

/** カテゴリー作成フック */
export function useCreateCategory() {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.createCategory.useMutation({
    onMutate: async (input) => {
      const snapshot = await snapshotActivityCaches(utils);
      const tempId = generateTempId('category');
      const now = new Date().toISOString();

      const optimistic: Category = {
        id: tempId,
        name: input.name,
        user_id: '',
        color: input.color ?? DEFAULT_CATEGORY_COLOR,
        icon: input.icon ?? null,
        archived_at: null,
        created_at: now,
        updated_at: now,
      };

      writeCategoryToCaches(utils, optimistic);

      return { snapshot, tempId };
    },
    onSuccess: (category, _input, context) => {
      writeCategoryToCaches(utils, category, context?.tempId);
      toast.success(t('category.created', { name: category.name }));
    },
    onError: (error, _input, context) => {
      context?.snapshot.restore();
      toast.error(
        isDuplicateNameError(error.message)
          ? t('category.duplicateName')
          : t('category.createFailed'),
      );
    },
    onSettled: () => {
      invalidateActivityCaches(utils);
    },
  });
}

/**
 * カテゴリー更新フック（名前・色・アイコン）。
 *
 * 色・アイコンの変更は所属アクティビティの見え方まで一斉に変わるため、
 * `onSettled` では予定・記録の一覧も invalidate する。
 */
export function useUpdateCategory() {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.updateCategory.useMutation({
    onMutate: async (input) => {
      const snapshot = await snapshotActivityCaches(utils);
      const current = readCategoryFromCaches(utils, input.id);

      if (current) {
        writeCategoryToCaches(utils, {
          ...current,
          name: input.name ?? current.name,
          color: input.color !== undefined ? input.color : current.color,
          icon: input.icon !== undefined ? input.icon : current.icon,
        });
      }

      return { snapshot };
    },
    onSuccess: (category) => {
      writeCategoryToCaches(utils, category);
    },
    onError: (error, _input, context) => {
      context?.snapshot.restore();
      toast.error(
        isDuplicateNameError(error.message)
          ? t('category.duplicateName')
          : t('category.updateFailed'),
      );
    },
    onSettled: () => {
      invalidateActivityAssignments(utils);
    },
  });
}

/**
 * カテゴリーのアーカイブフック。
 *
 * 所属アクティビティは道連れにしない。見出しが消えるぶん、それらは未分類へ移る。
 */
export function useArchiveCategory() {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.archiveCategory.useMutation({
    onMutate: async ({ id }) => {
      const snapshot = await snapshotActivityCaches(utils);
      deleteCategoryFromCaches(utils, id);
      return { snapshot };
    },
    onSuccess: (category) => {
      writeCategoryToCaches(utils, category);
      toast.success(t('category.archived', { name: category.name }), {
        action: {
          label: t('undo'),
          onClick: () => {
            void utils.client.activities.restoreCategory
              .mutate({ id: category.id })
              .then(() => invalidateActivityCaches(utils))
              .catch(() => toast.error(t('category.restoreFailed')));
          },
        },
      });
    },
    onError: (_error, _input, context) => {
      context?.snapshot.restore();
      toast.error(t('category.archiveFailed'));
    },
    onSettled: () => {
      // 所属アクティビティの表示色が中立へ落ちるため、ブロック表示も更新する
      invalidateActivityAssignments(utils);
    },
  });
}

/** アーカイブ済みカテゴリーの復元フック */
export function useRestoreCategory() {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.restoreCategory.useMutation({
    onMutate: async ({ id }) => {
      const snapshot = await snapshotActivityCaches(utils);
      deleteCategoryFromCaches(utils, id);
      return { snapshot };
    },
    onSuccess: (category) => {
      writeCategoryToCaches(utils, category);
      toast.success(t('category.restored', { name: category.name }));
    },
    onError: (error, _input, context) => {
      context?.snapshot.restore();
      toast.error(
        isDuplicateNameError(error.message)
          ? t('category.restoreDuplicateName')
          : t('category.restoreFailed'),
      );
    },
    onSettled: () => {
      invalidateActivityAssignments(utils);
    },
  });
}

/**
 * カテゴリーの完全削除フック。
 *
 * 所属アクティビティは削除されず未分類になる（FK の `ON DELETE SET NULL (category_id)`）。
 */
export function useDeleteCategory() {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.deleteCategory.useMutation({
    onMutate: async ({ id }) => {
      const snapshot = await snapshotActivityCaches(utils);
      const deleted = readCategoryFromCaches(utils, id);

      deleteCategoryFromCaches(utils, id);

      return { snapshot, deletedName: deleted?.name };
    },
    onSuccess: (category, _input, context) => {
      toast.success(t('category.deleted', { name: context?.deletedName ?? category.name }));
    },
    onError: (_error, _input, context) => {
      context?.snapshot.restore();
      toast.error(t('category.deleteFailed'));
    },
    onSettled: () => {
      invalidateActivityAssignments(utils);
    },
  });
}

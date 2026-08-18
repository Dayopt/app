/**
 * アクティビティの CRUD / アーカイブ用ミューテーションフック（楽観的更新つき）。
 *
 * 3 キャッシュ（listTree / listActivities / listCategories）の更新は
 * `activities-cache.ts` に寄せてある。片方だけ更新すると refetch で巻き戻る。
 */

import { useTranslations } from 'next-intl';

import { generateTempId } from '@/lib/tanstack-query/optimistic-mutation';
import { toast } from '@/lib/toast';
import { trpc } from '@/lib/trpc/client';
import type { Activity } from '../types';
import {
  deleteActivityFromCaches,
  invalidateActivityAssignments,
  invalidateActivityCaches,
  readActivityFromCaches,
  snapshotActivityCaches,
  writeActivityToCaches,
} from './activities-cache';

/**
 * 名前の重複はサーバーが `DUPLICATE_NAME`（HTTP は BAD_REQUEST）で返す。
 * client には message しか降りてこないため、本文で判定する（tags 実装と同じ形）。
 */
function isDuplicateNameError(message: string): boolean {
  return message.includes('already exists') || message.includes('DUPLICATE_NAME');
}

/**
 * アクティビティ作成フック。
 *
 * @param showToast クイック作成のように呼び出し側が独自に結果を伝える経路では false にする
 */
export function useCreateActivity({ showToast = true }: { showToast?: boolean } = {}) {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.createActivity.useMutation({
    onMutate: async (input) => {
      const snapshot = await snapshotActivityCaches(utils);
      const tempId = generateTempId('activity');
      const now = new Date().toISOString();

      const optimistic: Activity = {
        id: tempId,
        name: input.name,
        user_id: '',
        category_id: input.categoryId ?? null,
        archived_at: null,
        created_at: now,
        updated_at: now,
      };

      writeActivityToCaches(utils, optimistic);

      return { snapshot, tempId };
    },
    onSuccess: (activity, _input, context) => {
      writeActivityToCaches(utils, activity, context?.tempId);
      if (showToast) toast.success(t('activity.created', { name: activity.name }));
    },
    onError: (error, _input, context) => {
      context?.snapshot.restore();
      if (!showToast) return;
      toast.error(
        isDuplicateNameError(error.message)
          ? t('activity.duplicateName')
          : t('activity.createFailed'),
      );
    },
    onSettled: () => {
      invalidateActivityCaches(utils);
    },
  });
}

/** アクティビティ更新フック（名前・所属カテゴリー） */
export function useUpdateActivity() {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.updateActivity.useMutation({
    onMutate: async (input) => {
      const snapshot = await snapshotActivityCaches(utils);
      const current = readActivityFromCaches(utils, input.id);

      if (current) {
        writeActivityToCaches(utils, {
          ...current,
          name: input.name ?? current.name,
          category_id: input.categoryId !== undefined ? input.categoryId : current.category_id,
        });
      }

      return { snapshot };
    },
    onSuccess: (activity) => {
      writeActivityToCaches(utils, activity);
    },
    onError: (error, _input, context) => {
      context?.snapshot.restore();
      toast.error(
        isDuplicateNameError(error.message)
          ? t('activity.duplicateName')
          : t('activity.updateFailed'),
      );
    },
    onSettled: () => {
      // 名前・所属が変わるとカレンダーのブロック表示と集計の見え方も変わる
      invalidateActivityAssignments(utils);
    },
  });
}

/**
 * アクティビティのアーカイブフック。
 *
 * 一覧から消えるだけで、過去の予定・記録の参照は残る（#2162 §4-8）。
 * 取り消しは成功 toast の「元に戻す」から。
 */
export function useArchiveActivity() {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.archiveActivity.useMutation({
    onMutate: async ({ id }) => {
      const snapshot = await snapshotActivityCaches(utils);
      deleteActivityFromCaches(utils, id);
      return { snapshot };
    },
    onSuccess: (activity) => {
      // アーカイブ済みとして一覧へ戻す（tree からは外れたまま）
      writeActivityToCaches(utils, activity);
      toast.success(t('activity.archived', { name: activity.name }), {
        action: {
          label: t('undo'),
          onClick: () => {
            void utils.client.activities.restoreActivity
              .mutate({ id: activity.id })
              .then(() => invalidateActivityCaches(utils))
              .catch(() => toast.error(t('activity.restoreFailed')));
          },
        },
      });
    },
    onError: (_error, _input, context) => {
      context?.snapshot.restore();
      toast.error(t('activity.archiveFailed'));
    },
    onSettled: () => {
      invalidateActivityCaches(utils);
    },
  });
}

/**
 * アーカイブ済みアクティビティの復元フック。
 *
 * 復元先の並びはサーバーが決めるので、tree への再挿入は invalidate に任せる。
 */
export function useRestoreActivity() {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.restoreActivity.useMutation({
    onMutate: async ({ id }) => {
      const snapshot = await snapshotActivityCaches(utils);
      deleteActivityFromCaches(utils, id);
      return { snapshot };
    },
    onSuccess: (activity) => {
      writeActivityToCaches(utils, activity);
      toast.success(t('activity.restored', { name: activity.name }));
    },
    onError: (error, _input, context) => {
      context?.snapshot.restore();
      toast.error(
        isDuplicateNameError(error.message)
          ? t('activity.restoreDuplicateName')
          : t('activity.restoreFailed'),
      );
    },
    onSettled: () => {
      invalidateActivityCaches(utils);
    },
  });
}

/**
 * アクティビティの完全削除フック。
 *
 * 参照していた予定・記録は消えず「アクティビティなし」になる（複合 FK の
 * `ON DELETE SET NULL (activity_id)`）。確認ダイアログを出すかは呼び出し側の判断。
 */
export function useDeleteActivity() {
  const utils = trpc.useUtils();
  const t = useTranslations('activities');

  return trpc.activities.deleteActivity.useMutation({
    onMutate: async ({ id }) => {
      const snapshot = await snapshotActivityCaches(utils);
      const deleted = readActivityFromCaches(utils, id);

      deleteActivityFromCaches(utils, id);

      return { snapshot, deletedName: deleted?.name };
    },
    onSuccess: (activity, _input, context) => {
      toast.success(t('activity.deleted', { name: context?.deletedName ?? activity.name }));
    },
    onError: (_error, _input, context) => {
      context?.snapshot.restore();
      toast.error(t('activity.deleteFailed'));
    },
    onSettled: () => {
      invalidateActivityAssignments(utils);
    },
  });
}

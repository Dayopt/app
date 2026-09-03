'use client';

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';

import type { Activity } from '@/features/activities';
import { useUpdateActivity } from '@/features/activities';
import { toast } from '@/lib/toast';

import { canDropActivity, toCategoryId, type ActivityDropTarget } from './activity-drop-target';

/**
 * アクティビティの所属カテゴリーを変える唯一の入り口。
 *
 * 呼び出し元は 2 つある:
 * 1. 行メニューの「カテゴリーを変更」ピッカー（`ActivityRow`）
 * 2. サイドバーのドラッグ&ドロップ（`ActivityDragContext`）
 *
 * 同名衝突の判定を両方で書くと片方だけ直る事故が起きるため、判定は
 * `canDropActivity()` に一本化し、ここは「弾かれた理由を伝えるかどうか」だけを
 * 持つ。書き込みと楽観的更新・ロールバックは `useUpdateActivity()` が持っている。
 */
export function useMoveActivityToCategory(allActivities: Activity[]) {
  const t = useTranslations();
  const updateMutation = useUpdateActivity();

  return useCallback(
    (activity: Activity, target: ActivityDropTarget) => {
      if (canDropActivity({ activity, target, allActivities })) {
        updateMutation.mutate({ id: activity.id, categoryId: toCategoryId(target) });
        return;
      }

      // 同じカテゴリーを選び直しただけなら黙って何もしない。理由を告げるのは
      // 「やろうとしたのに拒まれた」時だけにする
      if ((activity.category_id ?? null) === toCategoryId(target)) return;

      // ここへ来るのは同名衝突のみ。DnD 経路はカーソルで既に拒否済みなので、
      // 実際にこの toast が出るのは行メニュー経路
      toast.error(t('calendar.filter.createDialog.duplicateName'));
    },
    [allActivities, updateMutation, t],
  );
}

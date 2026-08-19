'use client';

import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { trpc } from '@/lib/trpc/client';

/**
 * セグメント（分析用の保存されたクエリ）の CRUD フック。
 *
 * 楽観的更新は入れない（`.claude/skills/optimistic-update/SKILL.md` の除外条件
 * 「onSuccess で invalidate するだけの単純なケース」に該当する判断）。理由:
 * セグメントは低頻度の管理操作（保存フィルタの作成・改名・削除）で、カレンダーの
 * ドラッグ操作のような即時フィードバックの価値が無い。invalidate 後の再取得は
 * 数百 ms で終わり、体感の遅さは生じない。
 */
export function useSegments() {
  return trpc.review.listSegments.useQuery();
}

export function useCreateSegment() {
  const utils = trpc.useUtils();
  const t = useTranslations('calendar.stats.review.segments');

  return trpc.review.createSegment.useMutation({
    onSuccess: () => {
      toast.success(t('created'));
    },
    onError: (error) => {
      toast.error(
        error.message.includes('DUPLICATE_NAME') ? t('duplicateName') : t('createFailed'),
      );
    },
    onSettled: () => {
      void utils.review.listSegments.invalidate();
    },
  });
}

export function useRenameSegment() {
  const utils = trpc.useUtils();
  const t = useTranslations('calendar.stats.review.segments');

  return trpc.review.renameSegment.useMutation({
    onError: (error) => {
      toast.error(
        error.message.includes('DUPLICATE_NAME') ? t('duplicateName') : t('renameFailed'),
      );
    },
    onSettled: () => {
      void utils.review.listSegments.invalidate();
    },
  });
}

export function useSetSegmentActivities() {
  const utils = trpc.useUtils();
  const t = useTranslations('calendar.stats.review.segments');

  return trpc.review.setSegmentActivities.useMutation({
    onError: () => {
      toast.error(t('updateFailed'));
    },
    onSettled: () => {
      void utils.review.listSegments.invalidate();
    },
  });
}

export function useDeleteSegment() {
  const utils = trpc.useUtils();
  const t = useTranslations('calendar.stats.review.segments');

  return trpc.review.deleteSegment.useMutation({
    onSuccess: () => {
      toast.success(t('deleted'));
    },
    onError: () => {
      toast.error(t('deleteFailed'));
    },
    onSettled: () => {
      void utils.review.listSegments.invalidate();
    },
  });
}

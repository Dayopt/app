'use client';

/**
 * バッジデータ取得・判定フック
 */

import { useEffect, useRef } from 'react';

import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { api } from '@/platform/trpc';

import { BADGE_MAP } from '../constants/badge-definitions';

/** バッジデータ取得 + マウント時にevaluate */
export function useBadges() {
  const t = useTranslations('badges');
  const hasEvaluated = useRef(false);

  const listQuery = api.badges.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const progressQuery = api.badges.getProgress.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const evaluateMutation = api.badges.evaluate.useMutation({
    onSuccess: (newlyEarned) => {
      if (newlyEarned.length > 0) {
        // 獲得バッジをトースト通知
        for (const badge of newlyEarned) {
          const def = BADGE_MAP.get(badge.badgeId);
          if (def) {
            const name = t(def.nameKey.replace('badges.', ''));
            const rankLabel = badge.rank ? ` (${t(`ranks.${badge.rank}`)})` : '';
            toast.success(`${name}${rankLabel} ${t('earned')}`);
          }
        }

        // リストと進捗を再取得
        void listQuery.refetch();
        void progressQuery.refetch();
      }
    },
  });

  // マウント時に1回だけevaluateを実行
  useEffect(() => {
    if (hasEvaluated.current) return;
    hasEvaluated.current = true;
    evaluateMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    earnedBadges: listQuery.data ?? [],
    progress: progressQuery.data ?? [],
    isPending: listQuery.isPending || progressQuery.isPending,
    isError: listQuery.isError || progressQuery.isError,
  };
}

'use client';

/**
 * バッジデータ取得・判定フック
 *
 * list + progress でUI表示（高速）。
 * evaluate はバックグラウンドで実行し、新規獲得時のみトースト + refetch。
 */

import { useEffect, useRef } from 'react';

import { useTranslations } from 'next-intl';

import { toast } from '@/lib/toast';
import { api } from '@/platform/trpc';

import { BADGE_MAP } from '../constants/badge-definitions';

export function useBadges() {
  const t = useTranslations('badges');
  const hasEvaluated = useRef(false);

  const listQuery = api.badges.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  const progressQuery = api.badges.getProgress.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    // list が返ってから進捗を取得（直列ではなくlist優先で表示を速く）
    enabled: !listQuery.isPending,
  });

  const evaluateMutation = api.badges.evaluate.useMutation({
    onSuccess: (newlyEarned) => {
      if (newlyEarned.length > 0) {
        for (const badge of newlyEarned) {
          const def = BADGE_MAP.get(badge.badgeId);
          if (def) {
            const name = t(def.nameKey.replace('badges.', ''));
            const rankLabel = badge.rank ? ` (${t(`ranks.${badge.rank}`)})` : '';
            toast.success(`${name}${rankLabel} ${t('earned')}`);
          }
        }
        // 新規獲得があった場合のみrefetch
        void listQuery.refetch();
        void progressQuery.refetch();
      }
    },
  });

  // list取得完了後にevaluateをバックグラウンド実行
  useEffect(() => {
    if (hasEvaluated.current || listQuery.isPending) return;
    hasEvaluated.current = true;
    evaluateMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.isPending]);

  return {
    earnedBadges: listQuery.data ?? [],
    progress: progressQuery.data ?? [],
    isPending: listQuery.isPending,
    isError: listQuery.isError || progressQuery.isError,
  };
}

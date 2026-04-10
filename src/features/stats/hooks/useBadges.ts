'use client';

/**
 * バッジデータ取得・判定フック
 *
 * list → evaluateWithProgress の2段階。
 * evaluateWithProgress が判定+進捗を1回のfetchSourceDataで返す。
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

  const evaluateMutation = api.badges.evaluateWithProgress.useMutation({
    onSuccess: ({ newlyEarned }) => {
      if (newlyEarned.length > 0) {
        for (const badge of newlyEarned) {
          const def = BADGE_MAP.get(badge.badgeId);
          if (def) {
            const name = t(def.nameKey.replace('badges.', ''));
            const rankLabel = badge.rank ? ` (${t(`ranks.${badge.rank}`)})` : '';
            toast.success(`${name}${rankLabel} ${t('earned')}`);
          }
        }
        // 新規獲得があった場合のみ list を refetch
        void listQuery.refetch();
      }
    },
  });

  // list取得完了後にevaluateWithProgressをバックグラウンド実行
  useEffect(() => {
    if (hasEvaluated.current || listQuery.isPending) return;
    hasEvaluated.current = true;
    evaluateMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listQuery.isPending]);

  return {
    earnedBadges: listQuery.data ?? [],
    progress: evaluateMutation.data?.progress ?? [],
    isPending: listQuery.isPending,
    isError: listQuery.isError || evaluateMutation.isError,
  };
}

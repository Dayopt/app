'use client';

import { useState } from 'react';

import { parseReviewDateParam } from '../lib/date-param';
import { useReviewFilterStore } from '../stores/useReviewFilterStore';
import type { ReviewViewRootProps } from '../types/review.types';
import { DailyReview } from './views/DailyReview';
import { WeeklyReview } from './views/WeeklyReview';

/**
 * ReviewView - 粒度別ビューの dispatcher
 *
 * 粒度（日/週）は「同じデータのズーム」ではなく「別の問い」として扱い、
 * 粒度ごとに composition を切り替える（review-granularity-redesign 設計書 §3-§5）。
 * 日=Daily Close / 週=Weekly Review。
 *
 * URL の ?g=&d= が指定されている場合は初回マウント時に store へ復元し、
 * リロード・deep link でも同じビューが再現されるようにする。
 */
export function ReviewView({ className, initialGranularity, initialDateStr }: ReviewViewRootProps) {
  // 初回マウント時に 1 度だけ URL パラメータを store に反映（描画前に同期適用）
  useState(() => {
    if (initialGranularity || initialDateStr) {
      useReviewFilterStore.setState({
        ...(initialGranularity ? { granularity: initialGranularity } : {}),
        ...(initialDateStr ? { currentDate: parseReviewDateParam(initialDateStr) } : {}),
      });
    }
  });

  const granularity = useReviewFilterStore((state) => state.granularity);

  switch (granularity) {
    case 'day':
      return <DailyReview className={className} />;
    case 'week':
      return <WeeklyReview className={className} />;
  }
}

'use client';

import { useState } from 'react';

import { parseReviewDateParam } from '../lib/date-param';
import { useReviewFilterStore } from '../stores/useReviewFilterStore';
import type { ReviewViewRootProps } from '../types/review.types';
import { WeeklyReview } from './views/WeeklyReview';

/**
 * ReviewView - 週次 Review の root
 *
 * 日次の予定 vs 実績確認は Calendar day compare mode に統合する。
 *
 * URL の ?g=&d= が指定されている場合は初回マウント時に store へ復元し、
 * リロード・deep link でも同じ週が再現されるようにする。
 */
export function ReviewView({ className, initialGranularity, initialDateStr }: ReviewViewRootProps) {
  // 初回マウント時に 1 度だけ URL パラメータを store に反映（描画前に同期適用）
  useState(() => {
    if (initialGranularity || initialDateStr) {
      useReviewFilterStore.setState({
        granularity: 'week',
        ...(initialDateStr ? { currentDate: parseReviewDateParam(initialDateStr) } : {}),
      });
    }
  });

  return <WeeklyReview className={className} />;
}

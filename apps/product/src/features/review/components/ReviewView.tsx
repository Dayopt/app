'use client';

import { useReviewFilterStore } from '../stores/useReviewFilterStore';
import type { ReviewViewProps } from '../types/review.types';
import { DailyReview } from './views/DailyReview';
import { MonthlyReview } from './views/MonthlyReview';
import { WeeklyReview } from './views/WeeklyReview';
import { YearlyReview } from './views/YearlyReview';

/**
 * ReviewView - 粒度別ビューの dispatcher
 *
 * 粒度（日/週/月/年）は「同じデータのズーム」ではなく「別の問い」として扱い、
 * 粒度ごとに composition を切り替える（review-granularity-redesign 設計書 §3-§5）。
 * 日=Daily Close / 週=Weekly Review / 月=Patterns / 年=Map Overview。
 */
export function ReviewView({ className }: ReviewViewProps) {
  const granularity = useReviewFilterStore((state) => state.granularity);

  switch (granularity) {
    case 'day':
      return <DailyReview className={className} />;
    case 'week':
      return <WeeklyReview className={className} />;
    case 'month':
      return <MonthlyReview className={className} />;
    case 'year':
      return <YearlyReview className={className} />;
  }
}

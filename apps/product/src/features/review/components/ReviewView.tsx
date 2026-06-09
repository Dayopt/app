'use client';

import { useReviewFilterStore } from '../stores/useReviewFilterStore';
import type { ReviewViewProps } from '../types/review.types';
import { WeeklyReview } from './views/WeeklyReview';

/**
 * ReviewView - 粒度別ビューの dispatcher
 *
 * 粒度（日/週/月/年）は「同じデータのズーム」ではなく「別の問い」として扱い、
 * 粒度ごとに composition を切り替える（review-granularity-redesign 設計書 §3-§5）。
 * day / month / year は固有ビュー実装（Step 3-4）までの暫定として WeeklyReview を表示する。
 */
export function ReviewView({ className }: ReviewViewProps) {
  const granularity = useReviewFilterStore((state) => state.granularity);

  switch (granularity) {
    case 'day':
      return <WeeklyReview className={className} />;
    case 'week':
      return <WeeklyReview className={className} />;
    case 'month':
      return <WeeklyReview className={className} />;
    case 'year':
      return <WeeklyReview className={className} />;
  }
}

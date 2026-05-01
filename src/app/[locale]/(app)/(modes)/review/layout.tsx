'use client';

import { ReviewLayout } from '@/features/review';

/**
 * Review 共通レイアウト
 *
 * 日付ナビゲーションヘッダーを 1 度だけマウント。
 * /review と /review/tags/[tagId] で共有する。
 */
export default function ReviewModeLayout({ children }: { children: React.ReactNode }) {
  return <ReviewLayout>{children}</ReviewLayout>;
}

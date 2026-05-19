'use client';

import { memo, type ReactNode } from 'react';

/**
 * アニメーションスタブコンポーネント
 *
 * framer-motion依存を削除したため、単純なラッパーとして実装
 * 将来的にアニメーションを追加する場合はここを拡張
 */

interface ViewAnimationProps {
  children: ReactNode;
  viewType?: string;
  className?: string;
}

// CalendarViewAnimation - ビュー切り替えアニメーション（スタブ）
// flex chainを維持するためにmin-h-0 flex-1を含む
export const CalendarViewAnimation = memo(function CalendarViewAnimation({
  children,
  className,
}: ViewAnimationProps) {
  return <div className={`flex min-h-0 flex-1 flex-col ${className ?? ''}`}>{children}</div>;
});

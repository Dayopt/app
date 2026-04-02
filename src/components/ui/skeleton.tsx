import { cn } from '@/lib/utils';

/**
 * Skeletonアニメーションタイプ
 * - pulse: フェードイン/アウト（デフォルト、軽量）
 * - shimmer: 左→右の波アニメーション（Facebook/LinkedIn方式、高級感）
 *
 * @see https://uxdesign.cc/what-you-should-know-about-skeleton-screens-a820c45a571a
 * shimmerはpulseより最大40%速く感じられる（UX研究結果）
 */
type SkeletonAnimation = 'pulse' | 'shimmer';

interface SkeletonProps extends React.ComponentProps<'div'> {
  /**
   * アニメーションタイプ
   * @default 'pulse'
   */
  variant?: SkeletonAnimation;
}

function Skeleton({ className, variant = 'pulse', ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'rounded-lg',
        variant === 'shimmer'
          ? 'animate-shimmer motion-reduce:bg-surface-container motion-reduce:animate-none'
          : 'bg-surface-container animate-pulse motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
export type { SkeletonAnimation, SkeletonProps };

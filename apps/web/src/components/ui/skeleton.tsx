import { cn } from '@/lib/utils';

type SkeletonAnimation = 'pulse' | 'shimmer';

interface SkeletonProps extends React.ComponentProps<'div'> {
  animation?: SkeletonAnimation;
}

function Skeleton({ className, animation = 'pulse', ...props }: SkeletonProps) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'rounded-lg',
        animation === 'shimmer'
          ? 'animate-shimmer motion-reduce:bg-container motion-reduce:animate-none'
          : 'bg-container animate-pulse motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
export type { SkeletonAnimation, SkeletonProps };

import { Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';

const sizeClasses = {
  sm: 'size-4',
  default: 'size-6',
  lg: 'size-8',
  xl: 'size-12',
} as const;

type SpinnerSize = keyof typeof sizeClasses;

interface SpinnerProps extends Omit<React.ComponentProps<'svg'>, 'aria-label'> {
  size?: SpinnerSize;
  'aria-label'?: string;
}

function Spinner({ size, className, 'aria-label': ariaLabel, ...props }: SpinnerProps) {
  return (
    <Loader2Icon
      role="status"
      aria-live="polite"
      aria-label={ariaLabel ?? 'Loading'}
      className={cn(
        'animate-spin motion-reduce:animate-none',
        size ? sizeClasses[size] : 'size-4',
        'text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

export { Spinner };

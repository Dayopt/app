import * as React from 'react';

import { cn } from './cn';

export interface LogoProps extends React.ComponentProps<'div'> {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'lockup' | 'mark' | 'wordmark';
}

const markSize = {
  sm: 'size-5 rounded-[var(--dayopt-radius-sm)]',
  md: 'size-7 rounded-[var(--dayopt-radius-md)]',
  lg: 'size-9 rounded-[var(--dayopt-radius-lg)]',
} as const;

const textSize = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
} as const;

export function Logo({
  className,
  label = 'Dayopt',
  size = 'md',
  variant = 'lockup',
  ...props
}: LogoProps) {
  const showMark = variant !== 'wordmark';
  const showWordmark = variant !== 'mark';

  return (
    <div
      data-slot="logo"
      aria-label={label}
      className={cn(
        'inline-flex items-center gap-2 text-[var(--dayopt-color-foreground)]',
        className,
      )}
      {...props}
    >
      {showMark ? (
        <span
          aria-hidden="true"
          className={cn(
            'grid place-items-center bg-[var(--dayopt-color-primary)] text-[var(--dayopt-color-primary-foreground)] shadow-[var(--dayopt-shadow-xs)]',
            markSize[size],
          )}
        >
          <svg viewBox="0 0 24 24" className="size-2/3" focusable="false" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 3.5c4.69 0 8.5 3.81 8.5 8.5s-3.81 8.5-8.5 8.5S3.5 16.69 3.5 12 7.31 3.5 12 3.5Zm0 3.2A5.31 5.31 0 0 0 6.7 12c0 2.92 2.38 5.3 5.3 5.3s5.3-2.38 5.3-5.3h-3.1a2.2 2.2 0 1 1-2.2-2.2V6.7Z"
            />
          </svg>
        </span>
      ) : null}
      {showWordmark ? (
        <span className={cn('font-medium tracking-tight', textSize[size])}>{label}</span>
      ) : null}
    </div>
  );
}

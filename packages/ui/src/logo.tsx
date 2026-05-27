import { Symbol, Wordmark } from '@dayopt/assets';
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
          <Symbol className="size-2/3" />
        </span>
      ) : null}
      {showWordmark ? <Wordmark className={textSize[size]}>{label}</Wordmark> : null}
    </div>
  );
}

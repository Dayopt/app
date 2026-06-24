import * as React from 'react';

import { cn } from '../cn';

export interface LogoProps extends React.ComponentProps<'div'> {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'lockup' | 'mark' | 'wordmark';
}

const markSize = {
  sm: 'size-5 rounded-[0.25rem]',
  md: 'size-7 rounded-lg',
  lg: 'size-9 rounded-2xl',
} as const;

const textSize = {
  sm: 'text-sm',
  md: 'text-lg',
  lg: 'text-2xl',
} as const;

// Dayopt symbol mark（配信用原本 SVG は packages/assets/brand/logo-mark.svg）
const SYMBOL_PATH_D =
  'M12 3.5c4.69 0 8.5 3.81 8.5 8.5s-3.81 8.5-8.5 8.5S3.5 16.69 3.5 12 7.31 3.5 12 3.5Zm0 3.2A5.31 5.31 0 0 0 6.7 12c0 2.92 2.38 5.3 5.3 5.3s5.3-2.38 5.3-5.3h-3.1a2.2 2.2 0 1 1-2.2-2.2V6.7Z';

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
      className={cn('text-foreground inline-flex items-center gap-2', className)}
      {...props}
    >
      {showMark ? (
        <span
          aria-hidden="true"
          className={cn(
            'bg-primary text-primary-foreground grid place-items-center shadow-xs',
            markSize[size],
          )}
        >
          <svg viewBox="0 0 24 24" focusable={false} aria-hidden="true" className="size-2/3">
            <path fill="currentColor" d={SYMBOL_PATH_D} />
          </svg>
        </span>
      ) : null}
      {showWordmark ? (
        <span className={cn('font-medium tracking-tight', textSize[size])}>{label}</span>
      ) : null}
    </div>
  );
}

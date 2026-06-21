import { Symbol, Wordmark } from '@dayopt/assets';
import * as React from 'react';

import { cn } from './cn';

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
          <Symbol className="size-2/3" />
        </span>
      ) : null}
      {showWordmark ? <Wordmark className={textSize[size]}>{label}</Wordmark> : null}
    </div>
  );
}

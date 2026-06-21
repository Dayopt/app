import * as React from 'react';

import { cn } from './cn';

export type VisuallyHiddenProps = React.ComponentProps<'span'>;

export function VisuallyHidden({ className, ...props }: VisuallyHiddenProps) {
  return (
    <span
      data-slot="visually-hidden"
      className={cn(
        'absolute h-px w-px overflow-hidden border-0 p-0 whitespace-nowrap [clip:rect(0,0,0,0)]',
        className,
      )}
      {...props}
    />
  );
}

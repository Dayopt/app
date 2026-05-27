import * as React from 'react';

export interface WordmarkProps extends React.ComponentProps<'span'> {}

const BRAND_NAME = 'Dayopt';

export function Wordmark({ className, children, ...props }: WordmarkProps) {
  return (
    <span
      className={['font-medium tracking-tight', className].filter(Boolean).join(' ')}
      {...props}
    >
      {children ?? BRAND_NAME}
    </span>
  );
}

export const BRAND_WORDMARK = BRAND_NAME;

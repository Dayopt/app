import * as React from 'react';

export type SymbolProps = React.SVGProps<SVGSVGElement>;

export function Symbol({ viewBox = '0 0 24 24', focusable = false, ...props }: SymbolProps) {
  return (
    <svg viewBox={viewBox} focusable={focusable} aria-hidden="true" {...props}>
      <path
        fill="currentColor"
        d="M12 3.5c4.69 0 8.5 3.81 8.5 8.5s-3.81 8.5-8.5 8.5S3.5 16.69 3.5 12 7.31 3.5 12 3.5Zm0 3.2A5.31 5.31 0 0 0 6.7 12c0 2.92 2.38 5.3 5.3 5.3s5.3-2.38 5.3-5.3h-3.1a2.2 2.2 0 1 1-2.2-2.2V6.7Z"
      />
    </svg>
  );
}

export const SYMBOL_PATH_D =
  'M12 3.5c4.69 0 8.5 3.81 8.5 8.5s-3.81 8.5-8.5 8.5S3.5 16.69 3.5 12 7.31 3.5 12 3.5Zm0 3.2A5.31 5.31 0 0 0 6.7 12c0 2.92 2.38 5.3 5.3 5.3s5.3-2.38 5.3-5.3h-3.1a2.2 2.2 0 1 1-2.2-2.2V6.7Z';

export const SYMBOL_VIEW_BOX = '0 0 24 24';

'use client';

import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { cn } from '@dayopt/components';

export const ANIMATED_WIDTH_PANEL_TRANSITION_MS = 200;
export const ANIMATED_WIDTH_PANEL_TRANSITION_CLASS = 'transition-all duration-200';

interface AnimatedWidthPanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  open: boolean;
  width: number;
  children: ReactNode;
  side?: 'left' | 'right' | undefined;
  innerClassName?: string | undefined;
  innerStyle?: CSSProperties | undefined;
  disableTransition?: boolean | undefined;
  unmountDelayMs?: number | undefined;
}

export function AnimatedWidthPanel({
  open,
  width,
  children,
  side = 'left',
  className,
  style,
  innerClassName,
  innerStyle,
  disableTransition = false,
  unmountDelayMs = ANIMATED_WIDTH_PANEL_TRANSITION_MS,
  ...props
}: AnimatedWidthPanelProps) {
  const [cachedChildren, setCachedChildren] = useState<ReactNode | null>(() =>
    open ? children : null,
  );

  useEffect(() => {
    if (open) {
      const timeout = window.setTimeout(() => {
        setCachedChildren(children);
      }, 0);
      return () => window.clearTimeout(timeout);
    }

    if (cachedChildren === null) return;

    const timeout = window.setTimeout(() => {
      setCachedChildren(null);
    }, unmountDelayMs);
    return () => window.clearTimeout(timeout);
  }, [cachedChildren, children, open, unmountDelayMs]);

  const visibleChildren = open ? children : cachedChildren;

  return (
    <div
      {...props}
      aria-hidden={props['aria-hidden'] ?? !open}
      inert={!open ? true : undefined}
      className={cn(
        'flex shrink-0 overflow-hidden',
        side === 'right' ? 'justify-end' : 'justify-start',
        !open && 'pointer-events-none',
        !disableTransition && ANIMATED_WIDTH_PANEL_TRANSITION_CLASS,
        className,
      )}
      style={{ ...style, width: open ? width : 0 }}
    >
      <div className={cn('h-full shrink-0', innerClassName)} style={{ ...innerStyle, width }}>
        {visibleChildren}
      </div>
    </div>
  );
}

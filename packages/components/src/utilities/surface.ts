import { cva, type VariantProps } from 'class-variance-authority';

/**
 * 浮く面（Overlay surface）の class builder
 *
 * Elevation の Overlay レベル（`bg-card` + `shadow-card` + `border-border-subtle`）を
 * 1 箇所で定義する。dropdown / popover / context menu など、
 * ページの上に浮く面はこの builder を通す。
 *
 * wrapper component にしないのは意図的: Radix の Content に className を渡す構造と
 * ref / props の受け渡しで喧嘩しないよう、class 文字列だけを返す。
 *
 * @example
 * ```tsx
 * <PopoverContent className={cn(overlaySurface(), 'w-72 p-4')} />
 * <div className={cn(overlaySurface({ radius: '2xl' }), 'z-overlay-popover')} />
 * ```
 */
export const overlaySurface = cva(
  'bg-card text-card-foreground border-border-subtle shadow-card border',
  {
    variants: {
      radius: {
        lg: 'rounded-lg',
        '2xl': 'rounded-2xl',
      },
    },
    defaultVariants: {
      radius: 'lg',
    },
  },
);

export type OverlaySurfaceVariants = VariantProps<typeof overlaySurface>;

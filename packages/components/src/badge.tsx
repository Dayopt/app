import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './cn';

export const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-[var(--dayopt-radius-md)] border px-2 py-1 text-xs font-normal',
    'transition-[color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dayopt-color-ring)]',
    '[&>svg]:pointer-events-none [&>svg]:size-3.5',
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-[var(--dayopt-color-primary)] text-[var(--dayopt-color-primary-foreground)]',
        secondary:
          'border-transparent bg-[var(--dayopt-color-container)] text-[var(--dayopt-color-foreground)]',
        outline:
          'border-[var(--dayopt-color-border)] bg-[var(--dayopt-color-background)] text-[var(--dayopt-color-foreground)]',
        success:
          'border-[var(--dayopt-color-success)] bg-[var(--dayopt-color-success-tint)] text-[var(--dayopt-color-success)]',
        warning:
          'border-[var(--dayopt-color-warning)] bg-[var(--dayopt-color-warning-tint)] text-[var(--dayopt-color-warning)]',
        info: 'border-[var(--dayopt-color-info)] bg-[var(--dayopt-color-info-tint)] text-[var(--dayopt-color-info)]',
        destructive:
          'border-transparent bg-[var(--dayopt-color-destructive)] text-[var(--dayopt-color-primary-foreground)]',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

export function Badge({ asChild = false, className, variant, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : 'span';

  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

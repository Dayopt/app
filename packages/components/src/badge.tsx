import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './cn';

export const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-lg border px-2 py-1 text-xs font-normal',
    'transition-[color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    '[&>svg]:pointer-events-none [&>svg]:size-3.5',
  ].join(' '),
  {
    variants: {
      variant: {
        primary: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-container text-foreground',
        outline: 'border-border bg-background text-foreground',
        success: 'border-success bg-success-tint text-success',
        warning: 'border-warning bg-warning-tint text-warning',
        info: 'border-info bg-info-tint text-info',
        destructive: 'border-transparent bg-destructive text-primary-foreground',
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

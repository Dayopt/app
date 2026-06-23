'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { XIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../cn';

const Sheet = ({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) => {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
};

const SheetTrigger = ({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) => {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
};

const SheetClose = ({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) => {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
};

const SheetPortal = ({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) => {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
};

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  return (
    <SheetPrimitive.Overlay
      ref={ref}
      data-slot="sheet-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 bg-overlay z-sheet fixed inset-0 motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
});
SheetOverlay.displayName = 'SheetOverlay';

const SheetContent = ({
  className,
  children,
  side = 'right',
  showCloseButton = true,
  'aria-label': ariaLabel,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  showCloseButton?: boolean;
}) => {
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          'bg-card text-card-foreground surface-raised-heavy z-sheet fixed flex flex-col gap-4 transition ease-in-out motion-reduce:transition-none',
          'data-[state=open]:animate-in data-[state=closed]:animate-out motion-reduce:animate-none',
          'data-[state=closed]:duration-300 data-[state=open]:duration-500',
          'focus:outline-hidden focus-visible:ring-0',
          'overscroll-contain',
          side === 'right' &&
            'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right border-border inset-y-0 right-0 h-full border-l',
          side === 'left' &&
            'data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left border-border inset-y-0 left-0 h-full w-4/5 max-w-80 border-r',
          side === 'top' &&
            'data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top border-border inset-x-0 top-0 h-auto border-b',
          side === 'bottom' &&
            'data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom border-border pb-safe inset-x-0 bottom-0 h-auto border-t',
          className,
        )}
        {...props}
      >
        <VisuallyHidden>
          <SheetPrimitive.Title>{ariaLabel || 'Sheet'}</SheetPrimitive.Title>
        </VisuallyHidden>
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            className={cn(
              'absolute top-4 right-4 rounded opacity-70 transition-opacity hover:opacity-100',
              'focus:outline-hidden focus-visible:ring-0',
              'disabled:pointer-events-none',
              'data-[state=open]:bg-state-selected',
            )}
          >
            <XIcon className="size-4" />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  );
};

const SheetHeader = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return (
    <div data-slot="sheet-header" className={cn('flex flex-col gap-2 p-4', className)} {...props} />
  );
};

const SheetFooter = ({ className, ...props }: React.ComponentProps<'div'>) => {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('mt-auto flex flex-col gap-2 p-4', className)}
      {...props}
    />
  );
};

const SheetTitle = ({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) => {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('text-foreground font-medium', className)}
      {...props}
    />
  );
};

const SheetDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) => {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
};

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
};

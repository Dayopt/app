import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { buttonVariants } from './button';

interface PaginationProps extends React.ComponentProps<'nav'> {
  /** aria-label for the navigation element */
  ariaLabel?: string;
}

const Pagination = ({ className, ariaLabel = 'pagination', ...props }: PaginationProps) => (
  <nav
    role="navigation"
    aria-label={ariaLabel}
    className={cn('mx-auto flex w-full justify-center', className)}
    {...props}
  />
);
Pagination.displayName = 'Pagination';

const PaginationContent = React.forwardRef<HTMLUListElement, React.ComponentProps<'ul'>>(
  ({ className, ...props }, ref) => (
    <ul ref={ref} className={cn('flex flex-row items-center gap-1', className)} {...props} />
  ),
);
PaginationContent.displayName = 'PaginationContent';

const PaginationItem = React.forwardRef<HTMLLIElement, React.ComponentProps<'li'>>(
  ({ className, ...props }, ref) => <li ref={ref} className={cn('', className)} {...props} />,
);
PaginationItem.displayName = 'PaginationItem';

type PaginationLinkProps = {
  isActive?: boolean;
  size?: 'sm' | 'default' | 'lg' | '_square-sm' | '_square-default' | '_square-lg';
} & React.ComponentProps<'a'>;

const PaginationLink = ({
  className,
  isActive,
  size = '_square-sm',
  ...props
}: PaginationLinkProps) => (
  <a
    aria-current={isActive ? 'page' : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? 'outline' : 'ghost',
        size,
      }),
      className,
    )}
    {...props}
  />
);
PaginationLink.displayName = 'PaginationLink';

interface PaginationPreviousProps extends React.ComponentProps<typeof PaginationLink> {
  /** Visible label text */
  label?: string;
  /** aria-label for accessibility */
  ariaLabel?: string;
}

const PaginationPrevious = ({
  className,
  label = 'Previous',
  ariaLabel = 'Go to previous page',
  ...props
}: PaginationPreviousProps) => (
  <PaginationLink
    aria-label={ariaLabel}
    size="default"
    className={cn('gap-1 pl-2.5', className)}
    {...props}
  >
    <ChevronLeft className="size-4" />
    <span>{label}</span>
  </PaginationLink>
);
PaginationPrevious.displayName = 'PaginationPrevious';

interface PaginationNextProps extends React.ComponentProps<typeof PaginationLink> {
  /** Visible label text */
  label?: string;
  /** aria-label for accessibility */
  ariaLabel?: string;
}

const PaginationNext = ({
  className,
  label = 'Next',
  ariaLabel = 'Go to next page',
  ...props
}: PaginationNextProps) => (
  <PaginationLink
    aria-label={ariaLabel}
    size="default"
    className={cn('gap-1 pr-2.5', className)}
    {...props}
  >
    <span>{label}</span>
    <ChevronRight className="size-4" />
  </PaginationLink>
);
PaginationNext.displayName = 'PaginationNext';

interface PaginationEllipsisProps extends React.ComponentProps<'span'> {
  /** Screen reader label */
  srLabel?: string;
}

const PaginationEllipsis = ({
  className,
  srLabel = 'More pages',
  ...props
}: PaginationEllipsisProps) => (
  <span aria-hidden className={cn('flex size-8 items-center justify-center', className)} {...props}>
    <MoreHorizontal className="size-4" />
    <span className="sr-only">{srLabel}</span>
  </span>
);
PaginationEllipsis.displayName = 'PaginationEllipsis';

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
};

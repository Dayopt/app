import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from './cn';

export const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--dayopt-radius-md)] font-normal',
    'transition-colors outline-none',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dayopt-color-ring)]',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(' '),
  {
    variants: {
      variant: {
        primary:
          'bg-[var(--dayopt-color-primary)] text-[var(--dayopt-color-primary-foreground)] hover:bg-[color-mix(in_oklch,var(--dayopt-color-primary)_90%,black)]',
        outline:
          'border border-[var(--dayopt-color-border)] bg-[var(--dayopt-color-container)] text-[var(--dayopt-color-foreground)] hover:bg-[var(--dayopt-color-muted)]',
        ghost: 'text-[var(--dayopt-color-foreground)] hover:bg-[var(--dayopt-color-muted)]',
        destructive:
          'bg-[var(--dayopt-color-destructive)] text-[var(--dayopt-color-primary-foreground)] hover:bg-[color-mix(in_oklch,var(--dayopt-color-destructive)_90%,black)] focus-visible:outline-[var(--dayopt-color-destructive)]',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        default: 'h-9 px-4 text-sm',
        lg: 'h-11 px-5 text-base [&_svg:not([class*="size-"])]:size-5',
        '_icon-sm': 'size-8 p-0',
        '_icon-default': 'size-9 p-0',
        '_icon-lg': 'size-11 p-0 [&_svg:not([class*="size-"])]:size-5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

type ButtonSize = 'sm' | 'default' | 'lg';
type ButtonChildProps = {
  className?: string | undefined;
  disabled?: boolean | undefined;
  onClick?: React.MouseEventHandler<HTMLElement> | undefined;
  ref?: React.Ref<HTMLElement> | undefined;
  tabIndex?: number | undefined;
  children?: React.ReactNode | undefined;
  'data-slot'?: string | undefined;
  'aria-busy'?: React.AriaAttributes['aria-busy'] | undefined;
  'aria-disabled'?: React.AriaAttributes['aria-disabled'] | undefined;
};

export interface ButtonProps
  extends React.ComponentProps<'button'>, Omit<VariantProps<typeof buttonVariants>, 'size'> {
  asChild?: boolean;
  icon?: boolean;
  loading?: boolean;
  loadingText?: string;
  size?: ButtonSize | null;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild = false,
      children,
      className,
      disabled,
      icon = false,
      loading = false,
      loadingText,
      onClick,
      size,
      variant,
      ...props
    },
    ref,
  ) => {
    const resolvedSize = icon ? (`_icon-${size ?? 'default'}` as const) : (size ?? undefined);
    const ariaDisabled = props['aria-disabled'];
    const disabledState = disabled || loading || ariaDisabled === true || ariaDisabled === 'true';
    const renderContent = (buttonContent: React.ReactNode) =>
      loading ? (
        <>
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
          />
          {loadingText ?? buttonContent}
        </>
      ) : (
        buttonContent
      );

    const handleClick = (
      event: React.MouseEvent<HTMLElement>,
      childOnClick?: React.MouseEventHandler<HTMLElement>,
    ) => {
      if (disabledState) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      onClick?.(event as React.MouseEvent<HTMLButtonElement>);
      childOnClick?.(event);
    };

    if (asChild && React.isValidElement<ButtonChildProps>(children)) {
      return React.cloneElement(children, {
        ...props,
        ref,
        'data-slot': 'button',
        className: cn(
          buttonVariants({ variant, size: resolvedSize, className }),
          children.props.className,
        ),
        disabled: disabledState,
        'aria-busy': loading || props['aria-busy'] || undefined,
        'aria-disabled': disabledState || props['aria-disabled'] || undefined,
        tabIndex: disabledState ? -1 : (props.tabIndex ?? children.props.tabIndex),
        onClick: (event: React.MouseEvent<HTMLElement>) =>
          handleClick(event, children.props.onClick),
        children: renderContent(children.props.children),
      });
    }

    return (
      <button
        ref={ref}
        data-slot="button"
        className={cn(buttonVariants({ variant, size: resolvedSize, className }))}
        disabled={disabledState}
        aria-busy={loading || undefined}
        onClick={(event) => handleClick(event)}
        {...props}
      >
        {renderContent(children)}
      </button>
    );
  },
);

Button.displayName = 'Button';

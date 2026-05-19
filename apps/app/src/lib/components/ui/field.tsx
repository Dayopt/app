'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { useMemo } from 'react';

import { Label } from '@/lib/components/ui/label';
import { Separator } from '@/lib/components/ui/separator';
import { cn } from '@/lib/utils';

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="field-group"
      className={cn(
        'group/field-group @container/field-group flex w-full flex-col gap-6 data-[slot=checkbox-group]:gap-4 [&>[data-slot=field-group]]:gap-4',
        className,
      )}
      {...props}
    />
  );
}

const fieldVariants = cva('group/field flex w-full gap-4 data-[invalid=true]:text-destructive', {
  variants: {
    orientation: {
      vertical: ['flex-col [&>*]:w-full [&>.sr-only]:w-auto'],
      horizontal: [
        'flex-row items-center',
        '[&>[data-slot=field-label]]:flex-auto',
        'has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      ],
      responsive: [
        'flex-col [&>*]:w-full [&>.sr-only]:w-auto @md/field-group:flex-row @md/field-group:items-center @md/field-group:[&>*]:w-auto',
        '@md/field-group:[&>[data-slot=field-label]]:flex-auto',
        '@md/field-group:has-[>[data-slot=field-content]]:items-start @md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px',
      ],
    },
  },
  defaultVariants: {
    orientation: 'vertical',
  },
});

function Field({
  className,
  orientation = 'vertical',
  ...props
}: React.ComponentProps<'div'> & VariantProps<typeof fieldVariants>) {
  return (
    <div
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  );
}

interface FieldLabelProps extends React.ComponentProps<typeof Label> {
  /** 必須表示（※必須 / Required） */
  required?: boolean;
  /** 任意表示（※任意 / Optional） */
  optional?: boolean;
  /** 必須ラベルテキスト（i18n用） */
  requiredLabel?: string;
  /** 任意ラベルテキスト（i18n用） */
  optionalLabel?: string;
}

function FieldLabel({
  className,
  required,
  optional,
  requiredLabel = '※必須',
  optionalLabel = '※任意',
  children,
  ...props
}: FieldLabelProps) {
  return (
    <Label
      data-slot="field-label"
      className={cn(
        'group/field-label peer/field-label flex w-fit gap-2 leading-snug group-data-[disabled=true]/field:opacity-50',
        'has-[>[data-slot=field]]:w-full has-[>[data-slot=field]]:flex-col has-[>[data-slot=field]]:rounded-lg has-[>[data-slot=field]]:border [&>*]:data-[slot=field]:p-4',
        'has-data-[state=checked]:bg-primary-state-selected has-data-[state=checked]:border-primary',
        className,
      )}
      {...props}
    >
      {children}
      {required && <span className="text-destructive text-sm font-normal">{requiredLabel}</span>}
      {optional && !required && (
        <span className="text-muted-foreground text-sm font-normal">{optionalLabel}</span>
      )}
    </Label>
  );
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-description"
      className={cn(
        'text-muted-foreground text-sm leading-normal font-normal group-has-[[data-orientation=horizontal]]/field:text-balance',
        'last:mt-0 nth-last-2:-mt-1 [[data-variant=legend]+&]:-mt-2',
        '[&>a:hover]:text-foreground [&>a]:underline [&>a]:underline-offset-4',
        className,
      )}
      {...props}
    />
  );
}

/**
 * FieldSupportText - DADS準拠のサポートテキスト
 *
 * ラベルとinputの間に配置し、入力形式の説明を表示する。
 * placeholderの代替として使用（DADS: placeholderは禁止）
 */
function FieldSupportText({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      data-slot="field-support-text"
      className={cn('text-muted-foreground -mt-1 text-sm leading-normal font-normal', className)}
      {...props}
    />
  );
}

function FieldSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & {
  children?: React.ReactNode;
}) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        'relative -my-2 h-4 text-sm group-data-[variant=outline]/field-group:-mb-2',
        className,
      )}
      {...props}
    >
      <Separator className="absolute inset-0 top-1/2" />
      {children && (
        <span
          className="bg-background text-muted-foreground relative mx-auto block w-fit px-2"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  );
}

/**
 * FieldError - DADS準拠のエラー表示
 *
 * - デフォルトでrole="alert"なし（DADS: aria-live禁止）
 * - announceImmediatelyでサーバーエラー等を即時通知可能
 * - エラーメッセージに「＊」prefixを自動付与
 */
function FieldError({
  className,
  children,
  errors,
  /** サーバーエラー等で即座にスクリーンリーダーに通知が必要な場合 */
  announceImmediately,
  /** エラーprefixを表示しない場合 */
  noPrefix,
  ...props
}: React.ComponentProps<'div'> & {
  errors?: Array<{ message?: string } | undefined>;
  announceImmediately?: boolean;
  noPrefix?: boolean;
}) {
  const content = useMemo(() => {
    const prefix = noPrefix ? '' : '＊';

    if (children) {
      // childrenが文字列の場合は「＊」を付与
      if (typeof children === 'string') {
        return `${prefix}${children}`;
      }
      return children;
    }

    if (!errors) {
      return null;
    }

    if (errors?.length === 1 && errors[0]?.message) {
      return `${prefix}${errors[0].message}`;
    }

    return (
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {errors.map(
          (error, index) =>
            error?.message && (
              <li key={index}>
                {prefix}
                {error.message}
              </li>
            ),
        )}
      </ul>
    );
  }, [children, errors, noPrefix]);

  if (!content) {
    return null;
  }

  return (
    <div
      // DADS準拠: デフォルトでrole="alert"なし（announceImmediatelyでオプトイン）
      role={announceImmediately ? 'alert' : undefined}
      data-slot="field-error"
      className={cn('text-destructive text-sm font-normal', className)}
      {...props}
    >
      {content}
    </div>
  );
}

export {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
  FieldSupportText,
};

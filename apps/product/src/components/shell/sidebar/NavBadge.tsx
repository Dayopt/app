'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export type NavBadgeVariant = 'new' | 'beta';

interface NavBadgeProps {
  variant?: NavBadgeVariant;
  className?: string;
}

/** Nav アイコン右上に表示する "NEW" / "β" バッジ。icon 側の relative container に配置する。 */
export function NavBadge({ variant = 'new', className }: NavBadgeProps) {
  const t = useTranslations('sidebar.navBadge');
  const label = t(variant);

  return (
    <span
      aria-label={label}
      className={cn(
        'absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1',
        'bg-warning text-warning-foreground text-xs leading-none font-medium',
        className,
      )}
    >
      {label}
    </span>
  );
}

'use client';

import { createElement } from 'react';

import { Check, icons, Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import type { BadgeWithStatus } from '../../types/badge.types';

// ---------------------------------------------------------------------------
// Badge ring color mapping (semantic tokens)
// ---------------------------------------------------------------------------

const RANK_RING_CLASS = {
  bronze: 'ring-badge-bronze',
  silver: 'ring-badge-silver',
  gold: 'ring-badge-gold',
} as const;

const CATEGORY_RING_CLASS = {
  growth: 'ring-badge-growth',
  exploration: 'ring-badge-exploration',
  pattern: 'ring-badge-pattern',
  loyalty: 'ring-badge-loyalty',
} as const;

const CATEGORY_TEXT_CLASS = {
  growth: 'text-badge-growth',
  exploration: 'text-badge-exploration',
  pattern: 'text-badge-pattern',
  loyalty: 'text-badge-loyalty',
} as const;

// ---------------------------------------------------------------------------
// Icon resolver
// ---------------------------------------------------------------------------

function resolveIcon(name: string) {
  return icons[name as keyof typeof icons];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BadgeCellProps {
  badge: BadgeWithStatus;
  onSelect: (badgeId: string, element: HTMLElement) => void;
}

export function BadgeCell({ badge, onSelect }: BadgeCellProps) {
  const t = useTranslations('badges');
  const { definition, earned, currentRank } = badge;
  const IconComponent = resolveIcon(definition.icon);
  const nameKey = definition.nameKey.replace('badges.', '');

  const ringClass = earned
    ? definition.isTiered && currentRank
      ? RANK_RING_CLASS[currentRank]
      : CATEGORY_RING_CLASS[definition.category]
    : '';

  const iconColorClass = earned
    ? CATEGORY_TEXT_CLASS[definition.category]
    : 'text-muted-foreground';

  return (
    <button
      type="button"
      className={cn(
        'border-border-subtle bg-card relative flex flex-col items-center gap-2 rounded-lg border p-4 shadow-sm',
        'transition-colors duration-150',
        'hover:bg-muted focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none',
      )}
      onClick={(e) => onSelect(definition.id, e.currentTarget)}
      aria-label={`${t(nameKey)} — ${earned ? t('earned') : t('locked')}`}
    >
      {/* Icon circle */}
      <div
        className={cn(
          'relative flex size-12 items-center justify-center rounded-full',
          earned ? `ring-2 ${ringClass} bg-background` : 'bg-muted',
          !earned && 'opacity-30',
        )}
      >
        {IconComponent
          ? createElement(IconComponent, {
              className: cn('size-6', iconColorClass),
              'aria-hidden': true,
            })
          : null}

        {/* Status indicator — inside circle, bottom-right */}
        <div className="absolute -right-0.5 -bottom-0.5">
          {earned ? (
            <div className="bg-success flex size-4 items-center justify-center rounded-full">
              <Check className="text-success-foreground size-3.5" aria-hidden />
            </div>
          ) : (
            <Lock className="text-muted-foreground size-3.5 opacity-30" aria-hidden />
          )}
        </div>
      </div>

      {/* Label */}
      <span
        className={cn(
          'w-full truncate text-center text-xs',
          earned ? 'text-foreground' : 'text-muted-foreground opacity-50',
        )}
      >
        {t(nameKey)}
      </span>
    </button>
  );
}

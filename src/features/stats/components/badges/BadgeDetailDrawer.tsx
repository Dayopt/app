'use client';

import { createElement, useEffect, useRef } from 'react';

import { icons } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/lib/components/ui/drawer';
import { Popover, PopoverAnchor, PopoverContent } from '@/lib/components/ui/popover';
import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { cn } from '@/lib/utils';

import { getProgressPercent } from '../../lib/badge-utils';
import type { BadgeRank, BadgeWithStatus } from '../../types/badge.types';

// ---------------------------------------------------------------------------
// Color classes
// ---------------------------------------------------------------------------

const RANK_BG_CLASS = {
  bronze: 'bg-badge-bronze',
  silver: 'bg-badge-silver',
  gold: 'bg-badge-gold',
} as const;

const CATEGORY_BG_CLASS = {
  growth: 'bg-badge-growth',
  exploration: 'bg-badge-exploration',
  pattern: 'bg-badge-pattern',
  loyalty: 'bg-badge-loyalty',
} as const;

const RANK_LABEL: Record<BadgeRank, string> = {
  bronze: 'ranks.bronze',
  silver: 'ranks.silver',
  gold: 'ranks.gold',
};

// ---------------------------------------------------------------------------
// Shared detail content
// ---------------------------------------------------------------------------

export function BadgeDetailContent({ badge }: { badge: BadgeWithStatus }) {
  const t = useTranslations('badges');
  const { definition, earned, userBadge, progress, currentRank } = badge;
  const IconComponent = icons[definition.icon as keyof typeof icons];
  const nameKey = definition.nameKey.replace('badges.', '');
  const descKey = definition.descriptionKey.replace('badges.', '');
  const percent = getProgressPercent(progress);

  const iconBgClass = earned
    ? definition.isTiered && currentRank
      ? RANK_BG_CLASS[currentRank]
      : CATEGORY_BG_CLASS[definition.category]
    : 'bg-muted';

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Large icon */}
      <div
        className={cn(
          'flex size-16 items-center justify-center rounded-full',
          iconBgClass,
          !earned && 'opacity-40',
        )}
      >
        {IconComponent
          ? createElement(IconComponent, {
              className: 'size-8 text-white',
              'aria-hidden': true,
            })
          : null}
      </div>

      {/* Title + rank */}
      <div className="text-center">
        <p className="text-foreground text-lg font-medium">
          {t(nameKey)}
          {definition.isTiered && currentRank && (
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {t(RANK_LABEL[currentRank])}
            </span>
          )}
        </p>
        <p className="text-muted-foreground text-sm">{t(descKey)}</p>
      </div>

      {/* Earned date or locked label */}
      {earned && userBadge ? (
        <p className="text-muted-foreground text-sm">
          {t('earnedAt', { date: new Date(userBadge.earnedAt).toLocaleDateString() })}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm">{t('notEarned')}</p>
      )}

      {/* Progress bar for tiered badges */}
      {definition.isTiered && progress && (
        <div className="flex w-full flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {t('progress', {
                current: progress.currentValue,
                target: progress.targetValue,
              })}
            </span>
            {progress.rank && (
              <span className="text-muted-foreground">{t(RANK_LABEL[progress.rank])}</span>
            )}
          </div>
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                progress.rank ? RANK_BG_CLASS[progress.rank] : 'bg-primary',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          {definition.thresholds && (
            <div className="text-muted-foreground flex justify-between text-xs">
              {definition.thresholds.map((th) => (
                <span key={`${th.rank}-${th.value}`}>{th.value}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Progress for non-tiered badges */}
      {!definition.isTiered && !earned && progress && (
        <div className="flex w-full flex-col gap-2">
          <div className="bg-muted h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      )}

      {/* Hint for unearned badges */}
      {!earned && definition.hintKey && (
        <p className="text-muted-foreground text-center text-sm">
          {t(definition.hintKey.replace('badges.', ''))}
        </p>
      )}

      {/* Navigation link for unearned badges */}
      {!earned && definition.link && (
        <a
          href={definition.link}
          className="text-primary text-center text-sm underline underline-offset-4"
        >
          {t('openFeature')}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component — PC: Popover / Mobile: Drawer
// ---------------------------------------------------------------------------

interface BadgeDetailDrawerProps {
  badge: BadgeWithStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function BadgeDetailDrawer({
  badge,
  open,
  onOpenChange,
  anchorRef,
}: BadgeDetailDrawerProps) {
  const isMobile = useIsMobile();
  const popoverAnchorRef = useRef<HTMLDivElement>(null);

  // Sync popover anchor position with clicked badge cell
  useEffect(() => {
    if (!open || isMobile || !anchorRef.current || !popoverAnchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const anchor = popoverAnchorRef.current;
    anchor.style.position = 'fixed';
    anchor.style.left = `${rect.left + rect.width / 2}px`;
    anchor.style.top = `${rect.top + rect.height / 2}px`;
  }, [open, isMobile, anchorRef]);

  if (!badge) return null;

  // --- Mobile: Drawer ---
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>Badge Detail</DrawerTitle>
            <DrawerDescription>Badge detail information</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            <BadgeDetailContent badge={badge} />
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // --- PC: Popover ---
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div ref={popoverAnchorRef} className="pointer-events-none fixed size-0" />
      </PopoverAnchor>
      <PopoverContent className="w-80" align="center" sideOffset={8}>
        <BadgeDetailContent badge={badge} />
      </PopoverContent>
    </Popover>
  );
}

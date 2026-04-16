'use client';

import { useCallback, useRef, useState } from 'react';

import { Skeleton } from '@/lib/components/ui/skeleton';

import { BADGE_COUNT } from '../../constants/badge-definitions';
import { useBadges } from '../../hooks/useBadges';
import { buildBadgeStatuses, countEarnedBadges } from '../../lib/badge-status';
import { BadgeDetailDrawer } from './BadgeDetailDrawer';
import { BadgeGrid } from './BadgeGrid';

export function BadgeSection() {
  const { earnedBadges, progress, isPending } = useBadges();
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const anchorRef = useRef<HTMLElement | null>(null);

  const badges = buildBadgeStatuses(earnedBadges, progress);
  const earnedCount = countEarnedBadges(earnedBadges);
  const selectedBadge = badges.find((b) => b.definition.id === selectedBadgeId) ?? null;

  const handleSelect = useCallback((badgeId: string, element: HTMLElement) => {
    anchorRef.current = element;
    setSelectedBadgeId(badgeId);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedBadgeId(null);
      anchorRef.current = null;
    }
  }, []);

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-end">
            <Skeleton className="h-4 w-12" />
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header — count + progress bar */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-end">
          <span className="text-muted-foreground text-sm">
            {earnedCount}/{BADGE_COUNT}
          </span>
        </div>
        <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-300"
            style={{ width: `${Math.round((earnedCount / BADGE_COUNT) * 100)}%` }}
          />
        </div>
      </div>

      {/* Grid */}
      <BadgeGrid badges={badges} onSelect={handleSelect} />

      {/* Detail — PC: Popover / Mobile: Drawer */}
      <BadgeDetailDrawer
        badge={selectedBadge}
        open={selectedBadgeId !== null}
        onOpenChange={handleOpenChange}
        anchorRef={anchorRef}
      />
    </div>
  );
}

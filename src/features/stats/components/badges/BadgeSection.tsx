'use client';

import { useCallback, useRef, useState } from 'react';

import { Skeleton } from '@/components/ui/skeleton';

import { BADGE_COUNT } from '../../constants/badge-definitions';
import { useBadges } from '../../hooks/useBadges';
import { buildBadgeStatuses, countEarnedBadges } from '../../lib/badge-utils';
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
        <div className="flex items-center justify-end">
          <Skeleton className="h-4 w-12" />
        </div>
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header — count only (title is in the tab) */}
      <div className="flex items-center justify-end">
        <span className="text-muted-foreground text-sm">
          {earnedCount}/{BADGE_COUNT}
        </span>
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

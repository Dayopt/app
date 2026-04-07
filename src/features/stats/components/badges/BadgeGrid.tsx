'use client';

import type { BadgeWithStatus } from '../../types/badge.types';
import { BadgeCell } from './BadgeCell';

interface BadgeGridProps {
  badges: BadgeWithStatus[];
  onSelect: (badgeId: string, element: HTMLElement) => void;
}

export function BadgeGrid({ badges, onSelect }: BadgeGridProps) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {badges.map((badge) => (
        <BadgeCell key={badge.definition.id} badge={badge} onSelect={onSelect} />
      ))}
    </div>
  );
}

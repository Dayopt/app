/**
 * BadgeGrid / BadgeCell Stories
 *
 * バッジグリッドの各状態。propsのみ依存。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { BADGE_DEFINITIONS } from '../../constants/badge-definitions';
import type { BadgeWithStatus, UserBadge } from '../../types/badge.types';
import { BadgeGrid } from './BadgeGrid';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

function earned(badgeId: string, rank: string | null = null): UserBadge {
  return { id: `ub-${badgeId}`, badgeId, rank: rank as UserBadge['rank'], earnedAt: now };
}

const EARNED_IDS = new Map([
  ['streak', 'silver'],
  ['blocks', 'bronze'],
  ['tag-hours', 'bronze'],
  ['tags-5', null],
  ['early-bird', null],
  ['full-week', null],
  ['pro-signup', null],
]);

const ALL_BADGES: BadgeWithStatus[] = BADGE_DEFINITIONS.map((def) => {
  const earnedRank = EARNED_IDS.get(def.id);
  const isEarned = EARNED_IDS.has(def.id);

  const result: BadgeWithStatus = {
    definition: def,
    earned: isEarned,
  };
  if (isEarned) {
    result.userBadge = earned(def.id, earnedRank ?? null);
    if (earnedRank) result.currentRank = earnedRank as NonNullable<BadgeWithStatus['currentRank']>;
  }
  if (!isEarned) {
    result.progress = { badgeId: def.id, currentValue: 0, targetValue: 1 };
  }
  return result;
});

const ALL_EARNED: BadgeWithStatus[] = BADGE_DEFINITIONS.map((def) => {
  const result: BadgeWithStatus = {
    definition: def,
    earned: true,
    userBadge: earned(def.id, def.isTiered ? 'gold' : null),
  };
  if (def.isTiered) result.currentRank = 'gold';
  return result;
});

const ALL_LOCKED: BadgeWithStatus[] = BADGE_DEFINITIONS.map((def) => ({
  definition: def,
  earned: false,
  progress: { badgeId: def.id, currentValue: 0, targetValue: 1 },
}));

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'Features/Stats/Badges/Card',
  component: BadgeGrid,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  args: { onSelect: fn() },
  decorators: [
    (Story) => (
      <div className="w-full max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof BadgeGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 一部獲得・一部未獲得の混合状態。 */
export const Default: Story = {
  args: { badges: ALL_BADGES },
};

/** 全バッジ獲得済み。 */
export const AllEarned: Story = {
  args: { badges: ALL_EARNED },
};

/** 全バッジ未獲得。 */
export const AllLocked: Story = {
  args: { badges: ALL_LOCKED },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: { badges: ALL_BADGES },
  render: (args) => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-2 text-sm">Mixed (8/20 earned)</p>
        <BadgeGrid {...args} badges={ALL_BADGES} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-sm">All Earned</p>
        <BadgeGrid {...args} badges={ALL_EARNED} />
      </div>
      <div>
        <p className="text-muted-foreground mb-2 text-sm">All Locked</p>
        <BadgeGrid {...args} badges={ALL_LOCKED} />
      </div>
    </div>
  ),
};

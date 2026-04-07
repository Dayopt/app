/**
 * BadgeDetail Stories
 *
 * バッジ詳細Popover/Drawerの各状態。グリッド上に重ねた実際の見た目を再現。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { fn } from 'storybook/test';

import { BADGE_DEFINITIONS, BADGE_MAP } from '../../constants/badge-definitions';
import type { BadgeRank, BadgeWithStatus, UserBadge } from '../../types/badge.types';
import { BadgeCell } from './BadgeCell';
import { BadgeDetailContent } from './BadgeDetailDrawer';

// ---------------------------------------------------------------------------
// Mock data helpers
// ---------------------------------------------------------------------------

const now = new Date().toISOString();

function mockEarned(badgeId: string, rank: string | null = null): UserBadge {
  return { id: `ub-${badgeId}`, badgeId, rank: rank as BadgeRank | null, earnedAt: now };
}

function makeBadge(
  id: string,
  opts: { earned?: boolean; rank?: BadgeRank; currentValue?: number; targetValue?: number } = {},
): BadgeWithStatus {
  const def = BADGE_MAP.get(id) ?? BADGE_DEFINITIONS[0]!;
  const result: BadgeWithStatus = {
    definition: def,
    earned: opts.earned ?? false,
  };
  if (opts.earned) {
    result.userBadge = mockEarned(id, opts.rank ?? null);
    if (opts.rank) result.currentRank = opts.rank;
  }
  if (opts.currentValue !== undefined) {
    result.progress = {
      badgeId: id,
      currentValue: opts.currentValue,
      targetValue: opts.targetValue ?? 1,
    };
  }
  return result;
}

// Background grid for realistic context
const GRID_BADGES: BadgeWithStatus[] = BADGE_DEFINITIONS.slice(0, 6).map((def) => ({
  definition: def,
  earned: Math.random() > 0.5,
  ...(Math.random() > 0.5 ? { userBadge: mockEarned(def.id), currentRank: 'bronze' as const } : {}),
}));

function GridBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-full max-w-2xl">
      {/* Blurred badge grid behind */}
      <div className="flex flex-wrap gap-4 opacity-40 blur-[1px]">
        {GRID_BADGES.map((b) => (
          <BadgeCell key={b.definition.id} badge={b} onSelect={fn()} />
        ))}
      </div>
      {/* Popover overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="border-border-subtle bg-card shadow-card w-80 rounded-lg border p-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'Features/Stats/Badges/Detail',
  component: BadgeDetailContent,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <GridBackground>
        <Story />
      </GridBackground>
    ),
  ],
} satisfies Meta<typeof BadgeDetailContent>;

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

/** 段階成長型・シルバーランク獲得済み。 */
export const TieredEarned: Story = {
  args: {
    badge: makeBadge('streak', {
      earned: true,
      rank: 'silver',
      currentValue: 14,
      targetValue: 30,
    }),
  },
};

/** 段階成長型・ゴールド獲得済み。 */
export const TieredGold: Story = {
  args: {
    badge: makeBadge('blocks', {
      earned: true,
      rank: 'gold',
      currentValue: 1000,
      targetValue: 1000,
    }),
  },
};

/** 段階成長型（タグマスター）・ブロンズ獲得済み。 */
export const TagHoursBronze: Story = {
  args: {
    badge: makeBadge('tag-hours', {
      earned: true,
      rank: 'bronze',
      currentValue: 3500,
      targetValue: 6000,
    }),
  },
};

/** 段階成長型・未獲得（進捗あり）。 */
export const TieredLocked: Story = {
  args: {
    badge: makeBadge('streak', {
      earned: false,
      currentValue: 2,
      targetValue: 7,
    }),
  },
};

/** 通常バッジ・獲得済み。 */
export const SimpleEarned: Story = {
  args: {
    badge: makeBadge('tags-5', { earned: true }),
  },
};

/** 通常バッジ・未獲得（ヒント付き）。 */
export const SimpleLocked: Story = {
  args: {
    badge: makeBadge('deep-zone', {
      earned: false,
      currentValue: 0,
      targetValue: 1,
    }),
  },
};

/** ロイヤルティ系・獲得済み。 */
export const LoyaltyEarned: Story = {
  args: {
    badge: makeBadge('pro-signup', { earned: true }),
  },
};

/** 全パターン一覧。 */
export const AllPatterns: Story = {
  args: {
    badge: makeBadge('streak', { earned: true, rank: 'silver', currentValue: 14, targetValue: 30 }),
  },
  decorators: [
    (Story) => (
      <div className="flex flex-col gap-8">
        <Story />
      </div>
    ),
  ],
  render: () => (
    <>
      <GridBackground>
        <BadgeDetailContent
          badge={makeBadge('streak', {
            earned: true,
            rank: 'silver',
            currentValue: 14,
            targetValue: 30,
          })}
        />
      </GridBackground>
      <GridBackground>
        <BadgeDetailContent
          badge={makeBadge('tag-hours', {
            earned: true,
            rank: 'bronze',
            currentValue: 3500,
            targetValue: 6000,
          })}
        />
      </GridBackground>
      <GridBackground>
        <BadgeDetailContent badge={makeBadge('early-bird', { earned: true })} />
      </GridBackground>
      <GridBackground>
        <BadgeDetailContent
          badge={makeBadge('chronotype-trio', { earned: false, currentValue: 0, targetValue: 1 })}
        />
      </GridBackground>
    </>
  ),
};

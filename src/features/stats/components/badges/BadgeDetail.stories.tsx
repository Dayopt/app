/**
 * BadgeDetail Stories
 *
 * バッジ詳細コンテンツの各状態。propsのみ依存。
 */

import type { Meta, StoryObj } from '@storybook/nextjs-vite';

import { BADGE_DEFINITIONS, BADGE_MAP } from '../../constants/badge-definitions';
import type { BadgeRank, BadgeWithStatus, UserBadge } from '../../types/badge.types';
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
      ...(opts.rank ? {} : {}),
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta = {
  title: 'Features/Stats/BadgeDetail',
  component: BadgeDetailContent,
  tags: ['autodocs'],
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div className="border-border-subtle bg-card shadow-card w-80 rounded-lg border p-4">
        <Story />
      </div>
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

/** 段階成長型・未獲得（進捗あり）。 */
export const TieredLocked: Story = {
  args: {
    badge: makeBadge('streak', {
      earned: false,
      currentValue: 2,
      targetValue: 3,
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
  render: () => (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-muted-foreground mb-2 text-sm">Tiered — Silver earned</p>
        <BadgeDetailContent
          badge={makeBadge('streak', {
            earned: true,
            rank: 'silver',
            currentValue: 14,
            targetValue: 30,
          })}
        />
      </div>
      <hr className="border-border" />
      <div>
        <p className="text-muted-foreground mb-2 text-sm">Tiered — Locked</p>
        <BadgeDetailContent
          badge={makeBadge('blocks', { earned: false, currentValue: 42, targetValue: 100 })}
        />
      </div>
      <hr className="border-border" />
      <div>
        <p className="text-muted-foreground mb-2 text-sm">Simple — Earned</p>
        <BadgeDetailContent badge={makeBadge('early-bird', { earned: true })} />
      </div>
      <hr className="border-border" />
      <div>
        <p className="text-muted-foreground mb-2 text-sm">With hint + link — Locked</p>
        <BadgeDetailContent
          badge={makeBadge('deep-zone', { earned: false, currentValue: 0, targetValue: 1 })}
        />
      </div>
    </div>
  ),
};

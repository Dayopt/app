/**
 * バッジ定義 — 全14個
 *
 * カテゴリ:
 * - growth: 段階成長型（ブロンズ→シルバー→ゴールド）
 * - exploration: 機能発見のガイド役
 * - pattern: 時間帯・行動パターン系
 * - loyalty: Pro・ロイヤルティ系
 */

import type { BadgeDefinition } from '../types/badge.types';

// ---------------------------------------------------------------------------
// 段階成長型（3個）
// ---------------------------------------------------------------------------

const GROWTH_BADGES: BadgeDefinition[] = [
  {
    id: 'streak',
    category: 'growth',
    nameKey: 'badges.streak.name',
    descriptionKey: 'badges.streak.description',
    icon: 'Flame',
    isTiered: true,
    thresholds: [
      { rank: 'bronze', value: 7 },
      { rank: 'silver', value: 14 },
      { rank: 'gold', value: 30 },
    ],
  },
  {
    id: 'blocks',
    category: 'growth',
    nameKey: 'badges.blocks.name',
    descriptionKey: 'badges.blocks.description',
    icon: 'Layers',
    isTiered: true,
    thresholds: [
      { rank: 'bronze', value: 100 },
      { rank: 'silver', value: 500 },
      { rank: 'gold', value: 1000 },
    ],
  },
  {
    id: 'tag-hours',
    category: 'growth',
    nameKey: 'badges.tagHours.name',
    descriptionKey: 'badges.tagHours.description',
    icon: 'Clock',
    isTiered: true,
    thresholds: [
      { rank: 'bronze', value: 3000 },
      { rank: 'silver', value: 6000 },
      { rank: 'gold', value: 12000 },
    ],
  },
];

// ---------------------------------------------------------------------------
// 探索系（5個）
// ---------------------------------------------------------------------------

const EXPLORATION_BADGES: BadgeDefinition[] = [
  {
    id: 'tags-5',
    category: 'exploration',
    nameKey: 'badges.tags5.name',
    descriptionKey: 'badges.tags5.description',
    icon: 'Compass',
    isTiered: false,
  },
  {
    id: 'deep-zone',
    category: 'exploration',
    nameKey: 'badges.deepZone.name',
    descriptionKey: 'badges.deepZone.description',
    hintKey: 'badges.deepZone.hint',
    icon: 'Sun',
    isTiered: false,
  },
  {
    id: 'full-day',
    category: 'exploration',
    nameKey: 'badges.fullDay.name',
    descriptionKey: 'badges.fullDay.description',
    hintKey: 'badges.fullDay.hint',
    icon: 'BarChart3',
    isTiered: false,
  },
  {
    id: 'group-first',
    category: 'exploration',
    nameKey: 'badges.groupFirst.name',
    descriptionKey: 'badges.groupFirst.description',
    icon: 'FolderOpen',
    isTiered: false,
  },
  {
    id: 'chronotype-trio',
    category: 'exploration',
    nameKey: 'badges.chronotypeTrio.name',
    descriptionKey: 'badges.chronotypeTrio.description',
    hintKey: 'badges.chronotypeTrio.hint',
    icon: 'Sparkles',
    isTiered: false,
  },
];

// ---------------------------------------------------------------------------
// パターン系（3個）
// ---------------------------------------------------------------------------

const PATTERN_BADGES: BadgeDefinition[] = [
  {
    id: 'early-bird',
    category: 'pattern',
    nameKey: 'badges.earlyBird.name',
    descriptionKey: 'badges.earlyBird.description',
    icon: 'Sunrise',
    isTiered: false,
  },
  {
    id: 'full-week',
    category: 'pattern',
    nameKey: 'badges.fullWeek.name',
    descriptionKey: 'badges.fullWeek.description',
    icon: 'Calendar',
    isTiered: false,
  },
  {
    id: 'weekly-champion',
    category: 'pattern',
    nameKey: 'badges.weeklyChampion.name',
    descriptionKey: 'badges.weeklyChampion.description',
    icon: 'Trophy',
    isTiered: false,
  },
];

// ---------------------------------------------------------------------------
// ロイヤルティ系（3個）
// ---------------------------------------------------------------------------

const LOYALTY_BADGES: BadgeDefinition[] = [
  {
    id: 'pro-signup',
    category: 'loyalty',
    nameKey: 'badges.proSignup.name',
    descriptionKey: 'badges.proSignup.description',
    icon: 'Heart',
    isTiered: false,
  },
  {
    id: 'six-months',
    category: 'loyalty',
    nameKey: 'badges.sixMonths.name',
    descriptionKey: 'badges.sixMonths.description',
    icon: 'Calendar',
    isTiered: false,
  },
  {
    id: 'one-year',
    category: 'loyalty',
    nameKey: 'badges.oneYear.name',
    descriptionKey: 'badges.oneYear.description',
    icon: 'Medal',
    isTiered: false,
  },
];

// ---------------------------------------------------------------------------
// 全バッジ定義
// ---------------------------------------------------------------------------

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  ...GROWTH_BADGES,
  ...EXPLORATION_BADGES,
  ...PATTERN_BADGES,
  ...LOYALTY_BADGES,
];

export const BADGE_MAP = new Map(BADGE_DEFINITIONS.map((badge) => [badge.id, badge]));

export const BADGE_COUNT = BADGE_DEFINITIONS.length;

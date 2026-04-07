/**
 * バッジ定義 — 全20個
 *
 * カテゴリ:
 * - growth: 段階成長型（ブロンズ→シルバー→ゴールド）
 * - exploration: 機能発見のガイド役
 * - pattern: 時間帯・行動パターン系
 * - loyalty: Pro・ロイヤルティ系
 */

import type { BadgeDefinition } from '../types/badge.types';

// ---------------------------------------------------------------------------
// 段階成長型（2個）
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
      { rank: 'bronze', value: 3 },
      { rank: 'bronze', value: 7 },
      { rank: 'silver', value: 14 },
      { rank: 'gold', value: 30 },
      { rank: 'gold', value: 90 },
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
      { rank: 'bronze', value: 1 },
      { rank: 'bronze', value: 100 },
      { rank: 'silver', value: 500 },
      { rank: 'gold', value: 1000 },
    ],
  },
];

// ---------------------------------------------------------------------------
// 探索系（6個）
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
    id: 'palette-first',
    category: 'exploration',
    nameKey: 'badges.paletteFirst.name',
    descriptionKey: 'badges.paletteFirst.description',
    icon: 'Palette',
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
    link: '/settings/chronotype',
  },
  {
    id: 'full-day',
    category: 'exploration',
    nameKey: 'badges.fullDay.name',
    descriptionKey: 'badges.fullDay.description',
    hintKey: 'badges.fullDay.hint',
    icon: 'BarChart3',
    isTiered: false,
    link: '/palette',
  },
  {
    id: 'template-first',
    category: 'exploration',
    nameKey: 'badges.templateFirst.name',
    descriptionKey: 'badges.templateFirst.description',
    hintKey: 'badges.templateFirst.hint',
    icon: 'Target',
    isTiered: false,
    link: '/templates',
  },
  {
    id: 'export-first',
    category: 'exploration',
    nameKey: 'badges.exportFirst.name',
    descriptionKey: 'badges.exportFirst.description',
    hintKey: 'badges.exportFirst.hint',
    icon: 'BarChart3',
    isTiered: false,
    link: '/settings/export',
  },
];

// ---------------------------------------------------------------------------
// パターン系（8個）
// ---------------------------------------------------------------------------

const PATTERN_BADGES: BadgeDefinition[] = [
  {
    id: 'early-bird',
    category: 'pattern',
    nameKey: 'badges.earlyBird.name',
    descriptionKey: 'badges.earlyBird.description',
    icon: 'Clock',
    isTiered: false,
  },
  {
    id: 'night-owl',
    category: 'pattern',
    nameKey: 'badges.nightOwl.name',
    descriptionKey: 'badges.nightOwl.description',
    icon: 'Clock',
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
    id: 'deep-full',
    category: 'pattern',
    nameKey: 'badges.deepFull.name',
    descriptionKey: 'badges.deepFull.description',
    icon: 'Zap',
    isTiered: false,
  },
  {
    id: 'tag-streak',
    category: 'pattern',
    nameKey: 'badges.tagStreak.name',
    descriptionKey: 'badges.tagStreak.description',
    icon: 'Star',
    isTiered: false,
  },
  {
    id: 'tag-100h',
    category: 'pattern',
    nameKey: 'badges.tag100h.name',
    descriptionKey: 'badges.tag100h.description',
    hintKey: 'badges.tag100h.hint',
    icon: 'Crown',
    isTiered: false,
    link: '/stats/review',
  },
  {
    id: 'monday-5',
    category: 'pattern',
    nameKey: 'badges.monday5.name',
    descriptionKey: 'badges.monday5.description',
    icon: 'Calendar',
    isTiered: false,
  },
  {
    id: 'day-coverage',
    category: 'pattern',
    nameKey: 'badges.dayCoverage.name',
    descriptionKey: 'badges.dayCoverage.description',
    icon: 'Target',
    isTiered: false,
  },
];

// ---------------------------------------------------------------------------
// ロイヤルティ系（4個）
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
    id: 'weekly-report',
    category: 'loyalty',
    nameKey: 'badges.weeklyReport.name',
    descriptionKey: 'badges.weeklyReport.description',
    icon: 'Mail',
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
    icon: 'Crown',
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

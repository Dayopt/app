/**
 * BadgesService unit tests
 *
 * computeValue は全 14 badge 種の判定ロジックの中枢であり、ずれるとユーザーの
 * engagement 体験（copywriting.md の「14 日連続を達成しました」等）を直接壊す。
 * private method だが、public `evaluateWithProgress` 経由だと Supabase モックが
 * 膨大になるため、type-peeled な直接呼び出しで各 badge 種をユニット covers。
 *
 * isAlreadyEarned / getNextThreshold はバッジ昇格ロジック（bronze → silver →
 * gold）の核。ずれると「同じバッジを何度も獲得する」か「次の目標が表示されない」
 * 致命的バグに直結する。
 */

import { describe, expect, it } from 'vitest';

import { BADGE_DEFINITIONS } from '../../constants/badge-definitions';
import type { BadgeDefinition, BadgeRank } from '../../types/badge.types';
import { BadgesService } from '../badges-service';

interface BadgeSourceDataShape {
  streak: number;
  entryCount: number;
  distinctTagCount: number;
  chronotypeEnabled: boolean;
  entriesWithTime: number;
  hasFullDay: boolean;
  hasEarlyBird: boolean;
  hasDeepZoneEntry: boolean;
  fullWeekDays: number;
  maxTagMinutes: number;
  hasGroupTag: boolean;
  chronotypeZoneCount: number;
  isWeeklyBest: boolean;
  isProSubscriber: boolean;
  accountAgeDays: number;
}

interface EarnedRecord {
  badge_id: string;
  rank: string | null;
}

/** private method 群にアクセスするための型窓口 */
interface BadgesServiceInternals {
  computeValue(badge: BadgeDefinition, source: BadgeSourceDataShape): number;
  isAlreadyEarned(earned: EarnedRecord[], badgeId: string, rank: BadgeRank | null): boolean;
  getNextThreshold(
    badge: BadgeDefinition,
    earned: EarnedRecord[],
  ): { rank: BadgeRank; value: number } | null;
}

function createService(): BadgesServiceInternals {
  // supabase は本 test で呼ばないため null を通す（型のみ充足）
  const service = new BadgesService(null as never);
  return service as unknown as BadgesServiceInternals;
}

function baseSource(overrides: Partial<BadgeSourceDataShape> = {}): BadgeSourceDataShape {
  return {
    streak: 0,
    entryCount: 0,
    distinctTagCount: 0,
    chronotypeEnabled: false,
    entriesWithTime: 0,
    hasFullDay: false,
    hasEarlyBird: false,
    hasDeepZoneEntry: false,
    fullWeekDays: 0,
    maxTagMinutes: 0,
    hasGroupTag: false,
    chronotypeZoneCount: 0,
    isWeeklyBest: false,
    isProSubscriber: false,
    accountAgeDays: 0,
    ...overrides,
  };
}

function findBadge(id: string): BadgeDefinition {
  const badge = BADGE_DEFINITIONS.find((b) => b.id === id);
  if (!badge) throw new Error(`badge ${id} not defined`);
  return badge;
}

describe('BadgesService.computeValue', () => {
  const service = createService();

  it('streak: streak 日数を返す', () => {
    expect(service.computeValue(findBadge('streak'), baseSource({ streak: 14 }))).toBe(14);
  });

  it('blocks: entryCount を返す', () => {
    expect(service.computeValue(findBadge('blocks'), baseSource({ entryCount: 250 }))).toBe(250);
  });

  it('tag-hours: maxTagMinutes を返す', () => {
    expect(service.computeValue(findBadge('tag-hours'), baseSource({ maxTagMinutes: 4500 }))).toBe(
      4500,
    );
  });

  it('tags-5: distinctTagCount を返す', () => {
    expect(service.computeValue(findBadge('tags-5'), baseSource({ distinctTagCount: 3 }))).toBe(3);
  });

  it('deep-zone: hasDeepZoneEntry を 0/1 に変換', () => {
    expect(
      service.computeValue(findBadge('deep-zone'), baseSource({ hasDeepZoneEntry: true })),
    ).toBe(1);
    expect(
      service.computeValue(findBadge('deep-zone'), baseSource({ hasDeepZoneEntry: false })),
    ).toBe(0);
  });

  it('full-day: hasFullDay を 0/1 に変換', () => {
    expect(service.computeValue(findBadge('full-day'), baseSource({ hasFullDay: true }))).toBe(1);
    expect(service.computeValue(findBadge('full-day'), baseSource({ hasFullDay: false }))).toBe(0);
  });

  it('group-first: hasGroupTag を 0/1 に変換', () => {
    expect(service.computeValue(findBadge('group-first'), baseSource({ hasGroupTag: true }))).toBe(
      1,
    );
  });

  it('chronotype-trio: chronotypeZoneCount を返す', () => {
    expect(
      service.computeValue(findBadge('chronotype-trio'), baseSource({ chronotypeZoneCount: 2 })),
    ).toBe(2);
  });

  it('early-bird: hasEarlyBird を 0/1 に変換', () => {
    expect(service.computeValue(findBadge('early-bird'), baseSource({ hasEarlyBird: true }))).toBe(
      1,
    );
  });

  it('full-week: fullWeekDays を返す', () => {
    expect(service.computeValue(findBadge('full-week'), baseSource({ fullWeekDays: 5 }))).toBe(5);
  });

  it('weekly-champion: isWeeklyBest を 0/1 に変換', () => {
    expect(
      service.computeValue(findBadge('weekly-champion'), baseSource({ isWeeklyBest: true })),
    ).toBe(1);
  });

  it('pro-signup: isProSubscriber を 0/1 に変換', () => {
    expect(
      service.computeValue(findBadge('pro-signup'), baseSource({ isProSubscriber: true })),
    ).toBe(1);
    expect(
      service.computeValue(findBadge('pro-signup'), baseSource({ isProSubscriber: false })),
    ).toBe(0);
  });

  it('six-months: accountAgeDays が 180 以上で 1', () => {
    expect(service.computeValue(findBadge('six-months'), baseSource({ accountAgeDays: 179 }))).toBe(
      0,
    );
    expect(service.computeValue(findBadge('six-months'), baseSource({ accountAgeDays: 180 }))).toBe(
      1,
    );
    expect(service.computeValue(findBadge('six-months'), baseSource({ accountAgeDays: 500 }))).toBe(
      1,
    );
  });

  it('one-year: accountAgeDays が 365 以上で 1', () => {
    expect(service.computeValue(findBadge('one-year'), baseSource({ accountAgeDays: 364 }))).toBe(
      0,
    );
    expect(service.computeValue(findBadge('one-year'), baseSource({ accountAgeDays: 365 }))).toBe(
      1,
    );
  });

  it('unknown badge id: 0 を返す（安全な default）', () => {
    const fake: BadgeDefinition = {
      id: 'not-a-real-badge',
      category: 'exploration',
      nameKey: 'x',
      descriptionKey: 'x',
      icon: 'Trophy',
      isTiered: false,
    };
    expect(service.computeValue(fake, baseSource())).toBe(0);
  });
});

describe('BadgesService.isAlreadyEarned', () => {
  const service = createService();

  it('同 badge_id + 同 rank のレコードがあれば true', () => {
    const earned: EarnedRecord[] = [{ badge_id: 'streak', rank: 'bronze' }];
    expect(service.isAlreadyEarned(earned, 'streak', 'bronze')).toBe(true);
  });

  it('rank 違いは false', () => {
    const earned: EarnedRecord[] = [{ badge_id: 'streak', rank: 'bronze' }];
    expect(service.isAlreadyEarned(earned, 'streak', 'silver')).toBe(false);
  });

  it('badge_id 違いは false', () => {
    const earned: EarnedRecord[] = [{ badge_id: 'streak', rank: 'bronze' }];
    expect(service.isAlreadyEarned(earned, 'blocks', 'bronze')).toBe(false);
  });

  it('non-tiered（rank=null）同士も一致する', () => {
    const earned: EarnedRecord[] = [{ badge_id: 'tags-5', rank: null }];
    expect(service.isAlreadyEarned(earned, 'tags-5', null)).toBe(true);
  });

  it('空配列では常に false', () => {
    expect(service.isAlreadyEarned([], 'streak', 'bronze')).toBe(false);
  });
});

describe('BadgesService.getNextThreshold', () => {
  const service = createService();
  const streakBadge = findBadge('streak');

  it('何も獲得していなければ最初の threshold（bronze）を返す', () => {
    const next = service.getNextThreshold(streakBadge, []);
    expect(next).toEqual({ rank: 'bronze', value: 7 });
  });

  it('bronze 獲得済みなら silver を返す', () => {
    const next = service.getNextThreshold(streakBadge, [{ badge_id: 'streak', rank: 'bronze' }]);
    expect(next).toEqual({ rank: 'silver', value: 14 });
  });

  it('bronze + silver 獲得済みなら gold を返す', () => {
    const next = service.getNextThreshold(streakBadge, [
      { badge_id: 'streak', rank: 'bronze' },
      { badge_id: 'streak', rank: 'silver' },
    ]);
    expect(next).toEqual({ rank: 'gold', value: 30 });
  });

  it('全 tier 獲得済みなら null を返す', () => {
    const next = service.getNextThreshold(streakBadge, [
      { badge_id: 'streak', rank: 'bronze' },
      { badge_id: 'streak', rank: 'silver' },
      { badge_id: 'streak', rank: 'gold' },
    ]);
    expect(next).toBeNull();
  });

  it('他 badge の獲得履歴は無視する', () => {
    const next = service.getNextThreshold(streakBadge, [
      { badge_id: 'blocks', rank: 'bronze' },
      { badge_id: 'blocks', rank: 'silver' },
    ]);
    expect(next).toEqual({ rank: 'bronze', value: 7 });
  });

  it('thresholds 未定義の badge は null を返す', () => {
    const nonTiered = findBadge('tags-5');
    expect(service.getNextThreshold(nonTiered, [])).toBeNull();
  });
});

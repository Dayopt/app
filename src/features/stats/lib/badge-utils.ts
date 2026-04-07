/**
 * バッジユーティリティ関数
 */

import { BADGE_DEFINITIONS, BADGE_MAP } from '../constants/badge-definitions';
import type {
  BadgeDefinition,
  BadgeProgress,
  BadgeRank,
  BadgeWithStatus,
  UserBadge,
} from '../types/badge.types';

/** 全バッジの表示用データを生成 */
export function buildBadgeStatuses(
  earnedBadges: UserBadge[],
  progressList: BadgeProgress[],
): BadgeWithStatus[] {
  const earnedMap = new Map<string, UserBadge[]>();
  for (const badge of earnedBadges) {
    const key = badge.badgeId;
    if (!earnedMap.has(key)) earnedMap.set(key, []);
    earnedMap.get(key)!.push(badge);
  }

  const progressMap = new Map<string, BadgeProgress>();
  for (const p of progressList) {
    progressMap.set(p.badgeId, p);
  }

  return BADGE_DEFINITIONS.map((def): BadgeWithStatus => {
    const userBadges = earnedMap.get(def.id) ?? [];
    const earned = userBadges.length > 0;
    const currentRank = getHighestRank(userBadges);
    const latestBadge = userBadges[0];
    const progress = progressMap.get(def.id);

    const result: BadgeWithStatus = { definition: def, earned };
    if (latestBadge) result.userBadge = latestBadge;
    if (progress) result.progress = progress;
    if (currentRank) result.currentRank = currentRank;
    return result;
  });
}

/** 獲得数を計算（段階成長型は1つとしてカウント） */
export function countEarnedBadges(earnedBadges: UserBadge[]): number {
  const uniqueIds = new Set(earnedBadges.map((b) => b.badgeId));
  return uniqueIds.size;
}

/** 段階成長型バッジの最高ランクを取得 */
function getHighestRank(badges: UserBadge[]): BadgeRank | undefined {
  const rankOrder: BadgeRank[] = ['bronze', 'silver', 'gold'];
  let highest: BadgeRank | undefined;

  for (const badge of badges) {
    if (!badge.rank) continue;
    const currentIndex = rankOrder.indexOf(badge.rank);
    const highestIndex = highest ? rankOrder.indexOf(highest) : -1;
    if (currentIndex > highestIndex) {
      highest = badge.rank;
    }
  }

  return highest;
}

/** バッジIDから定義を取得 */
export function getBadgeDefinition(badgeId: string): BadgeDefinition | undefined {
  return BADGE_MAP.get(badgeId);
}

/** 進捗率を0-100で計算 */
export function getProgressPercent(progress: BadgeProgress | undefined): number {
  if (!progress || progress.targetValue === 0) return 0;
  return Math.min(100, Math.round((progress.currentValue / progress.targetValue) * 100));
}

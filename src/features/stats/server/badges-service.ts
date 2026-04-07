/**
 * Badges Service
 *
 * バッジ判定・取得のビジネスロジック。
 * Supabaseを直接クエリし、他featureのimportは行わない。
 *
 * パフォーマンス: 全バッジの素材データを一括取得（6クエリ）し、
 * メモリ上で20バッジを判定する。個別クエリのN+1を回避。
 */

import { ServiceError } from '@/platform/trpc/errors';

import { BADGE_DEFINITIONS } from '../constants/badge-definitions';
import type {
  BadgeDefinition,
  BadgeProgress,
  BadgeRank,
  NewlyEarnedBadge,
  UserBadge,
} from '../types/badge.types';
import type { ServiceSupabaseClient } from './badges-types';

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

export class BadgesServiceError extends ServiceError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = 'BadgesServiceError';
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EarnedRecord {
  badge_id: string;
  rank: string | null;
}

/** 一括取得した素材データ */
interface BadgeSourceData {
  streak: number;
  entryCount: number;
  distinctTagCount: number;
  paletteExists: boolean;
  chronotypeEnabled: boolean;
  entriesWithTime: number;
  hasFullDay: boolean;
  hasEarlyBird: boolean;
  hasNightOwl: boolean;
  fullWeekDays: number;
  tagStreakMax: number;
  maxTagMinutes: number;
  mondayWeeks: number;
  maxDayCoverage: number;
  isProSubscriber: boolean;
  accountAgeDays: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class BadgesService {
  constructor(private readonly supabase: ServiceSupabaseClient) {}

  // =========================================================================
  // Public API
  // =========================================================================

  /** ユーザーの獲得済みバッジ一覧 */
  async listUserBadges(userId: string): Promise<UserBadge[]> {
    const { data, error } = await this.supabase
      .from('user_badges')
      .select('id, badge_id, rank, earned_at')
      .eq('user_id', userId)
      .order('earned_at', { ascending: false });

    if (error) {
      throw new BadgesServiceError('FETCH_FAILED', `バッジ取得に失敗: ${error.message}`);
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      badgeId: row.badge_id,
      rank: row.rank as BadgeRank | null,
      earnedAt: row.earned_at,
    }));
  }

  /** バッジ判定を実行し、新規獲得バッジを返却 */
  async evaluate(userId: string): Promise<NewlyEarnedBadge[]> {
    const [earned, source] = await Promise.all([
      this.getEarnedSet(userId),
      this.fetchSourceData(userId),
    ]);

    const newlyEarned: NewlyEarnedBadge[] = [];

    for (const badge of BADGE_DEFINITIONS) {
      const value = this.computeValue(badge, source);

      if (badge.isTiered && badge.thresholds) {
        for (const threshold of badge.thresholds) {
          if (this.isAlreadyEarned(earned, badge.id, threshold.rank)) continue;
          if (value >= threshold.value) {
            const inserted = await this.insertBadge(userId, badge.id, threshold.rank);
            if (inserted) newlyEarned.push({ badgeId: badge.id, rank: threshold.rank });
          }
        }
      } else {
        if (this.isAlreadyEarned(earned, badge.id, null)) continue;
        if (value >= 1) {
          const inserted = await this.insertBadge(userId, badge.id, null);
          if (inserted) newlyEarned.push({ badgeId: badge.id, rank: null });
        }
      }
    }

    return newlyEarned;
  }

  /** 未獲得バッジの進捗データ */
  async getProgress(userId: string): Promise<BadgeProgress[]> {
    const [earned, source] = await Promise.all([
      this.getEarnedSet(userId),
      this.fetchSourceData(userId),
    ]);

    const progressList: BadgeProgress[] = [];

    for (const badge of BADGE_DEFINITIONS) {
      const currentValue = this.computeValue(badge, source);

      if (badge.isTiered && badge.thresholds) {
        const nextThreshold = this.getNextThreshold(badge, earned);
        if (nextThreshold) {
          progressList.push({
            badgeId: badge.id,
            currentValue,
            targetValue: nextThreshold.value,
            rank: nextThreshold.rank,
          });
        }
      } else {
        if (this.isAlreadyEarned(earned, badge.id, null)) continue;
        progressList.push({
          badgeId: badge.id,
          currentValue,
          targetValue: 1,
        });
      }
    }

    return progressList;
  }

  // =========================================================================
  // Internal: Batch data fetch (6 parallel queries)
  // =========================================================================

  private async fetchSourceData(userId: string): Promise<BadgeSourceData> {
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    const [
      entriesResult,
      entryTagsResult,
      paletteResult,
      settingsResult,
      activeDatesResult,
      accountResult,
      profileResult,
    ] = await Promise.all([
      // 1. entries: start_time, end_time, duration_minutes
      this.supabase
        .from('entries')
        .select('start_time, end_time, duration_minutes')
        .eq('user_id', userId),
      // 2. entry_tags: tag_id, created_at + entry duration
      this.supabase
        .from('entries')
        .select('duration_minutes, start_time, entry_tags!inner(tag_id, created_at)')
        .eq('user_id', userId),
      // 3. palette_items: count
      this.supabase
        .from('palette_items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      // 4. user_settings + profile (subscription is on profiles table)
      this.supabase
        .from('user_settings')
        .select('chronotype_enabled')
        .eq('user_id', userId)
        .single(),
      // 5. active_dates RPC
      this.supabase.rpc('get_active_dates', { p_user_id: userId, p_since: since }),
      // 6. account age
      this.supabase.auth.admin.getUserById(userId),
      // 7. profile (subscription_status)
      this.supabase.from('profiles').select('subscription_status').eq('id', userId).single(),
    ]);

    const entries = entriesResult.data ?? [];
    const entryTagRows = entryTagsResult.data ?? [];
    const settings = settingsResult.data;
    const activeDates = activeDatesResult.data ?? [];
    const profile = profileResult.data;

    // --- Streak ---
    const dateSet = new Set(activeDates);
    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      if (dateSet.has(dateStr)) {
        streak++;
      } else {
        break;
      }
    }

    // --- Entries with time ---
    const entriesWithTime = entries.filter((e) => e.start_time).length;

    // --- Per-day aggregations ---
    const dateCount = new Map<string, number>();
    const dayMinutes = new Map<string, number>();
    let hasEarlyBird = false;
    let hasNightOwl = false;
    const recentDaysOfWeek = new Set<number>();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const fiveWeeksAgo = Date.now() - 35 * 24 * 60 * 60 * 1000;
    const mondayWeeks = new Set<string>();

    for (const entry of entries) {
      if (!entry.start_time) continue;
      const date = entry.start_time.slice(0, 10);
      const startMs = new Date(entry.start_time).getTime();
      const hour = new Date(entry.start_time).getUTCHours();

      // Per-day count
      dateCount.set(date, (dateCount.get(date) ?? 0) + 1);

      // Day coverage
      if (entry.end_time) {
        const endMs = new Date(entry.end_time).getTime();
        const minutes = (endMs - startMs) / 60000;
        dayMinutes.set(date, (dayMinutes.get(date) ?? 0) + minutes);
      }

      // Time-of-day
      if (hour < 7) hasEarlyBird = true;
      if (hour >= 23) hasNightOwl = true;

      // Full week (last 7 days)
      if (startMs >= oneWeekAgo) {
        recentDaysOfWeek.add(new Date(entry.start_time).getDay());
      }

      // Monday streak (last 5 weeks)
      if (startMs >= fiveWeeksAgo && new Date(entry.start_time).getDay() === 1) {
        const d = new Date(entry.start_time);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        mondayWeeks.add(weekStart.toISOString().slice(0, 10));
      }
    }

    const hasFullDay = [...dateCount.values()].some((c) => c >= 8);
    // 16h * 60 * 0.8 = 768
    const maxDayCoverage = Math.max(0, ...[...dayMinutes.values()]);

    // --- Tag aggregations ---
    const tagIds = new Set<string>();
    const tagDates = new Map<string, Set<string>>();
    const tagMinutes = new Map<string, number>();

    for (const entry of entryTagRows) {
      const tags = entry.entry_tags as unknown as Array<{
        tag_id: string;
        created_at: string | null;
      }>;
      for (const tag of tags) {
        tagIds.add(tag.tag_id);

        // Tag streak
        const tagDate = tag.created_at?.slice(0, 10);
        if (tagDate) {
          if (!tagDates.has(tag.tag_id)) tagDates.set(tag.tag_id, new Set());
          tagDates.get(tag.tag_id)!.add(tagDate);
        }

        // Tag hours
        const minutes = entry.duration_minutes ?? 0;
        tagMinutes.set(tag.tag_id, (tagMinutes.get(tag.tag_id) ?? 0) + minutes);
      }
    }

    // Max consecutive days for any tag
    let tagStreakMax = 0;
    for (const dates of tagDates.values()) {
      const sorted = [...dates].sort();
      let current = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]!).getTime();
        const curr = new Date(sorted[i]!).getTime();
        if (curr - prev === 24 * 60 * 60 * 1000) {
          current++;
          tagStreakMax = Math.max(tagStreakMax, current);
        } else {
          current = 1;
        }
      }
      tagStreakMax = Math.max(tagStreakMax, current);
    }

    const maxTagMinutes = Math.max(0, ...[...tagMinutes.values()]);

    // --- Account age ---
    const createdAt = accountResult.data?.user?.created_at;
    const accountAgeDays = createdAt
      ? (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)
      : 0;

    // --- Settings & Profile ---
    const chronotypeEnabled = settings?.chronotype_enabled ?? false;
    const subscriptionStatus = profile?.subscription_status;
    const isProSubscriber = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

    return {
      streak,
      entryCount: entries.length,
      distinctTagCount: tagIds.size,
      paletteExists: (paletteResult.count ?? 0) > 0,
      chronotypeEnabled,
      entriesWithTime,
      hasFullDay,
      hasEarlyBird,
      hasNightOwl,
      fullWeekDays: recentDaysOfWeek.size,
      tagStreakMax,
      maxTagMinutes,
      mondayWeeks: mondayWeeks.size,
      maxDayCoverage,
      isProSubscriber,
      accountAgeDays,
    };
  }

  // =========================================================================
  // Internal: Compute value from source data
  // =========================================================================

  private computeValue(badge: BadgeDefinition, source: BadgeSourceData): number {
    switch (badge.id) {
      case 'streak':
        return source.streak;
      case 'blocks':
        return source.entryCount;
      case 'tags-5':
        return source.distinctTagCount;
      case 'palette-first':
        return source.paletteExists ? 1 : 0;
      case 'deep-zone':
        return source.chronotypeEnabled && source.entriesWithTime > 0 ? 1 : 0;
      case 'full-day':
        return source.hasFullDay ? 1 : 0;
      case 'template-first':
        return 0; // 未実装
      case 'export-first':
        return 0; // 未実装
      case 'early-bird':
        return source.hasEarlyBird ? 1 : 0;
      case 'night-owl':
        return source.hasNightOwl ? 1 : 0;
      case 'full-week':
        return source.fullWeekDays >= 7 ? 1 : 0;
      case 'deep-full':
        return source.chronotypeEnabled && source.entriesWithTime >= 20 ? 1 : 0;
      case 'tag-streak':
        return source.tagStreakMax >= 7 ? 1 : 0;
      case 'tag-100h':
        return source.maxTagMinutes >= 6000 ? 1 : 0; // 100h = 6000min
      case 'monday-5':
        return source.mondayWeeks >= 5 ? 1 : 0;
      case 'day-coverage':
        return source.maxDayCoverage >= 768 ? 1 : 0; // 16h * 80%
      case 'pro-signup':
        return source.isProSubscriber ? 1 : 0;
      case 'weekly-report':
        return 0; // 未実装
      case 'six-months':
        return source.accountAgeDays >= 180 ? 1 : 0;
      case 'one-year':
        return source.accountAgeDays >= 365 ? 1 : 0;
      default:
        return 0;
    }
  }

  // =========================================================================
  // Internal: Helpers
  // =========================================================================

  private async getEarnedSet(userId: string): Promise<EarnedRecord[]> {
    const { data, error } = await this.supabase
      .from('user_badges')
      .select('badge_id, rank')
      .eq('user_id', userId);

    if (error) return [];
    return (data ?? []).map((row) => ({
      badge_id: row.badge_id,
      rank: row.rank,
    }));
  }

  private isAlreadyEarned(
    earned: EarnedRecord[],
    badgeId: string,
    rank: BadgeRank | null,
  ): boolean {
    return earned.some((e) => e.badge_id === badgeId && e.rank === (rank ?? null));
  }

  private getNextThreshold(
    badge: BadgeDefinition,
    earned: EarnedRecord[],
  ): { rank: BadgeRank; value: number } | null {
    for (const threshold of badge.thresholds ?? []) {
      if (!this.isAlreadyEarned(earned, badge.id, threshold.rank)) {
        return threshold;
      }
    }
    return null;
  }

  private async insertBadge(
    userId: string,
    badgeId: string,
    rank: BadgeRank | null,
  ): Promise<boolean> {
    const { error } = await this.supabase.from('user_badges').insert({
      user_id: userId,
      badge_id: badgeId,
      rank,
    });

    // UNIQUE制約違反は重複として無視
    if (error?.code === '23505') return false;
    if (error) return false;
    return true;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBadgesService(supabase: ServiceSupabaseClient): BadgesService {
  return new BadgesService(supabase);
}

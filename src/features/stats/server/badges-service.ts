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
  fullWeekDays: number;
  maxTagMinutes: number;
  hasGroupTag: boolean;
  chronotypeZoneCount: number;
  isWeeklyBest: boolean;
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

    // 獲得候補を収集
    const candidates: { badgeId: string; rank: BadgeRank | null }[] = [];

    for (const badge of BADGE_DEFINITIONS) {
      const value = this.computeValue(badge, source);

      if (badge.isTiered && badge.thresholds) {
        for (const threshold of badge.thresholds) {
          if (this.isAlreadyEarned(earned, badge.id, threshold.rank)) continue;
          if (value >= threshold.value) {
            candidates.push({ badgeId: badge.id, rank: threshold.rank });
          }
        }
      } else {
        if (this.isAlreadyEarned(earned, badge.id, null)) continue;
        if (value >= 1) {
          candidates.push({ badgeId: badge.id, rank: null });
        }
      }
    }

    // 並列INSERT（UNIQUE制約で重複は自動スキップ）
    const results = await Promise.all(
      candidates.map(async (c) => {
        const inserted = await this.insertBadge(userId, c.badgeId, c.rank);
        return inserted ? c : null;
      }),
    );

    return results.filter((r): r is NewlyEarnedBadge => r !== null);
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
        // 段階成長型: 次の目標があればそれを、なければ最終段階を返す（常にプログレスバー表示）
        const nextThreshold = this.getNextThreshold(badge, earned);
        const lastThreshold = badge.thresholds[badge.thresholds.length - 1]!;
        const target = nextThreshold ?? lastThreshold;
        progressList.push({
          badgeId: badge.id,
          currentValue,
          targetValue: target.value,
          rank: target.rank,
        });
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
      profileResult,
      tagsResult,
    ] = await Promise.all([
      // 1. entries
      this.supabase
        .from('entries')
        .select('start_time, end_time, duration_minutes')
        .eq('user_id', userId),
      // 2. entry_tags + entry duration
      this.supabase
        .from('entries')
        .select('duration_minutes, start_time, entry_tags!inner(tag_id, created_at)')
        .eq('user_id', userId),
      // 3. palette_items count
      this.supabase
        .from('palette_items')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId),
      // 4. user_settings
      this.supabase
        .from('user_settings')
        .select('chronotype_enabled')
        .eq('user_id', userId)
        .single(),
      // 5. active_dates RPC
      this.supabase.rpc('get_active_dates', { p_user_id: userId, p_since: since }),
      // 6. profile
      this.supabase
        .from('profiles')
        .select('subscription_status, created_at')
        .eq('id', userId)
        .single(),
      // 7. tags (for group detection via colon syntax)
      this.supabase.from('tags').select('name').eq('user_id', userId),
    ]);

    const entries = entriesResult.data ?? [];
    const entryTagRows = entryTagsResult.data ?? [];
    const settings = settingsResult.data;
    const activeDates = activeDatesResult.data ?? [];
    const profile = profileResult.data;
    const tags = tagsResult.data ?? [];

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
    let hasEarlyBird = false;
    const recentDaysOfWeek = new Set<number>();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // --- Weekly hours for self-best detection ---
    const weekMinutes = new Map<string, number>();

    for (const entry of entries) {
      if (!entry.start_time) continue;
      const date = entry.start_time.slice(0, 10);
      const startMs = new Date(entry.start_time).getTime();
      const hour = new Date(entry.start_time).getUTCHours();

      dateCount.set(date, (dateCount.get(date) ?? 0) + 1);

      if (hour < 7) hasEarlyBird = true;

      if (startMs >= oneWeekAgo) {
        recentDaysOfWeek.add(new Date(entry.start_time).getDay());
      }

      // Weekly minutes (ISO week key)
      if (entry.duration_minutes) {
        const d = new Date(entry.start_time);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const weekKey = weekStart.toISOString().slice(0, 10);
        weekMinutes.set(weekKey, (weekMinutes.get(weekKey) ?? 0) + entry.duration_minutes);
      }
    }

    const hasFullDay = [...dateCount.values()].some((c) => c >= 8);

    // --- Weekly champion: current week is personal best ---
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(today.getDate() - today.getDay());
    const thisWeekKey = thisWeekStart.toISOString().slice(0, 10);
    const thisWeekMinutes = weekMinutes.get(thisWeekKey) ?? 0;
    let isWeeklyBest = false;
    if (thisWeekMinutes > 0 && weekMinutes.size > 1) {
      const otherWeeks = [...weekMinutes.entries()].filter(([k]) => k !== thisWeekKey);
      const maxOther = Math.max(0, ...otherWeeks.map(([, v]) => v));
      isWeeklyBest = thisWeekMinutes > maxOther;
    }

    // --- Tag aggregations ---
    const tagIds = new Set<string>();
    const tagMinutes = new Map<string, number>();

    for (const entry of entryTagRows) {
      const entryTags = entry.entry_tags as unknown as Array<{
        tag_id: string;
        created_at: string | null;
      }>;
      for (const tag of entryTags) {
        tagIds.add(tag.tag_id);
        const minutes = entry.duration_minutes ?? 0;
        tagMinutes.set(tag.tag_id, (tagMinutes.get(tag.tag_id) ?? 0) + minutes);
      }
    }

    const maxTagMinutes = Math.max(0, ...[...tagMinutes.values()]);

    // --- Group tag (colon syntax: "group:name") ---
    const hasGroupTag = tags.some((t) => t.name.includes(':'));

    // --- Chronotype zones used (Deep/Ease/Neutral) ---
    // 簡易判定: chronotype有効 + エントリの時間帯分布から3ゾーン判定
    // TODO: 厳密にはuser_settingsのchronotype_custom_zonesを参照すべき
    let chronotypeZoneCount = 0;
    if (settings?.chronotype_enabled && entriesWithTime > 0) {
      const hours = entries
        .filter((e) => e.start_time)
        .map((e) => new Date(e.start_time!).getUTCHours());
      const hasMorning = hours.some((h) => h >= 6 && h < 12);
      const hasAfternoon = hours.some((h) => h >= 12 && h < 18);
      const hasEvening = hours.some((h) => h >= 18 || h < 6);
      chronotypeZoneCount = [hasMorning, hasAfternoon, hasEvening].filter(Boolean).length;
    }

    // --- Account age ---
    const createdAt = profile?.created_at;
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
      fullWeekDays: recentDaysOfWeek.size,
      maxTagMinutes,
      hasGroupTag,
      chronotypeZoneCount,
      isWeeklyBest,
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
      case 'tag-hours':
        return source.maxTagMinutes; // 段階: 3000(50h) → 6000(100h) → 12000(200h)
      case 'tags-5':
        return source.distinctTagCount >= 5 ? 1 : 0;
      case 'palette-first':
        return source.paletteExists ? 1 : 0;
      case 'deep-zone':
        return source.chronotypeEnabled && source.entriesWithTime > 0 ? 1 : 0;
      case 'full-day':
        return source.hasFullDay ? 1 : 0;
      case 'group-first':
        return source.hasGroupTag ? 1 : 0;
      case 'chronotype-trio':
        return source.chronotypeZoneCount >= 3 ? 1 : 0;
      case 'early-bird':
        return source.hasEarlyBird ? 1 : 0;
      case 'full-week':
        return source.fullWeekDays >= 7 ? 1 : 0;
      case 'weekly-champion':
        return source.isWeeklyBest ? 1 : 0;
      case 'pro-signup':
        return source.isProSubscriber ? 1 : 0;
      case 'weekly-report':
        return 0; // AI weekly report送信ロジック実装後に判定追加
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

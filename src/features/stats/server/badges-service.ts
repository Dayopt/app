/**
 * Badges Service
 *
 * バッジ判定・取得のビジネスロジック。
 * Supabaseを直接クエリし、chronotype(Layer 0)のbarrelのみimport。
 *
 * パフォーマンス: 全バッジの素材データを一括取得（6クエリ）し、
 * メモリ上でバッジを判定する。個別クエリのN+1を回避。
 */

import { format, startOfWeek } from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';

import { getChronotypeProfile } from '@/features/chronotype';
import { logger } from '@/lib/logger';
import { ServiceError } from '@/lib/trpc/errors';
import type { ChronotypeType, ProductivityLevel, ProductivityZone } from '@/lib/types/chronotype';

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
// Constants
// ---------------------------------------------------------------------------

/** 非tieredバッジの目標値（指定なしは 1） */
const NON_TIERED_TARGETS: Partial<Record<string, number>> = {
  'tags-5': 5,
  'chronotype-trio': 3,
  'full-week': 7,
};

/** 5段階の生産性レベルを3ティアに集約 */
const TIER_MAP: Record<ProductivityLevel, 'high' | 'mid' | 'low'> = {
  warmup: 'high',
  deep: 'high',
  ease: 'mid',
  recovery: 'low',
  winddown: 'low',
};

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

// ---------------------------------------------------------------------------
// Helpers (pure functions)
// ---------------------------------------------------------------------------

/** user_settings からクロノタイプゾーンを解決する */
function resolveZones(
  settings: {
    chronotype_settings: unknown;
  } | null,
): ProductivityZone[] {
  const cs = settings?.chronotype_settings as { type: string } | null;
  if (!cs) return [];
  const type = cs.type as ChronotypeType;
  return getChronotypeProfile(type).productivityZones;
}

/** early-bird 閾値: 最初の deep zone 開始時刻（なければ7時） */
function getEarlyBirdThreshold(zones: ProductivityZone[]): number {
  const deepZones = zones.filter((z) => z.level === 'deep');
  if (deepZones.length === 0) return 7;
  return Math.min(...deepZones.map((z) => z.startHour));
}

/** エントリの時間帯がカバーする3ティア数を返す（0-3） */
function computeChronotypeZoneCount(
  entries: Array<{ start_time: string | null }>,
  zones: ProductivityZone[],
  timezone: string,
): number {
  if (zones.length === 0) return 0;
  const tiersHit = new Set<'high' | 'mid' | 'low'>();
  for (const entry of entries) {
    if (!entry.start_time) continue;
    const h = parseInt(formatInTimeZone(new Date(entry.start_time), timezone, 'HH'), 10);
    const zone = zones.find((z) =>
      z.startHour <= z.endHour
        ? h >= z.startHour && h < z.endHour
        : h >= z.startHour || h < z.endHour,
    );
    if (zone) tiersHit.add(TIER_MAP[zone.level]);
  }
  return tiersHit.size;
}

/** deep レベルのゾーン内にエントリがあるか */
function hasAnyDeepZoneEntry(
  entries: Array<{ start_time: string | null }>,
  zones: ProductivityZone[],
  timezone: string,
): boolean {
  const deepZones = zones.filter((z) => z.level === 'deep');
  if (deepZones.length === 0) return false;
  return entries.some((entry) => {
    if (!entry.start_time) return false;
    const h = parseInt(formatInTimeZone(new Date(entry.start_time), timezone, 'HH'), 10);
    return deepZones.some((z) =>
      z.startHour <= z.endHour
        ? h >= z.startHour && h < z.endHour
        : h >= z.startHour || h < z.endHour,
    );
  });
}

/** ユーザーTZ基準の今週（カレンダー週）7日間の日付文字列 */
function getCurrentWeekDateStrings(timezone: string, weekStartsOn: 0 | 1 | 6): string[] {
  const zonedNow = toZonedTime(new Date(), timezone);
  const ws = startOfWeek(zonedNow, { weekStartsOn });
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(format(d, 'yyyy-MM-dd'));
  }
  return dates;
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
    const { newlyEarned } = await this.evaluateWithProgress(userId);
    return newlyEarned;
  }

  /** 未獲得バッジの進捗データ */
  async getProgress(userId: string): Promise<BadgeProgress[]> {
    const { progress } = await this.evaluateWithProgress(userId);
    return progress;
  }

  /**
   * バッジ判定 + 進捗データを一括取得
   *
   * fetchSourceData / getEarnedSet を1回だけ呼び、
   * 判定（INSERT）と進捗計算を同時に行う。
   */
  async evaluateWithProgress(
    userId: string,
  ): Promise<{ newlyEarned: NewlyEarnedBadge[]; progress: BadgeProgress[] }> {
    const [earned, source] = await Promise.all([
      this.getEarnedSet(userId),
      this.fetchSourceData(userId),
    ]);

    // --- 判定: 獲得候補を収集 ---
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
        const target = NON_TIERED_TARGETS[badge.id] ?? 1;
        if (value >= target) {
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

    const newlyEarned = results.filter((r): r is NewlyEarnedBadge => r !== null);

    // --- 進捗: INSERT後の earned を反映 ---
    const updatedEarned = [
      ...earned,
      ...newlyEarned.map((n) => ({ badge_id: n.badgeId, rank: n.rank })),
    ];
    const progressList: BadgeProgress[] = [];

    for (const badge of BADGE_DEFINITIONS) {
      const currentValue = this.computeValue(badge, source);

      if (badge.isTiered && badge.thresholds) {
        const nextThreshold = this.getNextThreshold(badge, updatedEarned);
        const lastThreshold = badge.thresholds[badge.thresholds.length - 1]!;
        const target = nextThreshold ?? lastThreshold;
        progressList.push({
          badgeId: badge.id,
          currentValue,
          targetValue: target.value,
          rank: target.rank,
        });
      } else {
        if (this.isAlreadyEarned(updatedEarned, badge.id, null)) continue;
        progressList.push({
          badgeId: badge.id,
          currentValue,
          targetValue: NON_TIERED_TARGETS[badge.id] ?? 1,
        });
      }
    }

    return { newlyEarned, progress: progressList };
  }

  // =========================================================================
  // Internal: Batch data fetch (6 parallel queries)
  // =========================================================================

  private async fetchSourceData(userId: string): Promise<BadgeSourceData> {
    const sinceDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const sinceDateStr = formatInTimeZone(sinceDate, 'UTC', 'yyyy-MM-dd');

    const [
      entriesResult,
      entryTagsResult,
      settingsResult,
      activeDatesResult,
      profileResult,
      tagsResult,
    ] = await Promise.all([
      // 1. entries（ソフト削除を除外）
      this.supabase
        .from('entries')
        .select('start_time, end_time, duration_minutes')
        .eq('user_id', userId)
        .is('deleted_at', null),
      // 2. entries with tag（ソフト削除を除外）
      this.supabase
        .from('entries')
        .select('tag_id, duration_minutes, start_time, created_at')
        .eq('user_id', userId)
        .is('deleted_at', null)
        .not('tag_id', 'is', null),
      // 3. user_settings (TZ・chronotype情報を含む)
      this.supabase
        .from('user_settings')
        .select('chronotype_settings, timezone, week_starts_on')
        .eq('user_id', userId)
        .single(),
      // 5. active_dates RPC (p_start_date: DATE string)
      this.supabase.rpc('get_active_dates', { p_user_id: userId, p_start_date: sinceDateStr }),
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
    const profile = profileResult.data;
    const tags = tagsResult.data ?? [];

    // --- Active dates (with error logging) ---
    if (activeDatesResult.error) {
      logger.warn('badges: get_active_dates failed', { error: activeDatesResult.error });
    }
    const activeDates = activeDatesResult.data ?? [];

    // --- User timezone & chronotype zones ---
    const timezone = settings?.timezone ?? 'UTC';
    const weekStartsOn = ([0, 1, 6] as const).includes(settings?.week_starts_on as 0 | 1 | 6)
      ? (settings!.week_starts_on as 0 | 1 | 6)
      : 1;
    const zones = resolveZones(settings);

    // --- Streak ---
    const dateSet = new Set(activeDates);
    let streak = 0;
    const todayStr = formatInTimeZone(new Date(), timezone, 'yyyy-MM-dd');
    const todayMs = new Date(todayStr).getTime();
    for (let i = 0; i < 365; i++) {
      const dateStr = formatInTimeZone(
        new Date(todayMs - i * 24 * 60 * 60 * 1000),
        'UTC',
        'yyyy-MM-dd',
      );
      if (dateSet.has(dateStr)) {
        streak++;
      } else {
        break;
      }
    }

    // --- Full-week: カレンダー週ベース（ユーザーTZ） ---
    const currentWeekDates = getCurrentWeekDateStrings(timezone, weekStartsOn);
    const fullWeekDays = currentWeekDates.filter((d) => dateSet.has(d)).length;

    // --- Entries with time ---
    const entriesWithTime = entries.filter((e) => e.start_time).length;

    // --- Per-day aggregations ---
    const dateCount = new Map<string, number>();
    let hasEarlyBird = false;
    const earlyBirdThreshold = getEarlyBirdThreshold(zones);

    // --- Weekly hours for self-best detection ---
    const weekMinutes = new Map<string, number>();

    for (const entry of entries) {
      if (!entry.start_time) continue;
      const date = entry.start_time.slice(0, 10);
      const hour = parseInt(formatInTimeZone(new Date(entry.start_time), timezone, 'HH'), 10);

      dateCount.set(date, (dateCount.get(date) ?? 0) + 1);

      // ユーザーTZで判定: custom_zones の最初の deep zone 開始前
      if (hour < earlyBirdThreshold) hasEarlyBird = true;

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
    const today = new Date();
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
      const tagId = entry.tag_id as string;
      tagIds.add(tagId);
      const minutes = entry.duration_minutes ?? 0;
      tagMinutes.set(tagId, (tagMinutes.get(tagId) ?? 0) + minutes);
    }

    const maxTagMinutes = Math.max(0, ...[...tagMinutes.values()]);

    // --- Group tag (colon syntax: "group:name") ---
    const hasGroupTag = tags.some((t) => t.name.includes(':'));

    // --- Chronotype zones: custom_zones ベースで3ティア判定 ---
    const chronotypeZoneCount = computeChronotypeZoneCount(entries, zones, timezone);
    const hasDeepZoneEntry = hasAnyDeepZoneEntry(entries, zones, timezone);

    // --- Account age ---
    const createdAt = profile?.created_at;
    const accountAgeDays = createdAt
      ? (Date.now() - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000)
      : 0;

    // --- Settings & Profile ---
    const chronotypeEnabled = settings?.chronotype_settings != null;
    const subscriptionStatus = profile?.subscription_status;
    const isProSubscriber =
      subscriptionStatus === 'active' ||
      subscriptionStatus === 'trialing' ||
      subscriptionStatus === 'past_due';

    return {
      streak,
      entryCount: entries.length,
      distinctTagCount: tagIds.size,
      chronotypeEnabled,
      entriesWithTime,
      hasFullDay,
      hasEarlyBird,
      hasDeepZoneEntry,
      fullWeekDays,
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
        return source.distinctTagCount;
      case 'deep-zone':
        return source.hasDeepZoneEntry ? 1 : 0;
      case 'full-day':
        return source.hasFullDay ? 1 : 0;
      case 'group-first':
        return source.hasGroupTag ? 1 : 0;
      case 'chronotype-trio':
        return source.chronotypeZoneCount;
      case 'early-bird':
        return source.hasEarlyBird ? 1 : 0;
      case 'full-week':
        return source.fullWeekDays;
      case 'weekly-champion':
        return source.isWeeklyBest ? 1 : 0;
      case 'pro-signup':
        return source.isProSubscriber ? 1 : 0;
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

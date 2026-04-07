/**
 * Badges Service
 *
 * バッジ判定・取得のビジネスロジック。
 * Supabaseを直接クエリし、他featureのimportは行わない（Independent layer）。
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
    const earned = await this.getEarnedSet(userId);
    const newlyEarned: NewlyEarnedBadge[] = [];

    for (const badge of BADGE_DEFINITIONS) {
      if (badge.isTiered && badge.thresholds) {
        const results = await this.evaluateTiered(userId, badge, earned);
        newlyEarned.push(...results);
      } else {
        if (this.isAlreadyEarned(earned, badge.id, null)) continue;
        const pass = await this.evaluateSingle(userId, badge);
        if (pass) {
          const inserted = await this.insertBadge(userId, badge.id, null);
          if (inserted) newlyEarned.push({ badgeId: badge.id, rank: null });
        }
      }
    }

    return newlyEarned;
  }

  /** 未獲得バッジの進捗データ */
  async getProgress(userId: string): Promise<BadgeProgress[]> {
    const earned = await this.getEarnedSet(userId);
    const progressList: BadgeProgress[] = [];

    for (const badge of BADGE_DEFINITIONS) {
      if (badge.isTiered && badge.thresholds) {
        const currentValue = await this.getCurrentValue(userId, badge);
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
        const currentValue = await this.getCurrentValue(userId, badge);
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
  // Internal: Evaluation Dispatchers
  // =========================================================================

  private async evaluateTiered(
    userId: string,
    badge: BadgeDefinition,
    earned: EarnedRecord[],
  ): Promise<NewlyEarnedBadge[]> {
    const results: NewlyEarnedBadge[] = [];
    const currentValue = await this.getCurrentValue(userId, badge);

    for (const threshold of badge.thresholds ?? []) {
      if (this.isAlreadyEarned(earned, badge.id, threshold.rank)) continue;
      if (currentValue >= threshold.value) {
        const inserted = await this.insertBadge(userId, badge.id, threshold.rank);
        if (inserted) results.push({ badgeId: badge.id, rank: threshold.rank });
      }
    }

    return results;
  }

  private async evaluateSingle(userId: string, badge: BadgeDefinition): Promise<boolean> {
    const value = await this.getCurrentValue(userId, badge);
    return value >= 1;
  }

  // =========================================================================
  // Internal: Value Queries
  // =========================================================================

  private async getCurrentValue(userId: string, badge: BadgeDefinition): Promise<number> {
    switch (badge.id) {
      case 'streak':
        return this.queryStreak(userId);
      case 'blocks':
        return this.queryEntryCount(userId);
      case 'tags-5':
        return this.queryDistinctTagCount(userId);
      case 'palette-first':
        return this.queryPaletteExists(userId);
      case 'deep-zone':
        return this.queryDeepZoneUsed(userId);
      case 'full-day':
        return this.queryFullDayCount(userId);
      case 'template-first':
        // テンプレート機能は未実装
        return 0;
      case 'export-first':
        // エクスポート機能の判定は将来対応
        return 0;
      case 'early-bird':
        return this.queryEarlyBird(userId);
      case 'night-owl':
        return this.queryNightOwl(userId);
      case 'full-week':
        return this.queryFullWeek(userId);
      case 'deep-full':
        return this.queryDeepFull(userId);
      case 'tag-streak':
        return this.queryTagStreak(userId);
      case 'tag-100h':
        return this.queryTag100h(userId);
      case 'monday-5':
        return this.queryMonday5(userId);
      case 'day-coverage':
        return this.queryDayCoverage(userId);
      case 'pro-signup':
        return this.queryProSignup(userId);
      case 'weekly-report':
        // ウィークリーレポート機能の判定は将来対応
        return 0;
      case 'six-months':
        return this.queryAccountAge(userId, 180);
      case 'one-year':
        return this.queryAccountAge(userId, 365);
      default:
        return 0;
    }
  }

  // =========================================================================
  // Internal: Individual Queries
  // =========================================================================

  /** 連続記録日数 */
  private async queryStreak(userId: string): Promise<number> {
    const since = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase.rpc('get_active_dates', {
      p_user_id: userId,
      p_since: since,
    });
    if (error || !data) return 0;

    const dateSet = new Set(data);
    const today = new Date();
    let streak = 0;

    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      if (dateSet.has(dateStr)) {
        streak++;
      } else {
        break;
      }
    }

    return streak;
  }

  /** 累計エントリ数 */
  private async queryEntryCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) return 0;
    return count ?? 0;
  }

  /** 使用タグ種類数 */
  private async queryDistinctTagCount(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('entry_tags')
      .select('tag_id')
      .eq('user_id', userId);

    if (error || !data) return 0;
    return new Set(data.map((d) => d.tag_id)).size;
  }

  /** パレット登録有無 */
  private async queryPaletteExists(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('palette_items')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    if (error) return 0;
    return (count ?? 0) > 0 ? 1 : 0;
  }

  /** Deep Zoneにブロックを配置したか */
  private async queryDeepZoneUsed(userId: string): Promise<number> {
    // chronotype設定からdeep zoneの時間帯を取得し、その時間帯にエントリがあるか確認
    // 簡易実装: chronotype_enabledがtrueかつstart_timeが設定されたエントリが存在するか
    const { data: settings } = await this.supabase
      .from('user_settings')
      .select('chronotype_enabled, chronotype_type')
      .eq('user_id', userId)
      .single();

    if (!settings?.chronotype_enabled) return 0;

    // chronotypeが設定済みかつエントリが存在すれば達成とみなす
    const { count } = await this.supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('start_time', 'is', null);

    return (count ?? 0) > 0 ? 1 : 0;
  }

  /** 1日8ブロック以上の日があるか */
  private async queryFullDayCount(userId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc('get_active_dates', {
      p_user_id: userId,
      p_since: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    });

    if (error || !data) return 0;

    // get_active_datesはアクティブな日を返す
    // 各日のエントリ数を別途チェック
    const { data: entries } = await this.supabase
      .from('entries')
      .select('start_time')
      .eq('user_id', userId)
      .not('start_time', 'is', null);

    if (!entries) return 0;

    const dateCount = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.start_time) continue;
      const date = entry.start_time.slice(0, 10);
      dateCount.set(date, (dateCount.get(date) ?? 0) + 1);
    }

    for (const count of dateCount.values()) {
      if (count >= 8) return 1;
    }
    return 0;
  }

  /** 7時前にブロック記録（1回でも達成） */
  private async queryEarlyBird(userId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('entries')
      .select('id')
      .eq('user_id', userId)
      .not('start_time', 'is', null)
      .limit(1);

    if (error || !data) return 0;

    // 直接SQLで7時前を判定する代わりに、全エントリから判定
    const { data: earlyEntries } = await this.supabase
      .from('entries')
      .select('start_time')
      .eq('user_id', userId)
      .not('start_time', 'is', null);

    if (!earlyEntries) return 0;

    for (const entry of earlyEntries) {
      if (!entry.start_time) continue;
      const hour = new Date(entry.start_time).getUTCHours();
      if (hour < 7) return 1;
    }
    return 0;
  }

  /** 23時以降にブロック記録 */
  private async queryNightOwl(userId: string): Promise<number> {
    const { data } = await this.supabase
      .from('entries')
      .select('start_time')
      .eq('user_id', userId)
      .not('start_time', 'is', null);

    if (!data) return 0;

    for (const entry of data) {
      if (!entry.start_time) continue;
      const hour = new Date(entry.start_time).getUTCHours();
      if (hour >= 23) return 1;
    }
    return 0;
  }

  /** 1週間で全曜日に記録 */
  private async queryFullWeek(userId: string): Promise<number> {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await this.supabase
      .from('entries')
      .select('start_time')
      .eq('user_id', userId)
      .not('start_time', 'is', null)
      .gte('start_time', oneWeekAgo);

    if (!data) return 0;

    const daysOfWeek = new Set<number>();
    for (const entry of data) {
      if (!entry.start_time) continue;
      daysOfWeek.add(new Date(entry.start_time).getDay());
    }
    return daysOfWeek.size >= 7 ? 1 : 0;
  }

  /** Deep Zoneの全枠にブロック配置 */
  private async queryDeepFull(userId: string): Promise<number> {
    // Deep Zone全枠活用の判定は簡易実装
    // chronotypeが有効で、十分なエントリがあれば達成
    const { data: settings } = await this.supabase
      .from('user_settings')
      .select('chronotype_enabled')
      .eq('user_id', userId)
      .single();

    if (!settings?.chronotype_enabled) return 0;

    const { count } = await this.supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .not('start_time', 'is', null);

    // 簡易: 20エントリ以上あれば達成とみなす
    return (count ?? 0) >= 20 ? 1 : 0;
  }

  /** 同じタグを7日連続使用 */
  private async queryTagStreak(userId: string): Promise<number> {
    const { data } = await this.supabase
      .from('entry_tags')
      .select('tag_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!data || data.length === 0) return 0;

    // タグごとに日付を収集
    const tagDates = new Map<string, Set<string>>();
    for (const row of data) {
      const date = row.created_at?.slice(0, 10);
      if (!date) continue;
      if (!tagDates.has(row.tag_id)) tagDates.set(row.tag_id, new Set());
      tagDates.get(row.tag_id)!.add(date);
    }

    // 各タグで連続日数を計算
    for (const dates of tagDates.values()) {
      const sorted = [...dates].sort();
      let maxStreak = 1;
      let currentStreak = 1;

      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]!).getTime();
        const curr = new Date(sorted[i]!).getTime();
        if (curr - prev === 24 * 60 * 60 * 1000) {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 1;
        }
      }

      if (maxStreak >= 7) return 1;
    }
    return 0;
  }

  /** 1つのタグで累計100時間 */
  private async queryTag100h(userId: string): Promise<number> {
    const { data } = await this.supabase
      .from('entries')
      .select('duration_minutes, entry_tags!inner(tag_id)')
      .eq('user_id', userId)
      .not('duration_minutes', 'is', null);

    if (!data) return 0;

    const tagMinutes = new Map<string, number>();
    for (const entry of data) {
      const minutes = entry.duration_minutes ?? 0;
      const tags = entry.entry_tags as unknown as Array<{ tag_id: string }>;
      for (const tag of tags) {
        tagMinutes.set(tag.tag_id, (tagMinutes.get(tag.tag_id) ?? 0) + minutes);
      }
    }

    for (const minutes of tagMinutes.values()) {
      if (minutes >= 6000) return 1; // 100時間 = 6000分
    }
    return 0;
  }

  /** 5週連続で月曜に記録 */
  private async queryMonday5(userId: string): Promise<number> {
    const fiveWeeksAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await this.supabase
      .from('entries')
      .select('start_time')
      .eq('user_id', userId)
      .not('start_time', 'is', null)
      .gte('start_time', fiveWeeksAgo);

    if (!data) return 0;

    const mondayWeeks = new Set<string>();
    for (const entry of data) {
      if (!entry.start_time) continue;
      const d = new Date(entry.start_time);
      if (d.getDay() === 1) {
        // 週番号をキーにする
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        mondayWeeks.add(weekStart.toISOString().slice(0, 10));
      }
    }

    return mondayWeeks.size >= 5 ? 1 : 0;
  }

  /** 1日の実時間80%以上をカバー */
  private async queryDayCoverage(userId: string): Promise<number> {
    const { data } = await this.supabase
      .from('entries')
      .select('start_time, end_time')
      .eq('user_id', userId)
      .not('start_time', 'is', null)
      .not('end_time', 'is', null);

    if (!data) return 0;

    // 日ごとの合計時間を計算
    const dayMinutes = new Map<string, number>();
    for (const entry of data) {
      if (!entry.start_time || !entry.end_time) continue;
      const date = entry.start_time.slice(0, 10);
      const start = new Date(entry.start_time).getTime();
      const end = new Date(entry.end_time).getTime();
      const minutes = (end - start) / 60000;
      dayMinutes.set(date, (dayMinutes.get(date) ?? 0) + minutes);
    }

    // 16時間（960分）の80% = 768分
    const threshold = 768;
    for (const minutes of dayMinutes.values()) {
      if (minutes >= threshold) return 1;
    }
    return 0;
  }

  /** Proプラン登録済みか */
  private async queryProSignup(userId: string): Promise<number> {
    const { data } = await this.supabase
      .from('user_settings')
      .select('subscription_status')
      .eq('user_id', userId)
      .single();

    if (!data) return 0;
    const status = (data as { subscription_status?: string }).subscription_status;
    return status === 'active' || status === 'trialing' ? 1 : 0;
  }

  /** アカウント作成からの日数 */
  private async queryAccountAge(userId: string, days: number): Promise<number> {
    const { data } = await this.supabase.auth.admin.getUserById(userId);
    if (!data?.user?.created_at) return 0;

    const created = new Date(data.user.created_at).getTime();
    const elapsed = Date.now() - created;
    const elapsedDays = elapsed / (24 * 60 * 60 * 1000);
    return elapsedDays >= days ? 1 : 0;
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

/**
 * Entry用データ取得フック
 * Board/Table共通のデータフェッチングhooks
 * TanStack Query統合済み
 */

import { useMemo } from 'react';

import type { DateRangeFilter } from '@/lib/date';
import { matchesDateRangeFilter } from '@/lib/date';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import { getEntryState } from '../lib/entry-status';
import type { EntryWithTags } from '../types/entry';
import { useEntries } from './useEntries';

import type { ReminderFilter, ScheduleFilter } from '../stores/useEntryFilterStore';

/** エントリステータス（時間位置から自動判定） */
type EntryStatus = 'open' | 'closed';

/**
 * ソートオプション
 */
/** ソートフィールドの種別 */
export type SortField = 'title' | 'created_at' | 'updated_at';
/** ソート方向 */
export type SortDirection = 'asc' | 'desc';

/** エントリのソートオプション */
export interface EntrySortOptions {
  field: SortField | null;
  direction: SortDirection;
}

/**
 * APIから返されるエントリデータの型
 * @internal テスト用にエクスポート
 */
/** APIから返されるエントリデータの型（テスト用エクスポート） */
export type EntryWithTagIds = EntryWithTags;

/**
 * エントリアイテム
 */
/** Board/Table表示用のエントリアイテム型 */
export interface EntryItem {
  id: string;
  title: string;
  status: EntryStatus;
  created_at: string;
  updated_at: string;
  description?: string | undefined;
  start_time?: string | null | undefined;
  end_time?: string | null | undefined;
  reminder_minutes?: number | null | undefined;
  tagId?: string | null | undefined;
}

/**
 * エントリフィルター型
 */
/** useEntryData で使用するクライアント側フィルター */
export interface EntryDataFilters {
  status?: EntryStatus | undefined;
  search?: string | undefined;
  tags?: string[] | undefined;
  reminder?: ReminderFilter | undefined;
  schedule?: ScheduleFilter | undefined;
  createdAt?: DateRangeFilter | undefined;
  updatedAt?: DateRangeFilter | undefined;
  hideCompleted?: boolean | undefined;
}

/**
 * リマインダーフィルターの判定
 */
function matchesReminderFilter(
  reminderMinutes: number | null | undefined,
  filter: ReminderFilter,
): boolean {
  if (filter === 'all') return true;
  const hasReminder = reminderMinutes !== null && reminderMinutes !== undefined;
  return filter === 'yes' ? hasReminder : !hasReminder;
}

/**
 * スケジュールフィルターの判定
 */
function matchesScheduleFilter(
  startTime: string | null | undefined,
  filter: ScheduleFilter,
): boolean {
  if (filter === 'all') return true;
  const isScheduled = !!startTime;
  return filter === 'scheduled' ? isScheduled : !isScheduled;
}

/** EntryをEntryItemに変換する（テスト用エクスポート）
 * @param entry - 変換元のエントリデータ
 * @returns Board/Table表示用のEntryItem
 */
export function entryToEntryItem(entry: EntryWithTagIds): EntryItem {
  // 時間位置ベースでステータスを導出
  const entryState = getEntryState({ start_time: entry.start_time, end_time: entry.end_time });
  const status: EntryStatus = entryState === 'past' ? 'closed' : 'open';

  return {
    id: entry.id,
    title: entry.title,
    status,
    created_at: entry.created_at ?? new Date().toISOString(),
    updated_at: entry.updated_at ?? new Date().toISOString(),
    description: entry.description ?? undefined,
    start_time: entry.start_time,
    end_time: entry.end_time,
    tagId: entry.tagId,
  };
}

/** Board/Table共通のエントリデータ取得フック（クライアント側フィルタリング・ソート付き）
 * @param filters - ステータス・タグ・スケジュール等のフィルター条件
 * @param sort - ソートフィールドと方向
 * @returns items: フィルター済みEntryItem配列, entries: 生データ, isPending, error
 */
export function useEntryData(filters: EntryDataFilters = {}, sort?: EntrySortOptions) {
  const {
    data: entriesData,
    isPending,
    error,
  } = useEntries({
    ...(filters.search && { search: filters.search }),
  });

  // ユーザーのタイムゾーン（日付範囲フィルタリングに使用）
  const timezone = useCalendarSettingsStore((s) => s.timezone);

  // フィルタリング・ソートをメモ化
  const items = useMemo(() => {
    let result: EntryItem[] =
      entriesData?.map((entry) => entryToEntryItem(entry as EntryWithTagIds)) || [];

    // ステータスフィルタリング
    if (filters.status) {
      result = result.filter((item) => item.status === filters.status);
    }

    // タグフィルタリング
    if (filters.tags && filters.tags.length > 0) {
      result = result.filter((item) => {
        if (!item.tagId) return false;
        return filters.tags!.includes(item.tagId);
      });
    }

    // リマインダーフィルタリング
    if (filters.reminder && filters.reminder !== 'all') {
      result = result.filter((item) =>
        matchesReminderFilter(item.reminder_minutes, filters.reminder!),
      );
    }

    // スケジュールフィルタリング
    if (filters.schedule && filters.schedule !== 'all') {
      result = result.filter((item) => matchesScheduleFilter(item.start_time, filters.schedule!));
    }

    // 作成日フィルタリング（ユーザーのタイムゾーンを使用）
    if (filters.createdAt && filters.createdAt !== 'all') {
      result = result.filter((item) =>
        matchesDateRangeFilter(item.created_at, filters.createdAt!, timezone),
      );
    }

    // 更新日フィルタリング（ユーザーのタイムゾーンを使用）
    if (filters.updatedAt && filters.updatedAt !== 'all') {
      result = result.filter((item) =>
        matchesDateRangeFilter(item.updated_at, filters.updatedAt!, timezone),
      );
    }

    // 完了を非表示フィルタリング
    if (filters.hideCompleted) {
      result = result.filter((item) => item.status !== 'closed');
    }

    // ソート適用
    if (sort?.field && sort?.direction) {
      result.sort((a, b) => {
        const field = sort.field as keyof EntryItem;
        const aValue = a[field];
        const bValue = b[field];

        if (field === 'created_at' || field === 'updated_at') {
          const aTime = new Date(aValue as string).getTime();
          const bTime = new Date(bValue as string).getTime();
          return sort.direction === 'asc' ? aTime - bTime : bTime - aTime;
        }

        const aStr = String(aValue ?? '');
        const bStr = String(bValue ?? '');
        const comparison = aStr.localeCompare(bStr, 'ja');
        return sort.direction === 'asc' ? comparison : -comparison;
      });
    } else {
      result.sort((a, b) => {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }

    return result;
  }, [entriesData, filters, sort, timezone]);

  return {
    items,
    entries: entriesData || [],
    isPending,
    error,
  };
}

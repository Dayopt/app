'use client';

import { useEffect, useMemo } from 'react';

import { addDays, subDays } from 'date-fns';

import type { EntryWithTags } from '@/features/entry';
import { useEntries } from '@/features/entry';
import { useTags } from '@/features/tags';
import { logger } from '@/lib/logger';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import * as Sentry from '@sentry/nextjs';
import { expandEntriesToCalendarEvents } from '../../../lib/entry-adapter';

import { useCalendarFilterStore } from '@/stores/useCalendarFilterStore';

import { calculateViewDateRange } from '../../../lib/range';

import type { CalendarEvent, CalendarViewType, ViewDateRange } from '../../../types/calendar.types';

interface UseCalendarDataOptions {
  viewType: CalendarViewType;
  currentDate: Date;
}

interface UseCalendarDataResult {
  viewDateRange: ViewDateRange;
  filteredEvents: CalendarEvent[];
  allCalendarEvents: CalendarEvent[];
  entriesData: ReturnType<typeof useEntries>['data'];
  /** エントリ取得エラー */
  entriesError: ReturnType<typeof useEntries>['error'];
  /** エントリ取得中かどうか */
  isEntriesLoading: boolean;
}

/**
 * カレンダーデータ取得・変換フック
 *
 * ビュータイプと日付からエントリを取得し、CalendarEvent型に変換・フィルタリングして返す
 */
export function useCalendarData({
  viewType,
  currentDate,
}: UseCalendarDataOptions): UseCalendarDataResult {
  // 週の開始日設定を取得
  const weekStartsOn = useCalendarSettingsStore((state) => state.weekStartsOn);

  // ビューに応じた期間計算（週の開始日設定を反映）
  const viewDateRange = useMemo(() => {
    return calculateViewDateRange(viewType, currentDate, weekStartsOn);
  }, [viewType, currentDate, weekStartsOn]);

  // 日付範囲をISO 8601形式に変換（サーバーサイドフィルタ用）
  const dateFilter = useMemo(
    () => ({
      startDate: viewDateRange.start.toISOString(),
      endDate: viewDateRange.end.toISOString(),
    }),
    [viewDateRange],
  );

  // entries を取得（plans + records 統合、単一クエリ）
  const {
    data: entriesData,
    error: entriesError,
    isLoading: isEntriesLoading,
  } = useEntries(dateFilter);

  // タグマスタをプリフェッチ（EntryCard等で使用するためキャッシュをwarm up）
  useTags();

  // tRPC utils（プリフェッチ用）
  const utils = api.useUtils();

  // 隣接期間のプリフェッチ（ナビゲーション高速化）
  useEffect(() => {
    const prefetchAdjacentPeriods = () => {
      // 前の期間
      const prevRange = calculateViewDateRange(viewType, subDays(currentDate, 7), weekStartsOn);
      void utils.entries.list.prefetch({
        startDate: prevRange.start.toISOString(),
        endDate: prevRange.end.toISOString(),
      });

      // 次の期間
      const nextRange = calculateViewDateRange(viewType, addDays(currentDate, 7), weekStartsOn);
      void utils.entries.list.prefetch({
        startDate: nextRange.start.toISOString(),
        endDate: nextRange.end.toISOString(),
      });
    };

    prefetchAdjacentPeriods();
  }, [currentDate, viewType, weekStartsOn, utils.entries.list]);

  // フィルター関数と状態を取得（ストアに統一）
  const isEntryVisible = useCalendarFilterStore((state) => state.isEntryVisible);
  // タグフィルタ変更時に useMemo を再実行させるためのリアクティブ依存
  const visibleTagIds = useCalendarFilterStore((state) => state.visibleTagIds);

  // 全エントリをCalendarEvent型に変換
  const allCalendarEvents = useMemo(() => {
    const calendarPlans: CalendarEvent[] = [];

    if (entriesData) {
      const startTime = performance.now();

      // サーバー型 → コア型に正規化（tagId を保証）
      const normalized: EntryWithTags[] = entriesData.map((e) => ({
        ...e,
        tagId: e.tagId ?? null,
      })) as EntryWithTags[];
      const expandedEvents = expandEntriesToCalendarEvents(normalized);
      calendarPlans.push(...expandedEvents);

      const duration = performance.now() - startTime;
      if (duration > 10) {
        Sentry.addBreadcrumb({
          category: 'performance',
          message: `expandEntriesToCalendarEvents took ${duration.toFixed(1)}ms`,
          level: 'warning',
          data: {
            duration,
            entryCount: entriesData.length,
            expandedCount: expandedEvents.length,
          },
        });
      }
    }

    return calendarPlans;
  }, [entriesData]);

  // 表示範囲のイベントをフィルタリング
  const filteredEvents = useMemo(() => {
    if (allCalendarEvents.length === 0) {
      return [];
    }

    // 表示範囲内のイベントのみをフィルタリング
    const startDateOnly = new Date(
      viewDateRange.start.getFullYear(),
      viewDateRange.start.getMonth(),
      viewDateRange.start.getDate(),
    );
    const endDateOnly = new Date(
      viewDateRange.end.getFullYear(),
      viewDateRange.end.getMonth(),
      viewDateRange.end.getDate(),
    );

    const filtered = allCalendarEvents.filter((event) => {
      if (!event.startDate || !event.endDate) {
        return false;
      }
      const eventStartDateOnly = new Date(
        event.startDate.getFullYear(),
        event.startDate.getMonth(),
        event.startDate.getDate(),
      );
      const eventEndDateOnly = new Date(
        event.endDate.getFullYear(),
        event.endDate.getMonth(),
        event.endDate.getDate(),
      );

      return (
        (eventStartDateOnly >= startDateOnly && eventStartDateOnly <= endDateOnly) ||
        (eventEndDateOnly >= startDateOnly && eventEndDateOnly <= endDateOnly) ||
        (eventStartDateOnly <= startDateOnly && eventEndDateOnly >= endDateOnly)
      );
    });

    // サイドバーのフィルター設定を適用
    const visibilityFiltered = filtered.filter((event) => {
      return isEntryVisible(event.tagId ?? null);
    });

    logger.log(`[useCalendarData] entriesフィルタリング:`, {
      totalEntries: allCalendarEvents.length,
      dateFiltered: filtered.length,
      visibilityFiltered: visibilityFiltered.length,
      dateRange: {
        start: startDateOnly.toDateString(),
        end: endDateOnly.toDateString(),
      },
      sampleEvents: visibilityFiltered.slice(0, 3).map((e) => ({
        title: e.title,
        startDate: e.startDate?.toISOString() ?? null,
        endDate: e.endDate?.toISOString() ?? null,
        tagId: e.tagId,
      })),
    });

    return visibilityFiltered;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleTagIds はリアクティブ依存（関数参照は安定のため直接依存不可）
  }, [viewDateRange, allCalendarEvents, isEntryVisible, visibleTagIds]);

  return {
    viewDateRange,
    filteredEvents,
    allCalendarEvents,
    entriesData,
    entriesError,
    isEntriesLoading,
  };
}

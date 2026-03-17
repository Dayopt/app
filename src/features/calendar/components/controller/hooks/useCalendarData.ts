'use client';

import { useEffect, useMemo } from 'react';

import { addDays, format, subDays } from 'date-fns';

import type { EntryWithTags } from '@/features/entry';
import { isRecurringEntry, useEntries } from '@/features/entry';
import { useTags } from '@/features/tags';
import { logger } from '@/lib/logger';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import {
  expandEntriesToCalendarEvents,
  type EntryInstanceException,
} from '../../../lib/entry-adapter';

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
}

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
  const { data: entriesData } = useEntries(dateFilter);

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

  // 繰り返しエントリのIDを抽出
  const recurringEntryIds = useMemo(() => {
    if (!entriesData) return [];
    return entriesData.filter((entry) => isRecurringEntry(entry)).map((entry) => entry.id);
  }, [entriesData]);

  // 繰り返しエントリの例外情報を取得（繰り返しエントリがある場合のみ）
  const { data: instancesData } = api.entries.getInstances.useQuery(
    {
      entryIds: recurringEntryIds,
      startDate: format(viewDateRange.start, 'yyyy-MM-dd'),
      endDate: format(viewDateRange.end, 'yyyy-MM-dd'),
    },
    {
      enabled: recurringEntryIds.length > 0,
      staleTime: 30 * 1000,
    },
  );

  // 例外情報をMapに変換
  const exceptionsMap = useMemo(() => {
    const map = new Map<string, EntryInstanceException[]>();
    if (!instancesData) return map;

    for (const inst of instancesData) {
      const entryId = inst.entry_id; // instances テーブルの entry_id
      if (!map.has(entryId)) {
        map.set(entryId, []);
      }
      map.get(entryId)!.push({
        instanceDate: inst.instance_date,
        exceptionType: inst.exception_type as 'modified' | 'cancelled' | 'moved' | undefined,
        title: inst.title ?? undefined,
        description: inst.description ?? undefined,
        instanceStart: inst.instance_start ?? undefined,
        instanceEnd: inst.instance_end ?? undefined,
        originalDate: inst.original_date ?? undefined,
      });
    }
    return map;
  }, [instancesData]);

  // 全エントリをCalendarEvent型に変換（繰り返しエントリを展開）
  const allCalendarEvents = useMemo(() => {
    const calendarPlans: CalendarEvent[] = [];

    // Entries の変換（繰り返し展開含む）
    if (entriesData) {
      // サーバー型 → コア型に正規化（tagId を保証）
      const normalized: EntryWithTags[] = entriesData.map((e) => ({
        ...e,
        tagId: e.tagId ?? null,
      })) as EntryWithTags[];
      const expandedEvents = expandEntriesToCalendarEvents(
        normalized,
        viewDateRange.start,
        viewDateRange.end,
        exceptionsMap,
      );
      calendarPlans.push(...expandedEvents);
    }

    return calendarPlans;
  }, [entriesData, viewDateRange, exceptionsMap]);

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
  };
}

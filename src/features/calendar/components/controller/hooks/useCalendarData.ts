'use client';

import { useDeferredValue, useEffect, useMemo } from 'react';

import { addDays, subDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

import { useCalendarSettingsStore } from '@/features/calendar/stores/useCalendarSettingsStore';
import type { EntryWithTags } from '@/features/entry';
import { useEntries } from '@/features/entry';
import { useTags } from '@/features/tags';
import { api } from '@/lib/trpc';
import * as Sentry from '@sentry/nextjs';
import { expandEntriesToCalendarEvents } from '../../../lib/entry-adapter';

import { useCalendarFilterStore } from '@/features/calendar/stores/useCalendarFilterStore';

import { calculateViewDateRange } from '../../../lib/range';

import type { CalendarEvent, CalendarViewType, ViewDateRange } from '../../../types/calendar.types';

/**
 * ローカル日付の 00:00:00 をユーザーTZのUTC ISO文字列に変換
 * サーバーのprefetchと同じクエリキーを生成するため使用する
 */
function toTZStartISO(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDateStr = formatter.format(date);
  return fromZonedTime(new Date(`${localDateStr}T00:00:00`), timezone).toISOString();
}

/** ローカル日付の 23:59:59.999 をユーザーTZのUTC ISO文字列に変換 */
function toTZEndISO(date: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const localDateStr = formatter.format(date);
  return fromZonedTime(new Date(`${localDateStr}T23:59:59.999`), timezone).toISOString();
}

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
  // 週の開始日設定とタイムゾーンを取得
  const weekStartsOn = useCalendarSettingsStore((state) => state.weekStartsOn);
  const timezone = useCalendarSettingsStore((state) => state.timezone);

  // ビューに応じた期間計算（週の開始日設定を反映）
  const viewDateRange = useMemo(() => {
    return calculateViewDateRange(viewType, currentDate, weekStartsOn);
  }, [viewType, currentDate, weekStartsOn]);

  // 日付範囲をISO 8601形式に変換（サーバーサイドフィルタ用）
  // toISOString()はTZ依存のためユーザーTZのローカル深夜をUTC ISOに変換して使用
  const dateFilter = useMemo(
    () => ({
      startDate: toTZStartISO(viewDateRange.start, timezone),
      endDate: toTZEndISO(viewDateRange.end, timezone),
    }),
    [viewDateRange, timezone],
  );

  // entries を取得（単一クエリ）
  const {
    data: entriesData,
    error: entriesError,
    isLoading: isEntriesLoading,
  } = useEntries(dateFilter);

  // タグマスタ取得（EntryCard等で使用するためキャッシュをwarm up + フィルタ初期化）
  const { data: tagsData } = useTags();
  const initializeWithTags = useCalendarFilterStore((state) => state.initializeWithTags);

  // タグフィルタを初期化（モバイルではサイドバーがマウントされないため、ここで保証する）
  useEffect(() => {
    if (tagsData && tagsData.length > 0) {
      initializeWithTags(tagsData.map((tag) => tag.id));
    }
  }, [tagsData, initializeWithTags]);

  // tRPC utils（プリフェッチ用）
  const utils = api.useUtils();

  // 隣接期間のプリフェッチ（ナビゲーション高速化）
  useEffect(() => {
    const prefetchAdjacentPeriods = () => {
      // 前の期間
      const prevRange = calculateViewDateRange(viewType, subDays(currentDate, 7), weekStartsOn);
      void utils.entries.list.prefetch({
        startDate: toTZStartISO(prevRange.start, timezone),
        endDate: toTZEndISO(prevRange.end, timezone),
      });

      // 次の期間
      const nextRange = calculateViewDateRange(viewType, addDays(currentDate, 7), weekStartsOn);
      void utils.entries.list.prefetch({
        startDate: toTZStartISO(nextRange.start, timezone),
        endDate: toTZEndISO(nextRange.end, timezone),
      });
    };

    prefetchAdjacentPeriods();
  }, [currentDate, viewType, weekStartsOn, timezone, utils.entries.list]);

  // フィルター関数と状態を取得（ストアに統一）
  const isEntryVisible = useCalendarFilterStore((state) => state.isEntryVisible);
  // タグフィルタ変更時に useMemo を再実行させるためのリアクティブ依存
  // useDeferredValue でフィルター変更時のカレンダー再描画を遅延し、
  // チェックボックスUIの即時応答を維持する
  const visibleTagIds = useDeferredValue(useCalendarFilterStore((state) => state.visibleTagIds));

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
      const expandedEvents = expandEntriesToCalendarEvents(normalized, timezone);
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
  }, [entriesData, timezone]);

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

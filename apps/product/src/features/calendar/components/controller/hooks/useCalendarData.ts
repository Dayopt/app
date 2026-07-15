'use client';

import { useCallback, useDeferredValue, useEffect, useMemo } from 'react';

import { addDays, subDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

import { useTags } from '@/features/tags';
import { getDateKey } from '@/lib/date';
import { tzIsSameDay } from '@/lib/date/timezone';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { api } from '@/lib/trpc';

import { useCalendarFilterStore } from '@/features/calendar/stores/useCalendarFilterStore';

import { calculateViewDateRange } from '../../../domain/view-range';
import { applyTimezoneToDisplayDates } from '../../../lib/plan-data-adapter';
import { expandRecordRowsToRecordEvents } from '../../../lib/record-event-adapter';

import type { CalendarEvent, CalendarViewType, ViewDateRange } from '../../../types/calendar.types';
import { getMultiDayCount, isMultiDayView } from '../../../types/calendar.types';

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

/** 表示範囲の行を先頭に保ったまま、関連取得で得た同一行を id 単位で統合する。 */
function mergeRowsById<T extends { id: string }>(
  ...groups: ReadonlyArray<ReadonlyArray<T> | undefined>
): T[] {
  const rowsById = new Map<string, T>();
  for (const group of groups) {
    for (const row of group ?? []) rowsById.set(row.id, row);
  }
  return Array.from(rowsById.values());
}

interface UseCalendarDataOptions {
  viewType: CalendarViewType;
  currentDate: Date;
}

interface UseCalendarDataResult {
  viewDateRange: ViewDateRange;
  filteredEvents: CalendarEvent[];
  allCalendarEvents: CalendarEvent[];
  /** time model 取得エラー */
  timeblocksError: unknown | null;
  /** time model 取得中かどうか（初回のみ true） */
  isTimeblocksLoading: boolean;
  /** バックグラウンド再取得中も含めて取得中かどうか */
  isTimeblocksFetching: boolean;
  /** エントリ取得を手動で再試行する */
  refetchTimeblocks: () => Promise<unknown>;
  /** ナビゲーション方向に対応する日付範囲を事前取得する */
  prefetchDirection: (direction: 'prev' | 'next' | 'today') => void;
  /** ビュー切り替え先の日付範囲を即座に事前取得する */
  prefetchForView: (newViewType: CalendarViewType) => void;
}

/**
 * カレンダーデータ取得・変換フック
 *
 * ビュータイプと日付から plan / record を取得し、既存カレンダー表示型に射影して返す
 */
export function useCalendarData({
  viewType,
  currentDate,
}: UseCalendarDataOptions): UseCalendarDataResult {
  // 週の開始日設定とタイムゾーンを取得
  const weekStartsOn = useUserPreferences((state) => state.weekStartsOn);
  const timezone = useUserPreferences((state) => state.timezone);

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

  // Step 8: entries を読まず、plans / records をそれぞれ取得する。
  const plansQuery = api.plans.list.useQuery({
    ...dateFilter,
    sortBy: 'start_at',
    sortOrder: 'asc',
    limit: 100,
  });
  const recordsQuery = api.records.list.useQuery({
    ...dateFilter,
    sortBy: 'start_at',
    sortOrder: 'asc',
    limit: 100,
  });

  // Calendar の表示範囲外に分割された Record も 1:N 集計へ含める。
  // 1 query のID配列を100件以内に保つため、表示中Planと、表示中Recordだけが参照する
  // 範囲外Planを別queryに分ける。
  const visiblePlanIds = useMemo(
    () => (plansQuery.data ?? []).map((plan) => plan.id),
    [plansQuery.data],
  );
  const externalPlanIds = useMemo(() => {
    const visiblePlanIdSet = new Set(visiblePlanIds);
    return Array.from(
      new Set(
        (recordsQuery.data ?? [])
          .map((record) => record.plan_id)
          .filter((planId): planId is string => planId != null && !visiblePlanIdSet.has(planId)),
      ),
    );
  }, [recordsQuery.data, visiblePlanIds]);

  const visiblePlanRecordsQuery = api.records.list.useQuery(
    { planIds: visiblePlanIds, sortBy: 'start_at', sortOrder: 'asc' },
    { enabled: visiblePlanIds.length > 0 },
  );
  const externalPlansQuery = api.plans.list.useQuery(
    { ids: externalPlanIds, sortBy: 'start_at', sortOrder: 'asc' },
    { enabled: externalPlanIds.length > 0 },
  );
  const externalPlanRecordsQuery = api.records.list.useQuery(
    { planIds: externalPlanIds, sortBy: 'start_at', sortOrder: 'asc' },
    { enabled: externalPlanIds.length > 0 },
  );

  const timeblocksError =
    plansQuery.error ??
    recordsQuery.error ??
    visiblePlanRecordsQuery.error ??
    externalPlansQuery.error ??
    externalPlanRecordsQuery.error;
  const isTimeblocksLoading =
    plansQuery.isLoading ||
    recordsQuery.isLoading ||
    visiblePlanRecordsQuery.isLoading ||
    externalPlansQuery.isLoading ||
    externalPlanRecordsQuery.isLoading;
  const isTimeblocksFetching =
    plansQuery.isFetching ||
    recordsQuery.isFetching ||
    visiblePlanRecordsQuery.isFetching ||
    externalPlansQuery.isFetching ||
    externalPlanRecordsQuery.isFetching;
  const refetchTimeblocks = useCallback(
    () =>
      Promise.all([
        plansQuery.refetch(),
        recordsQuery.refetch(),
        visiblePlanRecordsQuery.refetch(),
        externalPlansQuery.refetch(),
        externalPlanRecordsQuery.refetch(),
      ]),
    [
      externalPlanRecordsQuery,
      externalPlansQuery,
      recordsQuery,
      plansQuery,
      visiblePlanRecordsQuery,
    ],
  );

  // タグマスタ取得（TimeblockCard等で使用するためキャッシュをwarm up + フィルタ同期）
  const { data: tagsData } = useTags();
  const syncWithTags = useCalendarFilterStore((state) => state.syncWithTags);

  // タグフィルタを tagsData と同期（新規 tag は visible として追加、削除済み tag は orphan として除去）
  // モバイルではサイドバーがマウントされないため、ここで保証する
  useEffect(() => {
    if (tagsData && tagsData.length > 0) {
      syncWithTags(tagsData.map((tag) => tag.id));
    }
  }, [tagsData, syncWithTags]);

  // tRPC utils（プリフェッチ用）
  const utils = api.useUtils();

  // 隣接期間のプリフェッチ（ナビゲーション高速化、viewType別に最適化）
  useEffect(() => {
    const prefetchRange = (date: Date, view: CalendarViewType = viewType) => {
      const range = calculateViewDateRange(view, date, weekStartsOn);
      const input = {
        startDate: toTZStartISO(range.start, timezone),
        endDate: toTZEndISO(range.end, timezone),
        sortBy: 'start_at' as const,
        sortOrder: 'asc' as const,
        limit: 100,
      };
      void Promise.all([utils.plans.list.prefetch(input), utils.records.list.prefetch(input)]);
    };

    if (viewType === 'day') {
      // dayビュー: 前後3日を個別にprefetch（日送りでのキャッシュヒット率向上）
      for (let i = 1; i <= 3; i++) {
        prefetchRange(subDays(currentDate, i));
        prefetchRange(addDays(currentDate, i));
      }
    } else if (isMultiDayView(viewType)) {
      // multi-dayビュー: 前後1期間分をprefetch
      const count = getMultiDayCount(viewType);
      prefetchRange(subDays(currentDate, count));
      prefetchRange(addDays(currentDate, count));
    } else {
      // weekビュー: 前後1週間をprefetch
      prefetchRange(subDays(currentDate, 7));
      prefetchRange(addDays(currentDate, 7));
    }
  }, [currentDate, viewType, weekStartsOn, timezone, utils.records.list, utils.plans.list]);

  // 指定方向のナビゲーション先を事前取得（ホバー/タッチ時に呼ばれる）
  const prefetchDirection = useCallback(
    (direction: 'prev' | 'next' | 'today') => {
      let targetDate: Date;

      if (direction === 'today') {
        targetDate = new Date();
      } else {
        const multiplier = direction === 'next' ? 1 : -1;
        targetDate = new Date(currentDate);

        if (isMultiDayView(viewType)) {
          targetDate.setDate(currentDate.getDate() + getMultiDayCount(viewType) * multiplier);
        } else {
          switch (viewType) {
            case 'day':
              targetDate.setDate(currentDate.getDate() + 1 * multiplier);
              break;
            case 'week':
            default:
              targetDate.setDate(currentDate.getDate() + 7 * multiplier);
          }
        }
      }

      const range = calculateViewDateRange(viewType, targetDate, weekStartsOn);
      const input = {
        startDate: toTZStartISO(range.start, timezone),
        endDate: toTZEndISO(range.end, timezone),
        sortBy: 'start_at' as const,
        sortOrder: 'asc' as const,
        limit: 100,
      };
      void Promise.all([utils.plans.list.prefetch(input), utils.records.list.prefetch(input)]);
    },
    [currentDate, viewType, weekStartsOn, timezone, utils.records.list, utils.plans.list],
  );

  // ビュー切り替え先の日付範囲を即座にprefetch（useEffect経由の1レンダー遅延を回避）
  const prefetchForView = useCallback(
    (newViewType: CalendarViewType) => {
      const range = calculateViewDateRange(newViewType, currentDate, weekStartsOn);
      const input = {
        startDate: toTZStartISO(range.start, timezone),
        endDate: toTZEndISO(range.end, timezone),
        sortBy: 'start_at' as const,
        sortOrder: 'asc' as const,
        limit: 100,
      };
      void Promise.all([utils.plans.list.prefetch(input), utils.records.list.prefetch(input)]);
    },
    [currentDate, weekStartsOn, timezone, utils.records.list, utils.plans.list],
  );

  // フィルター関数と状態を取得（ストアに統一）
  const isEntryVisible = useCalendarFilterStore((state) => state.isEntryVisible);
  // タグフィルタ変更時に useMemo を再実行させるためのリアクティブ依存
  // useDeferredValue でフィルター変更時のカレンダー再描画を遅延し、
  // チェックボックスUIの即時応答を維持する
  const visibleTagIds = useDeferredValue(useCalendarFilterStore((state) => state.visibleTagIds));

  // Step 8 の表示互換射影。既存のカードと DnD の段階的置換が完了するまで
  // CalendarEvent は view model としてだけ維持し、データ取得は time model に固定する。
  const allCalendarEvents = useMemo(() => {
    const visiblePlans = plansQuery.data ?? [];
    const visibleRecords = recordsQuery.data ?? [];
    const plans = mergeRowsById(visiblePlans, externalPlansQuery.data);
    const records = mergeRowsById(
      visibleRecords,
      visiblePlanRecordsQuery.data,
      externalPlanRecordsQuery.data,
    );
    const now = new Date();
    const planEvents = plans.map((plan) => {
      const startDate = new Date(plan.start_at);
      const endDate = new Date(plan.end_at);
      const timeblockState = endDate <= now ? 'past' : startDate <= now ? 'active' : 'upcoming';
      return applyTimezoneToDisplayDates(
        {
          id: plan.id,
          title: plan.title,
          description: plan.note ?? undefined,
          startDate,
          endDate,
          status: timeblockState === 'past' ? 'closed' : 'open',
          color: '',
          tagId: plan.tag_id,
          createdAt: new Date(plan.created_at),
          updatedAt: new Date(plan.updated_at),
          displayStartDate: startDate,
          displayEndDate: endDate,
          duration: Math.round((endDate.getTime() - startDate.getTime()) / 60_000),
          isMultiDay: !tzIsSameDay(startDate, endDate, timezone),
          origin: 'planned',
          timeblockState,
          plannedStartDate: startDate,
          plannedEndDate: endDate,
          actualStartDate: null,
          actualEndDate: null,
          isSkipped: plan.skipped_at != null,
          kind: 'plan' as const,
          planId: null,
        },
        timezone,
      );
    });
    const plannedMinutesByPlanId = new Map(
      planEvents.map((plan) => [plan.id, plan.duration] as const),
    );
    const recordRowsById = new Map(records.map((record) => [record.id, record] as const));
    const recordEvents = expandRecordRowsToRecordEvents(records, {
      timezone,
      plannedMinutesByPlanId,
      primaryCandidateRecordIds: new Set(visibleRecords.map((record) => record.id)),
    }).map((record) => {
      const sourceRow = recordRowsById.get(record.id);
      if (!sourceRow) return null;

      return {
        id: record.id,
        title: record.title,
        description: record.note ?? undefined,
        startDate: record.startDate,
        endDate: record.endDate,
        status: 'closed' as const,
        color: '',
        tagId: record.tagId,
        createdAt: new Date(sourceRow.created_at),
        updatedAt: new Date(sourceRow.updated_at),
        displayStartDate: record.displayStartDate,
        displayEndDate: record.displayEndDate,
        duration: record.duration,
        isMultiDay: !tzIsSameDay(record.startDate, record.endDate, timezone),
        origin: record.planId ? ('planned' as const) : ('unplanned' as const),
        timeblockState: 'past' as const,
        actualStartDate: record.startDate,
        actualEndDate: record.endDate,
        plannedStartDate: null,
        plannedEndDate: null,
        kind: 'record' as const,
        planId: record.planId,
        recordSource: sourceRow.source,
        diffMinutes: record.diffMinutes,
      };
    });
    return [...planEvents, ...recordEvents.filter((record) => record != null)];
  }, [
    externalPlanRecordsQuery.data,
    externalPlansQuery.data,
    plansQuery.data,
    recordsQuery.data,
    timezone,
    visiblePlanRecordsQuery.data,
  ]);

  // 表示範囲のイベントをフィルタリング
  const filteredEvents = useMemo(() => {
    if (allCalendarEvents.length === 0) {
      return [];
    }

    // 表示範囲内のイベントのみをフィルタリング。
    // 日次バケットはユーザーTZの yyyy-MM-dd を正とし、ブラウザTZでは再計算しない。
    const startDateKey = getDateKey(viewDateRange.start, timezone);
    const endDateKey = getDateKey(viewDateRange.end, timezone);

    const filtered = allCalendarEvents.filter((event) => {
      if (!event.startDate || !event.endDate) {
        return false;
      }
      const eventStartDateKey = getDateKey(event.startDate, timezone);
      const eventEndDateKey = getDateKey(event.endDate, timezone);

      return (
        (eventStartDateKey >= startDateKey && eventStartDateKey <= endDateKey) ||
        (eventEndDateKey >= startDateKey && eventEndDateKey <= endDateKey) ||
        (eventStartDateKey <= startDateKey && eventEndDateKey >= endDateKey)
      );
    });

    // サイドバーのフィルター設定を適用
    const visibilityFiltered = filtered.filter((event) => {
      return isEntryVisible(event.tagId ?? null);
    });

    return visibilityFiltered;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleTagIds はリアクティブ依存（関数参照は安定のため直接依存不可）
  }, [viewDateRange, allCalendarEvents, timezone, isEntryVisible, visibleTagIds]);

  return {
    viewDateRange,
    filteredEvents,
    allCalendarEvents,
    timeblocksError,
    isTimeblocksLoading,
    isTimeblocksFetching,
    refetchTimeblocks,
    prefetchDirection,
    prefetchForView,
  };
}

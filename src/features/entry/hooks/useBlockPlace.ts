'use client';

/**
 * useBlockPlace — ブロック配置フック
 *
 * 「エントリ作成 + タグ設定」のフローを統一。
 * palette / history の共通ロジックを集約。
 *
 * - カレンダー表示日に配置（別日を見ていればその日に）
 * - Undo 付きトースト
 * - 配置後に自動スクロール
 */

import { useCallback } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { CalendarViewType } from '@/lib/calendar-constants';
import { getMultiDayCount, isMultiDayView } from '@/lib/calendar-constants';
import { convertToTimezone } from '@/lib/date/timezone';
import { snapToNextInterval } from '@/lib/time-utils';
import { useCalendarNavigationStore } from '@/stores/useCalendarNavigationStore';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

import { createListQueryPredicate } from './mutations/mutationUtils';
import { useEntryMutations } from './useEntryMutations';

/** 時刻を HH:mm にフォーマット（ユーザーTZ変換済み Date を受け取る） */
function formatHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 現在時刻（ユーザーTZ）をカレンダー表示日に適用した Date を返す */
function applyTimeToDate(targetDate: Date, timezone: string): Date {
  const nowInTz = convertToTimezone(new Date(), timezone);
  const result = new Date(targetDate);
  result.setHours(nowInTz.getHours(), nowInTz.getMinutes(), nowInTz.getSeconds(), 0);
  return result;
}

/** 今日がカレンダー表示範囲内かを判定し、範囲内なら今日を返す */
function resolveTargetDate(viewedDate: Date, viewType: CalendarViewType, timezone: string): Date {
  // day ビュー: そのまま viewedDate を使用
  if (viewType === 'day') return viewedDate;

  // week / multi-day ビュー: 今日が範囲内なら今日を使用
  const dayCount =
    viewType === 'week' ? 7 : isMultiDayView(viewType) ? getMultiDayCount(viewType) : 1;

  const now = new Date();
  const nowInTz = convertToTimezone(now, timezone);
  const viewedInTz = convertToTimezone(viewedDate, timezone);

  // ユーザーTZで viewedDate から dayCount 日分の範囲を構築
  const viewedStart = new Date(viewedInTz);
  viewedStart.setHours(0, 0, 0, 0);
  const viewedEnd = new Date(viewedStart);
  viewedEnd.setDate(viewedStart.getDate() + dayCount);

  const todayStart = new Date(nowInTz);
  todayStart.setHours(0, 0, 0, 0);

  if (todayStart >= viewedStart && todayStart < viewedEnd) {
    return now;
  }

  return viewedDate;
}

/** カレンダーのスクロールコンテナを指定時刻位置にスクロール */
function scrollCalendarToTime(hour: number, minute: number) {
  const container = document.querySelector<HTMLElement>('[data-calendar-scroll]');
  if (!container) return;
  // hourHeight を DOM から推定（グリッド全体 = 24h）
  const gridHeight = container.scrollHeight;
  const hourHeight = gridHeight / 24;
  const targetY = (hour + minute / 60) * hourHeight;
  const containerHeight = container.clientHeight;
  container.scrollTo({
    top: Math.max(0, targetY - containerHeight / 2),
    behavior: 'smooth',
  });
}

/** キャッシュ済みエントリとの重複を事前チェック */
function hasOverlapInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  startTime: Date,
  endTime: Date,
): boolean {
  const isEntriesList = createListQueryPredicate('entries');
  type CachedEntry = {
    start_time: string | null;
    end_time: string | null;
    deleted_at: string | null;
  };
  const allCaches = queryClient.getQueriesData<CachedEntry[]>({ predicate: isEntriesList });

  for (const [, entries] of allCaches) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.deleted_at) continue;
      if (!entry.start_time || !entry.end_time) continue;
      const entryStart = new Date(entry.start_time);
      const entryEnd = new Date(entry.end_time);
      // half-open interval overlap
      if (entryStart < endTime && entryEnd > startTime) return true;
    }
  }
  return false;
}

/** 指定時刻にブロック（エントリ + タグ）を配置するフック */
export function useBlockPlace() {
  const { createEntry, deleteEntry } = useEntryMutations({ suppressCreateToast: true });
  const t = useTranslations();
  const queryClient = useQueryClient();
  const timezone = useCalendarSettingsStore((state) => state.timezone);

  /** 指定時刻にブロックを配置 */
  const placeBlock = useCallback(
    (params: { tagId: string; tagName: string; startTime: Date; durationMinutes: number }) => {
      const end = new Date(params.startTime.getTime() + params.durationMinutes * 60 * 1000);

      // キャッシュから事前重複チェック（楽観的更新でカードが一瞬現れるのを防ぐ）
      if (hasOverlapInCache(queryClient, params.startTime, end)) {
        const displayStart = convertToTimezone(params.startTime, timezone);
        const timeStr = formatHHmm(displayStart);
        toast.error(t('sidebar.palette.overlapError', { time: timeStr }));
        return;
      }

      createEntry.mutate(
        {
          title: params.tagName,
          start_time: params.startTime.toISOString(),
          end_time: end.toISOString(),
          duration_minutes: params.durationMinutes,
          tagId: params.tagId,
        },
        {
          onSuccess: (newEntry) => {
            // Undo 付きトースト
            const displayStart = convertToTimezone(params.startTime, timezone);
            const timeStr = formatHHmm(displayStart);
            toast.success(t('sidebar.palette.placed', { name: params.tagName, time: timeStr }), {
              duration: 5000,
              action: {
                label: t('common.undo'),
                onClick: () => {
                  deleteEntry.mutate({ id: newEntry.id });
                },
              },
            });

            // 自動スクロール（ユーザーTZの時刻で表示位置を決定）
            const tzStart = convertToTimezone(params.startTime, timezone);
            scrollCalendarToTime(tzStart.getHours(), tzStart.getMinutes());
          },
        },
      );
    },
    [createEntry, deleteEntry, queryClient, t, timezone],
  );

  /** カレンダー表示日の現在時刻にブロックを配置（週表示で今日が範囲内なら今日に配置） */
  const placeBlockNow = useCallback(
    (tagId: string, durationMinutes: number, tagName: string) => {
      const { viewedDate, viewType } = useCalendarNavigationStore.getState();
      const targetDate = resolveTargetDate(viewedDate, viewType, timezone);
      const startTime = snapToNextInterval(applyTimeToDate(targetDate, timezone));
      placeBlock({
        tagId,
        tagName,
        startTime,
        durationMinutes,
      });
    },
    [placeBlock, timezone],
  );

  return { placeBlock, placeBlockNow };
}

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
import { snapToNextInterval } from '@/lib/time-utils';
import { useCalendarNavigationStore } from '@/stores/useCalendarNavigationStore';

import { createListQueryPredicate } from './mutations/mutationUtils';
import { useEntryMutations } from './useEntryMutations';

/** 時刻を HH:mm にフォーマット */
function formatHHmm(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 現在時刻をカレンダー表示日に適用した Date を返す */
function applyTimeToDate(targetDate: Date): Date {
  const now = new Date();
  const result = new Date(targetDate);
  result.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return result;
}

/** 今日がカレンダー表示範囲内かを判定し、範囲内なら今日を返す */
function resolveTargetDate(viewedDate: Date, viewType: CalendarViewType): Date {
  // day ビュー: そのまま viewedDate を使用
  if (viewType === 'day') return viewedDate;

  // week / multi-day ビュー: 今日が範囲内なら今日を使用
  const dayCount =
    viewType === 'week' ? 7 : isMultiDayView(viewType) ? getMultiDayCount(viewType) : 1;

  const today = new Date();
  const startOfViewed = new Date(viewedDate);
  startOfViewed.setHours(0, 0, 0, 0);
  const endOfRange = new Date(startOfViewed);
  endOfRange.setDate(startOfViewed.getDate() + dayCount);

  const todayStart = new Date(today);
  todayStart.setHours(0, 0, 0, 0);

  if (todayStart >= startOfViewed && todayStart < endOfRange) {
    return today;
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
    top: Math.max(0, targetY - containerHeight / 3),
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

  /** 指定時刻にブロックを配置 */
  const placeBlock = useCallback(
    (params: { tagId: string; tagName: string; startTime: Date; durationMinutes: number }) => {
      const end = new Date(params.startTime.getTime() + params.durationMinutes * 60 * 1000);

      // キャッシュから事前重複チェック（楽観的更新でカードが一瞬現れるのを防ぐ）
      if (hasOverlapInCache(queryClient, params.startTime, end)) {
        const timeStr = formatHHmm(params.startTime);
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
            const timeStr = formatHHmm(params.startTime);
            toast.success(t('sidebar.palette.placed', { name: params.tagName, time: timeStr }), {
              duration: 5000,
              action: {
                label: t('common.undo'),
                onClick: () => {
                  deleteEntry.mutate({ id: newEntry.id });
                },
              },
            });

            // 自動スクロール
            scrollCalendarToTime(params.startTime.getHours(), params.startTime.getMinutes());
          },
        },
      );
    },
    [createEntry, deleteEntry, queryClient, t],
  );

  /** カレンダー表示日の現在時刻にブロックを配置（週表示で今日が範囲内なら今日に配置） */
  const placeBlockNow = useCallback(
    (tagId: string, durationMinutes: number, tagName: string) => {
      const { viewedDate, viewType } = useCalendarNavigationStore.getState();
      const targetDate = resolveTargetDate(viewedDate, viewType);
      const startTime = snapToNextInterval(applyTimeToDate(targetDate));
      placeBlock({
        tagId,
        tagName,
        startTime,
        durationMinutes,
      });
    },
    [placeBlock],
  );

  return { placeBlock, placeBlockNow };
}

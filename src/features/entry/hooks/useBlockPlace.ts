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

import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { snapToNextInterval } from '@/lib/time-utils';
import { useCalendarNavigationStore } from '@/stores/useCalendarNavigationStore';

import { useEntryMutations } from './useEntryMutations';
import { useEntryTags } from './useEntryTags';

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

/** 指定時刻にブロック（エントリ + タグ）を配置するフック */
export function useBlockPlace() {
  const { createEntry, deleteEntry } = useEntryMutations();
  const { setEntryTags } = useEntryTags();
  const t = useTranslations();

  /** 指定時刻にブロックを配置 */
  const placeBlock = useCallback(
    (params: { tagId: string; tagName: string; startTime: Date; durationMinutes: number }) => {
      const end = new Date(params.startTime.getTime() + params.durationMinutes * 60 * 1000);
      createEntry.mutate(
        {
          title: params.tagName,
          start_time: params.startTime.toISOString(),
          end_time: end.toISOString(),
          duration_minutes: params.durationMinutes,
        },
        {
          onSuccess: (newEntry) => {
            void setEntryTags(newEntry.id, params.tagId).then((ok) => {
              if (!ok) toast.error(t('sidebar.palette.tagAssignFailed'));
            });

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
    [createEntry, deleteEntry, setEntryTags, t],
  );

  /** カレンダー表示日の現在時刻にブロックを配置 */
  const placeBlockNow = useCallback(
    (tagId: string, durationMinutes: number, tagName: string) => {
      const viewedDate = useCalendarNavigationStore.getState().viewedDate;
      const startTime = snapToNextInterval(applyTimeToDate(viewedDate));
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

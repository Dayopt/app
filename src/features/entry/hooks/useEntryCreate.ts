'use client';

/**
 * エントリ作成フロー統合 hook
 *
 * EntryCreateTrigger の共通ロジック:
 * - 空きスロット検索（15分単位、最大2時間先）
 * - エントリ作成 → Inspector を開く
 */

import { useCallback } from 'react';

import { useTranslations } from 'next-intl';

import { logger } from '@/lib/logger';
import { snapToNextInterval } from '@/lib/time-utils';
import { toast } from '@/lib/toast';
import { api } from '@/platform/trpc';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import { useEntryMutations } from './useEntryMutations';

import { useEntryInspectorStore } from '../stores/useEntryInspectorStore';

interface UseEntryCreateOptions {
  /** 作成後のコールバック */
  onSuccess?: (() => void) | undefined;
}

/** エントリ作成フローを統合したフック（空きスロット検索→作成→Inspectorオープン）
 * @param options - onSuccess: 作成後コールバック
 * @returns create: 初期日付を受け取りエントリを作成する関数
 */
export function useEntryCreate({ onSuccess }: UseEntryCreateOptions = {}) {
  const t = useTranslations();
  const openInspector = useEntryInspectorStore((s) => s.openInspector);
  const { createEntry } = useEntryMutations();
  const utils = api.useUtils();
  const timezone = useCalendarSettingsStore((state) => state.timezone);

  /** 時間重複チェック（TanStack Query キャッシュベース） */
  const checkOverlap = useCallback(
    (start: Date, end: Date): boolean => {
      const entries = utils.entries.list.getData();
      if (!entries || entries.length === 0) return false;

      return entries.some((e) => {
        if (!e.start_time || !e.end_time) return false;
        const eStart = new Date(e.start_time);
        const eEnd = new Date(e.end_time);
        return eStart < end && eEnd > start;
      });
    },
    [utils.entries.list],
  );

  /** 空き時間を探す（最大2時間先まで、15分刻み） */
  const findAvailableSlot = useCallback(
    (baseTime: Date): { start: Date; end: Date } => {
      let start = snapToNextInterval(baseTime);
      let end = new Date(start.getTime() + 60 * 60 * 1000);

      for (let i = 0; i < 8; i++) {
        if (!checkOverlap(start, end)) {
          return { start, end };
        }
        start = new Date(start.getTime() + 15 * 60 * 1000);
        end = new Date(end.getTime() + 15 * 60 * 1000);
      }

      return {
        start: snapToNextInterval(baseTime),
        end: new Date(snapToNextInterval(baseTime).getTime() + 60 * 60 * 1000),
      };
    },
    [checkOverlap],
  );

  /** エントリ作成（空きスロット検索 + Inspector を開く） */
  const create = useCallback(
    async (initialDate?: Date) => {
      // initialDate が渡された場合はそのまま使用。
      // 未指定時は現在時刻（UTC）を基準にするが、
      // snapToNextInterval が UTC ISO を扱うため toISOString() で渡すのが正しい。
      const baseDate = initialDate ?? new Date();
      const { start, end } = findAvailableSlot(baseDate);

      // カレンダーに選択範囲を表示（ユーザーTZで解釈された時刻をイベントに渡す）
      window.dispatchEvent(
        new CustomEvent('calendar-show-selection', {
          detail: {
            date: start,
            startHour: start.getHours(),
            startMinute: start.getMinutes(),
            endHour: end.getHours(),
            endMinute: end.getMinutes(),
            timezone,
          },
        }),
      );

      try {
        const result = await createEntry.mutateAsync({
          title: '',
          start_time: start.toISOString(),
          end_time: end.toISOString(),
        });
        if (result?.id) {
          openInspector(result.id);
        }
      } catch (error) {
        logger.error('Failed to create entry:', error);
        toast.error(t('entry.inspector.toast.createFailed'));
      }
      onSuccess?.();
    },
    [findAvailableSlot, createEntry, openInspector, onSuccess, timezone, t],
  );

  return { create };
}

'use client';

import { useCallback } from 'react';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { useTimeModelWriteMutations } from '@/features/entry';
import { toast } from '@/lib/toast';

import { buildCalendarReviewPanelPath } from '../../lib/panel-url';
import type { CalendarEvent } from '../../types/calendar.types';

/**
 * コンテキストメニューで使用する plan / log 操作アクションを提供するフック
 *
 * plan ⇄ log 変換（markUnplanned / restorePlanned）は time model に procedure が
 * 存在しないため提供しない（entry-menu-items 側で該当 handler が undefined なら表示されない）。
 */
export function useEntryContextActions() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const { deleteLog, deletePlan, skipPlan, unskipPlan } = useTimeModelWriteMutations();

  const handleDeleteEntry = useCallback(
    (entry: CalendarEvent) => {
      if ((entry.kind ?? 'plan') === 'plan') {
        deletePlan.mutate({ id: entry.id });
      } else {
        deleteLog.mutate({ id: entry.id });
      }
    },
    [deletePlan, deleteLog],
  );

  const handleViewStats = useCallback(
    (entry: CalendarEvent) => {
      if (!entry.tagId) return;
      router.push(
        buildCalendarReviewPanelPath(
          locale,
          entry.startDate ?? entry.actualStartDate ?? new Date(),
          entry.tagId,
        ),
      );
    },
    [router, locale],
  );

  const handleSkip = useCallback(
    (entry: CalendarEvent) => {
      if (entry.kind !== 'plan') return;
      skipPlan.mutate(
        { id: entry.id },
        { onSuccess: () => toast.success(t('entry.timeModel.toast.skipped')) },
      );
    },
    [skipPlan, t],
  );

  const handleUnskip = useCallback(
    (entry: CalendarEvent) => {
      if (entry.kind !== 'plan') return;
      unskipPlan.mutate(
        { id: entry.id },
        { onSuccess: () => toast.success(t('entry.timeModel.toast.unskipped')) },
      );
    },
    [unskipPlan, t],
  );

  return {
    handleDeleteEntry,
    handleViewStats,
    handleSkip,
    handleUnskip,
  };
}

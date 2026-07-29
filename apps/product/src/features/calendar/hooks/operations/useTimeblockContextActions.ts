'use client';

import { useCallback } from 'react';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { useTimeblockWriteMutations } from '@/features/timeblock';
import { toast } from '@/lib/toast';

import { buildCalendarReviewPanelPath } from '../../lib/panel-url';
import type { CalendarEvent } from '../../types/calendar.types';
import { useCalendarNavigation } from '../navigation/CalendarNavigationContext';

/**
 * コンテキストメニューで使用する plan / record 操作アクションを提供するフック
 *
 * plan ⇄ record 変換（markUnplanned / restorePlanned）は time model に procedure が
 * 存在しないため提供しない（entry-menu-items 側で該当 handler が undefined なら表示されない）。
 */
export function useTimeblockContextActions() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations();
  const navigation = useCalendarNavigation();
  const { deleteRecord, deletePlan, skipPlan, unskipPlan } = useTimeblockWriteMutations();

  const handleDeleteTimeblock = useCallback(
    (entry: CalendarEvent) => {
      if (entry.recordSource === 'auto_migrated') return;
      if ((entry.kind ?? 'plan') === 'plan') {
        deletePlan.mutate({ id: entry.id, expectedUpdatedAt: entry.version });
      } else {
        deleteRecord.mutate({ id: entry.id, expectedUpdatedAt: entry.version });
      }
    },
    [deletePlan, deleteRecord],
  );

  const handleViewStats = useCallback(
    (entry: CalendarEvent) => {
      if (!entry.tagId) return;
      if (navigation) {
        navigation.setPanelKind('review', { reviewTagId: entry.tagId });
        return;
      }

      router.push(
        buildCalendarReviewPanelPath(
          locale,
          entry.startDate ?? entry.actualStartDate ?? new Date(),
          entry.tagId,
        ),
      );
    },
    [navigation, router, locale],
  );

  const handleSkip = useCallback(
    (entry: CalendarEvent) => {
      if (entry.kind !== 'plan') return;
      skipPlan.mutate(
        { id: entry.id, expectedUpdatedAt: entry.version },
        { onSuccess: () => toast.success(t('timeblock.editor.toast.skipped')) },
      );
    },
    [skipPlan, t],
  );

  const handleUnskip = useCallback(
    (entry: CalendarEvent) => {
      if (entry.kind !== 'plan') return;
      unskipPlan.mutate(
        { id: entry.id, expectedUpdatedAt: entry.version },
        { onSuccess: () => toast.success(t('timeblock.editor.toast.unskipped')) },
      );
    },
    [unskipPlan, t],
  );

  return {
    handleDeleteTimeblock,
    handleViewStats,
    handleSkip,
    handleUnskip,
  };
}

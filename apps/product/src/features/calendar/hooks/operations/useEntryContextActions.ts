'use client';

import { useCallback } from 'react';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

import { useEntryMutations } from '@/features/entry';
import { buildCalendarReviewPanelPath } from '../../lib/panel-url';
import type { CalendarEvent } from '../../types/calendar.types';

/** コンテキストメニューで使用するエントリー操作アクションを提供するフック */
export function useEntryContextActions() {
  const router = useRouter();
  const locale = useLocale();
  const {
    deleteEntry,
    convertPlannedToUnplanned,
    convertUnplannedToPlanned,
    skipEntry,
    unskipEntry,
  } = useEntryMutations();

  const handleDeleteEntry = useCallback(
    (entry: CalendarEvent) => {
      deleteEntry.mutate({ id: entry.id });
    },
    [deleteEntry],
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

  const handleMarkUnplanned = useCallback(
    (entry: CalendarEvent) => {
      convertPlannedToUnplanned.mutate({ id: entry.id });
    },
    [convertPlannedToUnplanned],
  );

  const handleRestorePlanned = useCallback(
    (entry: CalendarEvent) => {
      convertUnplannedToPlanned.mutate({ id: entry.id });
    },
    [convertUnplannedToPlanned],
  );

  const handleSkip = useCallback(
    (entry: CalendarEvent) => {
      skipEntry.mutate({ id: entry.id });
    },
    [skipEntry],
  );

  const handleUnskip = useCallback(
    (entry: CalendarEvent) => {
      unskipEntry.mutate({ id: entry.id });
    },
    [unskipEntry],
  );

  return {
    handleDeleteEntry,
    handleViewStats,
    handleMarkUnplanned,
    handleRestorePlanned,
    handleSkip,
    handleUnskip,
  };
}

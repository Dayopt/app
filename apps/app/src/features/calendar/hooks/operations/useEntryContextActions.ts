'use client';

import { useCallback } from 'react';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';

import { useEntryMutations } from '@/features/entry';
import type { CalendarEvent } from '../../types/calendar.types';

/** コンテキストメニューで使用するエントリー操作アクションを提供するフック */
export function useEntryContextActions() {
  const router = useRouter();
  const locale = useLocale();
  const { deleteEntry, convertPlannedToUnplanned, convertUnplannedToPlanned } = useEntryMutations();

  const handleDeleteEntry = useCallback(
    (entry: CalendarEvent) => {
      deleteEntry.mutate({ id: entry.id });
    },
    [deleteEntry],
  );

  const handleViewStats = useCallback(
    (entry: CalendarEvent) => {
      if (!entry.tagId) return;
      router.push(`/${locale}/review/tags/${entry.tagId}`);
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

  return {
    handleDeleteEntry,
    handleViewStats,
    handleMarkUnplanned,
    handleRestorePlanned,
  };
}

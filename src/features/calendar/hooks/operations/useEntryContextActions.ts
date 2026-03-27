'use client';

import { useCallback } from 'react';

import { useEntryMutations } from '@/features/entry';
import type { CalendarEvent } from '../../types/calendar.types';

/** コンテキストメニューで使用するエントリー削除アクションを提供するフック */
export function useEntryContextActions() {
  const { deleteEntry } = useEntryMutations();

  const handleDeleteEntry = useCallback(
    (entry: CalendarEvent) => {
      deleteEntry.mutate({ id: entry.id });
    },
    [deleteEntry],
  );

  return {
    handleDeleteEntry,
  };
}

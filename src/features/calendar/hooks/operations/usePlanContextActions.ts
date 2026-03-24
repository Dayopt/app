'use client';

import { useCallback } from 'react';

import { useEntryMutations } from '@/features/entry';
import type { CalendarEvent } from '../../types/calendar.types';

/** コンテキストメニューで使用するプラン削除アクションを提供するフック */
export function usePlanContextActions() {
  const { deleteEntry } = useEntryMutations();

  const handleDeletePlan = useCallback(
    (plan: CalendarEvent) => {
      deleteEntry.mutate({ id: plan.id });
    },
    [deleteEntry],
  );

  return {
    handleDeletePlan,
  };
}

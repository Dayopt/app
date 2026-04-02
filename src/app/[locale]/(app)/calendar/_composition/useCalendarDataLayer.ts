'use client';

/**
 * Calendar Data Layer Hook
 *
 * データ取得・フィルタリング・エラー通知を担当。
 * viewDateRange / filteredEvents / allCalendarEvents を安定オブジェクトで返す。
 */

import { useEffect, useMemo } from 'react';

import type { CalendarEvent, CalendarViewType, ViewDateRange } from '@/features/calendar';
import { useCalendarData } from '@/features/calendar';
import { logger } from '@/lib/logger';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

// =============================================================================
// Types
// =============================================================================

export interface CalendarDataLayerInput {
  viewType: CalendarViewType;
  currentDate: Date;
}

export interface CalendarDataLayerResult {
  viewDateRange: ViewDateRange;
  filteredEvents: CalendarEvent[];
  allCalendarEvents: CalendarEvent[];
}

// =============================================================================
// Hook
// =============================================================================

export function useCalendarDataLayer({
  viewType,
  currentDate,
}: CalendarDataLayerInput): CalendarDataLayerResult {
  const tError = useTranslations('calendar.error');

  const { viewDateRange, filteredEvents, allCalendarEvents, entriesError } = useCalendarData({
    viewType,
    currentDate,
  });

  // エントリ取得エラー時にtoast通知
  useEffect(() => {
    if (entriesError) {
      logger.error('[useCalendarDataLayer] entries fetch error', entriesError);
      toast.error(tError('entriesLoadFailed'));
    }
  }, [entriesError, tError]);

  return useMemo(
    () => ({
      viewDateRange,
      filteredEvents,
      allCalendarEvents,
    }),
    [viewDateRange, filteredEvents, allCalendarEvents],
  );
}

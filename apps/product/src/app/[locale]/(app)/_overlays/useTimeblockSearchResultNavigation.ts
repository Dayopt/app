'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

import {
  buildTimeblockSearchResultPath,
  resolveTimeblockSearchResultDate,
  type TimeblockSearchResult,
} from '@/features/calendar';

interface CalendarSearchNavigation {
  currentDate: Date;
  navigateToDate: (date: Date) => void;
}

interface PendingSearchNavigation {
  targetDate: Date;
  targetPath: string;
}

interface UseTimeblockSearchResultNavigationOptions {
  calendarNavigation: CalendarSearchNavigation | null;
  locale: string;
  timezone: string;
  timeblockSearchOpen: boolean;
  isInspectorOpen: boolean;
}

/** Calendar の描画日を確定してから検索結果の URL と Inspector を公開する。 */
export function useTimeblockSearchResultNavigation({
  calendarNavigation,
  locale,
  timezone,
  timeblockSearchOpen,
  isInspectorOpen,
}: UseTimeblockSearchResultNavigationOptions) {
  const router = useRouter();
  const pendingNavigationRef = useRef<PendingSearchNavigation | null>(null);

  useEffect(() => {
    const pendingNavigation = pendingNavigationRef.current;
    if (
      !pendingNavigation ||
      !calendarNavigation ||
      timeblockSearchOpen ||
      isInspectorOpen ||
      calendarNavigation.currentDate.getTime() !== pendingNavigation.targetDate.getTime()
    ) {
      return;
    }

    // ref を先に消費し、Next の履歴同期が再レンダーしても履歴を複数回追加しない。
    pendingNavigationRef.current = null;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath !== pendingNavigation.targetPath) {
      window.history.pushState(null, '', pendingNavigation.targetPath);
    }
  }, [calendarNavigation, isInspectorOpen, timeblockSearchOpen]);

  return useCallback(
    (result: TimeblockSearchResult) => {
      const targetDate = resolveTimeblockSearchResultDate(result.startAt, timezone);
      const targetPath = buildTimeblockSearchResultPath({
        locale,
        startAt: result.startAt,
        timezone,
        timeblockId: result.id,
        kind: result.kind,
      });

      // GlobalOverlays は CalendarNavigationProvider 配下だが、型上の null fallback は維持する。
      if (!calendarNavigation) {
        router.push(targetPath);
        return;
      }

      pendingNavigationRef.current = { targetDate, targetPath };
      if (calendarNavigation.currentDate.getTime() !== targetDate.getTime()) {
        calendarNavigation.navigateToDate(targetDate);
      }
    },
    [calendarNavigation, locale, router, timezone],
  );
}

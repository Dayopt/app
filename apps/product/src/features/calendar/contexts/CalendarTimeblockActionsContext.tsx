'use client';

/**
 * CalendarTimeblockActionsContext
 *
 * エントリ操作ハンドラ（click, update, delete, timeRangeSelect）を提供する。
 * CalendarController で Provider を設置し、View以下のコンポーネントが
 * props drilling なしでアクセスできるようにする。
 */

import { createContext } from 'react';

import type { CalendarEvent } from '../types/calendar.types';

interface CalendarEntryActions {
  onEntryClick?: ((entry: CalendarEvent) => void) | undefined;
  onEntryContextMenu?: ((entry: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  onUpdateEntry?:
    | ((
        timeblockIdOrTimeblock: string | CalendarEvent,
        updates?: {
          startTime: Date;
          endTime: Date;
          resetActualTime?: boolean;
        },
      ) => void | Promise<void> | Promise<{ skipToast: true } | void>)
    | undefined;
  onDeleteTimeblock?: ((timeblockId: string) => void) | undefined;
  onTimeRangeSelect?:
    | ((selection: {
        date: Date;
        startHour: number;
        startMinute: number;
        endHour: number;
        endMinute: number;
      }) => void)
    | undefined;
  disabledTimeblockId?: string | null | undefined;
}

const CalendarTimeblockActionsContext = createContext<CalendarEntryActions>({});

export function CalendarTimeblockActionsProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: CalendarEntryActions;
}) {
  return (
    <CalendarTimeblockActionsContext.Provider value={value}>
      {children}
    </CalendarTimeblockActionsContext.Provider>
  );
}

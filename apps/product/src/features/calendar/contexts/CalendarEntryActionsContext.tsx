'use client';

/**
 * CalendarEntryActionsContext
 *
 * エントリ操作ハンドラ（click, update, delete, timeRangeSelect）を提供する。
 * CalendarController で Provider を設置し、View以下のコンポーネントが
 * props drilling なしでアクセスできるようにする。
 */

import { createContext, useContext } from 'react';

import type { CalendarEvent } from '../types/calendar.types';

export interface CalendarEntryActions {
  onEntryClick?: ((entry: CalendarEvent) => void) | undefined;
  onEntryContextMenu?: ((entry: CalendarEvent, e: React.MouseEvent) => void) | undefined;
  onUpdateEntry?:
    | ((
        entryIdOrEntry: string | CalendarEvent,
        updates?: {
          startTime: Date;
          endTime: Date;
          resetActualTime?: boolean;
          keepActualTime?: boolean;
        },
      ) => void | Promise<void> | Promise<{ skipToast: true } | void>)
    | undefined;
  onDeleteEntry?: ((entryId: string) => void) | undefined;
  onTimeRangeSelect?:
    | ((selection: {
        date: Date;
        startHour: number;
        startMinute: number;
        endHour: number;
        endMinute: number;
      }) => void)
    | undefined;
  disabledEntryId?: string | null | undefined;
}

const CalendarEntryActionsContext = createContext<CalendarEntryActions>({});

export function CalendarEntryActionsProvider({
  children,
  value,
}: {
  children: React.ReactNode;
  value: CalendarEntryActions;
}) {
  return (
    <CalendarEntryActionsContext.Provider value={value}>
      {children}
    </CalendarEntryActionsContext.Provider>
  );
}

export function useCalendarEntryActions(): CalendarEntryActions {
  return useContext(CalendarEntryActionsContext);
}

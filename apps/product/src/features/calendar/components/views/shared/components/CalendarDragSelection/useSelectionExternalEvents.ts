'use client';

/**
 * ドラッグ選択の外部 custom event 購読
 *
 * calendar-drag-cancel / calendar-show-selection を購読して
 * useDragSelection の reducer へ橋渡しする。
 */

import { useEffect } from 'react';

import type { SelectionAction } from './selection-reducer';

export function useSelectionExternalEvents(
  date: Date,
  dispatch: React.Dispatch<SelectionAction>,
  clearTimer: () => void,
): void {
  useEffect(() => {
    const onCancel = () => {
      clearTimer();
      dispatch({ type: 'CANCEL' });
    };
    const onShowSelection = (e: CustomEvent) => {
      const { date: eventDate, startHour, startMinute, endHour, endMinute } = e.detail;
      if (new Date(eventDate).toDateString() === date.toDateString()) {
        dispatch({
          type: 'SHOW_EXTERNAL',
          selection: { startHour, startMinute, endHour, endMinute },
        });
      }
    };
    window.addEventListener('calendar-drag-cancel', onCancel);
    window.addEventListener('calendar-show-selection', onShowSelection as EventListener);
    return () => {
      window.removeEventListener('calendar-drag-cancel', onCancel);
      window.removeEventListener('calendar-show-selection', onShowSelection as EventListener);
    };
  }, [date, dispatch, clearTimer]);
}

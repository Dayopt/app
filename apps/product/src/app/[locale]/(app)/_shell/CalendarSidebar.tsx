'use client';

import { MiniCalendar } from '@/components/ui/mini-calendar';
import { CalendarFilterList, useCalendarNavigation, ViewSwitcherList } from '@/features/calendar';

/**
 * Calendar モード Sidebar 中身
 *
 * MiniCalendar (PC) + ViewSwitcherList (Mobile) + CalendarFilterList で構成。
 * useCalendarNavigation は CalendarNavigationProvider (base-layout-content.tsx)
 * 経由で state を取得するため、本 component が mount/unmount しても state は保持される。
 */
export function CalendarSidebar() {
  const navigation = useCalendarNavigation();

  return (
    <>
      <div className="hidden px-2 md:block">
        <MiniCalendar
          selectedDate={navigation?.currentDate}
          onDateSelect={(date) => {
            if (date && navigation) navigation.navigateToDate(date, true);
          }}
          // eslint-disable-next-line tailwindcss/no-arbitrary-value -- calc expression
          className="-mx-2 w-[calc(100%+16px)] bg-transparent"
        />
      </div>

      <div className="flex min-w-0 flex-col overflow-hidden px-2">
        <ViewSwitcherList />
        <CalendarFilterList />
      </div>
    </>
  );
}

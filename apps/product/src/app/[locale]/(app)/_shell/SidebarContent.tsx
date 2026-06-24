'use client';

/**
 * Sidebar Content (Composition Layer)
 *
 * Calendar を唯一の作業面として扱い、MiniCalendar + view switcher + tag filter を
 * Sidebar の標準内容として描画する。
 */

import { MiniCalendar } from '@/components/ui/inputs/mini-calendar';
import { CalendarFilterList, useCalendarNavigation, ViewSwitcherList } from '@/features/calendar';

import { SidebarUtilities } from './SidebarUtilities';

export function SidebarContent() {
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

      <SidebarUtilities />
    </>
  );
}

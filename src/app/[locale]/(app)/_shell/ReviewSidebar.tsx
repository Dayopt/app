'use client';

import { useStatsFilterStore } from '@/features/stats';
import { MiniCalendar } from '@/lib/components/ui/mini-calendar';

/**
 * Review モード Sidebar 中身
 *
 * MiniCalendar のみ表示。date は useStatsFilterStore と連動。
 */
export function ReviewSidebar() {
  const currentDate = useStatsFilterStore((s) => s.currentDate);
  const setCurrentDate = useStatsFilterStore((s) => s.setCurrentDate);

  return (
    <div className="hidden px-2 md:block">
      <MiniCalendar
        selectedDate={currentDate}
        onDateSelect={(date) => {
          if (date) setCurrentDate(date);
        }}
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- calc expression
        className="-mx-2 w-[calc(100%+16px)] bg-transparent"
      />
    </div>
  );
}

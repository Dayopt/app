'use client';

import { useStatsFilterStore } from '@/features/stats';
import { MiniCalendar } from '@/lib/components/ui/mini-calendar';

/**
 * Stats モード Sidebar 中身
 *
 * Phase 2-A 確定事項: MiniCalendar のみ表示 (Stats 独自タグフィルタは scope 外)。
 * date は useStatsFilterStore と連動。
 */
export function StatsSidebar() {
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

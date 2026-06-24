'use client';

import { MiniCalendar } from '@/components/ui/inputs/mini-calendar';
import { ReviewTagList, useReviewFilterStore } from '@/features/review';

/**
 * Review モード Sidebar 中身
 *
 * MiniCalendar + タグ詳細ナビゲーションを表示。date は useReviewFilterStore と連動。
 */
export function ReviewSidebar() {
  const currentDate = useReviewFilterStore((s) => s.currentDate);
  const setCurrentDate = useReviewFilterStore((s) => s.setCurrentDate);

  return (
    <>
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

      <div className="flex min-w-0 flex-col overflow-hidden px-2">
        <ReviewTagList />
      </div>
    </>
  );
}

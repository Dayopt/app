/**
 * 15分ごとの薄い点線コンポーネント
 */

'use client';

import { memo } from 'react';

import { useTimeGrid } from '../../hooks/useTimeGrid';

/** QuarterHourLines コンポーネントのプロパティ */
interface QuarterHourLinesProps {
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  className?: string;
}

/** 15分ごとの薄い点線を描画するコンポーネント */
export const QuarterHourLines = memo<QuarterHourLinesProps>(function QuarterHourLines({
  startHour = 0,
  endHour = 24,
  hourHeight = 72,
  className = '',
}) {
  const { hours } = useTimeGrid({ startHour, endHour, hourHeight });

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      {hours
        .map((hour) => [
          // 15分線
          <div
            key={`quarter-1-${hour.hour}`}
            className="border-border absolute w-full border-t border-dotted opacity-50"
            style={{
              top: `${hour.position + hourHeight / 4}px`,
            }}
          />,
          // 45分線
          <div
            key={`quarter-3-${hour.hour}`}
            className="border-border absolute w-full border-t border-dotted opacity-50"
            style={{
              top: `${hour.position + (hourHeight * 3) / 4}px`,
            }}
          />,
        ])
        .flat()}
    </div>
  );
});

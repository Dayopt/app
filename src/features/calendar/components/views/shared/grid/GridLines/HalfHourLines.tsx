/**
 * 30分ごとの薄い横線コンポーネント
 */

'use client';

import { memo } from 'react';

import { HALF_HOUR_LINE_COLOR } from '../../constants/grid.constants';
import { useTimeGrid } from '../../hooks/useTimeGrid';

/** HalfHourLines コンポーネントのプロパティ */
interface HalfHourLinesProps {
  startHour?: number;
  endHour?: number;
  hourHeight?: number;
  className?: string;
}

/** 30分ごとの薄い横線を描画するコンポーネント */
export const HalfHourLines = memo<HalfHourLinesProps>(function HalfHourLines({
  startHour = 0,
  endHour = 24,
  hourHeight = 72,
  className = '',
}) {
  const { hours } = useTimeGrid({ startHour, endHour, hourHeight });

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      {hours.map((hour) => (
        <div
          key={`half-${hour.hour}`}
          className={`absolute w-full border-t ${HALF_HOUR_LINE_COLOR}`}
          style={{
            top: `${hour.position + hourHeight / 2}px`,
          }}
        />
      ))}
    </div>
  );
});

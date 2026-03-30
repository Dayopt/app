/**
 * 現在時刻線コンポーネント
 *
 * 仕様:
 *   now-line (absolute, flex)
 *     ├── now-dot (6×6px, rounded-full)
 *     └── now-bar (h-0.5, flex-1)
 *   色: bg-foreground（テーマのforeground色）
 *   z-index: Z_INDEX.CURRENT_TIME (15)
 */

'use client';

import { memo, useMemo } from 'react';

import { tzIsSameDay } from '@/lib/date/timezone';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';
import { timeToPixels } from '../../../../../lib/grid';
import { CURRENT_TIME_DOT_SIZE, HOUR_HEIGHT, Z_INDEX } from '../../constants/grid.constants';
import { useCurrentTime } from '../../hooks/useCurrentTime';
import type { CurrentTimeLineProps } from '../../types/grid.types';

export const CurrentTimeLine = memo<CurrentTimeLineProps>(function CurrentTimeLine({
  hourHeight = HOUR_HEIGHT,
  className = '',
  showDot = true,
  updateInterval = 60000,
  displayDates,
  showOnOtherDays = true,
  viewMode: _viewMode = 'day',
  startHour = 0,
  endHour = 24,
  // timeColumnWidth / containerWidth は ScrollableCalendarLayout 側で制御するため不使用
  timeColumnWidth: _timeColumnWidth = 64,
  containerWidth: _containerWidth = 800,
}) {
  const currentTime = useCurrentTime({ updateInterval });
  const timezone = useCalendarSettingsStore((state) => state.timezone);

  // 現在時刻のY座標を計算
  const topPosition = timeToPixels(currentTime, hourHeight);

  // 今日が含まれているかチェック（ユーザーTZで判定）
  const hasToday = useMemo(() => {
    if (!displayDates || displayDates.length === 0) {
      return true;
    }
    const now = new Date();
    return displayDates.some((date) => tzIsSameDay(date, now, timezone));
  }, [displayDates, timezone]);

  // 今日の列位置を計算（複数日表示の場合）
  const columnInfo = useMemo(() => {
    if (!displayDates || displayDates.length <= 1) {
      return { left: 0, width: '100%', isToday: hasToday };
    }

    const now = new Date();
    const todayIndex = displayDates.findIndex((date) => tzIsSameDay(date, now, timezone));

    if (todayIndex === -1) {
      if (showOnOtherDays) {
        return { left: 0, width: '100%', isToday: false };
      }
      return null;
    }

    const columnWidthPct = 100 / displayDates.length;
    const leftPct = todayIndex * columnWidthPct;

    return {
      left: `${leftPct}%`,
      width: `${columnWidthPct}%`,
      isToday: true,
    };
  }, [displayDates, hasToday, showOnOtherDays, timezone]);

  // 表示範囲外なら非表示
  const currentHour = currentTime.getHours() + currentTime.getMinutes() / 60;
  if (currentHour < startHour || currentHour >= endHour) {
    return null;
  }

  if (!columnInfo) {
    return null;
  }

  const dotOffset = CURRENT_TIME_DOT_SIZE / 2;

  return (
    <div
      className={`pointer-events-none absolute ${className}`}
      style={{
        top: `${topPosition}px`,
        left: typeof columnInfo.left === 'number' ? `${columnInfo.left}px` : columnInfo.left,
        width: columnInfo.width,
        zIndex: Z_INDEX.CURRENT_TIME,
      }}
      aria-hidden="true"
    >
      {/* now-line: dot + bar */}
      <div className="flex items-center">
        {/* now-dot */}
        {showDot && columnInfo.isToday && (
          <div
            className="bg-foreground shrink-0 rounded-full"
            style={{
              width: `${CURRENT_TIME_DOT_SIZE}px`,
              height: `${CURRENT_TIME_DOT_SIZE}px`,
              marginLeft: `-${dotOffset}px`,
            }}
          />
        )}

        {/* now-bar */}
        <div className={`bg-foreground h-0.5 flex-1 ${columnInfo.isToday ? '' : 'opacity-40'}`} />
      </div>
    </div>
  );
});

/**
 * 列専用の現在時刻線（DayColumn内で使用）
 */
export const CurrentTimeLineForColumn = memo<{
  hourHeight?: number;
  showDot?: boolean;
  className?: string;
  isToday?: boolean;
  showOnOtherDays?: boolean;
  /** 表示範囲（開始時間, 0-24） */
  startHour?: number;
  /** 表示範囲（終了時間, 0-24） */
  endHour?: number;
}>(function CurrentTimeLineForColumn({
  hourHeight = HOUR_HEIGHT,
  showDot = false,
  className = '',
  isToday = true,
  showOnOtherDays = true,
  startHour = 0,
  endHour = 24,
}) {
  const currentTime = useCurrentTime({ updateInterval: 60000 });

  const topPosition = timeToPixels(currentTime, hourHeight);

  // 表示範囲外なら非表示
  const currentHour = currentTime.getHours() + currentTime.getMinutes() / 60;
  if (currentHour < startHour || currentHour >= endHour) {
    return null;
  }

  if (!isToday && !showOnOtherDays) {
    return null;
  }

  const dotOffset = CURRENT_TIME_DOT_SIZE / 2;

  return (
    <div
      className={`pointer-events-none absolute right-0 left-0 ${className}`}
      style={{
        top: `${topPosition}px`,
        zIndex: Z_INDEX.CURRENT_TIME,
      }}
      aria-hidden="true"
    >
      <div className="flex items-center">
        {/* now-dot */}
        {showDot && isToday && (
          <div
            className="bg-foreground shrink-0 rounded-full"
            style={{
              width: `${CURRENT_TIME_DOT_SIZE}px`,
              height: `${CURRENT_TIME_DOT_SIZE}px`,
              marginLeft: `-${dotOffset}px`,
            }}
          />
        )}

        {/* now-bar */}
        <div className={`bg-foreground h-0.5 flex-1 ${isToday ? '' : 'opacity-40'}`} />
      </div>
    </div>
  );
});

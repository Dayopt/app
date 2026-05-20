/**
 * 現在時刻線コンポーネント
 *
 * 仕様:
 *   now-line (absolute, flex)
 *     ├── now-dot (6×6px, rounded-full)
 *     └── now-bar (h-0.5, flex-1)
 *   色: bg-now-indicator（テーマのforeground色）
 *   z-index: Z_INDEX.CURRENT_TIME (15)
 */

'use client';

import { memo, useMemo } from 'react';

import { convertToTimezone, tzIsSameDay } from '@/lib/date/timezone';
import { useUserPreferenceStore } from '@/lib/stores/useUserPreferenceStore';
import { timeToPixels } from '../../../../../lib/grid';
import type { CurrentTimeLineProps } from '../../../../../types/grid.types';
import { CURRENT_TIME_DOT_SIZE, HOUR_HEIGHT, Z_INDEX } from '../../constants/grid.constants';
import { useCurrentTime } from '../../hooks/useCurrentTime';

export const CurrentTimeLine = memo<CurrentTimeLineProps>(function CurrentTimeLine({
  hourHeight = HOUR_HEIGHT,
  className = '',
  showDot = true,
  updateInterval = 60000,
  displayDates,
  showOnOtherDays = false,
  viewMode: _viewMode = 'day',
  startHour = 0,
  endHour = 24,
  // timeColumnWidth / containerWidth は ScrollableCalendarLayout 側で制御するため不使用
  timeColumnWidth: _timeColumnWidth = 64,
  containerWidth: _containerWidth = 800,
}) {
  const rawTime = useCurrentTime({ updateInterval });
  const timezone = useUserPreferenceStore((state) => state.timezone);

  // ユーザーTZに変換してから位置計算（ブラウザTZと異なる場合に正しい位置を表示）
  const currentTime = useMemo(() => convertToTimezone(rawTime, timezone), [rawTime, timezone]);

  // 現在時刻のY座標を計算
  const topPosition = timeToPixels(currentTime, hourHeight);

  // 今日が含まれているかチェック（ユーザーTZで判定）
  const hasToday = useMemo(() => {
    if (!displayDates || displayDates.length === 0) {
      return true;
    }
    return displayDates.some((date) => tzIsSameDay(date, rawTime, timezone));
  }, [displayDates, rawTime, timezone]);

  // 今日の列インデックス（複数日表示の場合）
  const todayIndex = useMemo(() => {
    if (!displayDates || displayDates.length <= 1) return -1;
    return displayDates.findIndex((date) => tzIsSameDay(date, rawTime, timezone));
  }, [displayDates, rawTime, timezone]);

  // 表示範囲外なら非表示
  const currentHour = currentTime.getHours() + currentTime.getMinutes() / 60;
  if (currentHour < startHour || currentHour >= endHour) {
    return null;
  }

  const dotOffset = CURRENT_TIME_DOT_SIZE / 2;
  const isMultiDay = displayDates && displayDates.length > 1;

  // 複数日表示: 全列に線を引き、本日だけ強調
  if (isMultiDay) {
    if (todayIndex === -1 && !showOnOtherDays) return null;

    return (
      <div
        className={`pointer-events-none absolute left-0 w-full ${className}`}
        style={{
          top: `${topPosition}px`,
          zIndex: Z_INDEX.CURRENT_TIME,
        }}
        aria-hidden="true"
      >
        <div className="flex items-center">
          {displayDates.map((date, i) => {
            const isToday = i === todayIndex;
            return (
              <div key={date.toISOString()} className="flex flex-1 items-center">
                {isToday && showDot && (
                  <div
                    className="bg-now-indicator shrink-0 rounded-full"
                    style={{
                      width: `${CURRENT_TIME_DOT_SIZE}px`,
                      height: `${CURRENT_TIME_DOT_SIZE}px`,
                      marginLeft: `-${dotOffset}px`,
                    }}
                  />
                )}
                <div
                  className={`h-0.5 flex-1 ${isToday ? 'bg-now-indicator' : 'bg-now-indicator-muted'}`}
                />
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 単日表示
  if (!hasToday && !showOnOtherDays) return null;

  return (
    <div
      className={`pointer-events-none absolute left-0 w-full ${className}`}
      style={{
        top: `${topPosition}px`,
        zIndex: Z_INDEX.CURRENT_TIME,
      }}
      aria-hidden="true"
    >
      <div className="flex items-center">
        {showDot && hasToday && (
          <div
            className="bg-now-indicator shrink-0 rounded-full"
            style={{
              width: `${CURRENT_TIME_DOT_SIZE}px`,
              height: `${CURRENT_TIME_DOT_SIZE}px`,
              marginLeft: `-${dotOffset}px`,
            }}
          />
        )}
        <div
          className={`h-0.5 flex-1 ${hasToday ? 'bg-now-indicator' : 'bg-now-indicator-muted'}`}
        />
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
  showOnOtherDays = false,
  startHour = 0,
  endHour = 24,
}) {
  const rawTime = useCurrentTime({ updateInterval: 60000 });
  const timezone = useUserPreferenceStore((state) => state.timezone);

  // ユーザーTZに変換
  const currentTime = useMemo(() => convertToTimezone(rawTime, timezone), [rawTime, timezone]);

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
            className="bg-now-indicator shrink-0 rounded-full"
            style={{
              width: `${CURRENT_TIME_DOT_SIZE}px`,
              height: `${CURRENT_TIME_DOT_SIZE}px`,
              marginLeft: `-${dotOffset}px`,
            }}
          />
        )}

        {/* now-bar */}
        <div
          className={`h-0.5 flex-1 ${isToday ? 'bg-now-indicator' : 'bg-now-indicator-muted'}`}
        />
      </div>
    </div>
  );
});

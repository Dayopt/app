/**
 * 睡眠時間帯のレイアウト計算
 *
 * ScrollableCalendarLayoutから抽出したカスタムフック
 */

import { useMemo } from 'react';

/** 今日の列位置情報 */
interface TodayColumnPosition {
  left: string | number;
  width: string;
}

/** useSleepHoursLayout フックのオプション */
interface UseSleepHoursLayoutOptions {
  hourHeight: number;
  displayDates?: Date[] | undefined;
}

/** useSleepHoursLayout フックの戻り値 */
interface UseSleepHoursLayoutReturn {
  gridHeight: number;
  todayColumnPosition: TodayColumnPosition | null;
  hasToday: boolean;
}

/**
 * カレンダーグリッドのレイアウト計算フック
 */
export const useSleepHoursLayout = ({
  hourHeight,
  displayDates = [],
}: UseSleepHoursLayoutOptions): UseSleepHoursLayoutReturn => {
  // グリッド高さ
  const gridHeight = 24 * hourHeight;

  // 今日の列の位置を計算
  const todayColumnPosition = useMemo((): TodayColumnPosition | null => {
    if (displayDates.length === 0) {
      return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 今日のインデックスを見つける
    const todayIndex = displayDates.findIndex((date) => {
      if (!date) return false;
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === today.getTime();
    });

    if (todayIndex === -1) {
      return null;
    }

    // 単一日表示の場合
    if (displayDates.length === 1) {
      return {
        left: 0,
        width: '100%',
      };
    }

    // 複数日表示の場合、列の幅と位置を計算
    const columnWidth = 100 / displayDates.length; // パーセント
    const leftPosition = todayIndex * columnWidth; // パーセント

    return {
      left: `${leftPosition}%`,
      width: `${columnWidth}%`,
    };
  }, [displayDates]);

  // 今日が表示範囲に含まれるか
  const hasToday = todayColumnPosition !== null;

  return {
    gridHeight,
    todayColumnPosition,
    hasToday,
  };
};

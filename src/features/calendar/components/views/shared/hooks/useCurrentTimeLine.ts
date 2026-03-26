/**
 * 現在時刻線のロジック
 *
 * ScrollableCalendarLayoutから抽出したカスタムフック
 */

import { useEffect, useMemo, useState } from 'react';

/** useCurrentTimeLine フックのオプション */
interface UseCurrentTimeLineOptions {
  hourHeight: number;
  showCurrentTime: boolean;
}

/** useCurrentTimeLine フックの戻り値 */
interface UseCurrentTimeLineReturn {
  currentTime: Date;
  currentTimePosition: number;
  currentTimeLineColor: string | null;
}

/**
 * 現在時刻線の位置を計算するフック
 *
 * 色は常に null を返し、呼び出し側で bg-primary にフォールバックする。
 */
export const useCurrentTimeLine = ({
  hourHeight,
  showCurrentTime,
}: UseCurrentTimeLineOptions): UseCurrentTimeLineReturn => {
  // 現在時刻の状態
  const [currentTime, setCurrentTime] = useState(new Date());

  // 現在時刻の位置を計算
  const currentTimePosition = useMemo(() => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const totalHours = hours + minutes / 60;
    return totalHours * hourHeight;
  }, [currentTime, hourHeight]);

  // 1分ごとに現在時刻を更新
  useEffect(() => {
    if (!showCurrentTime) return;

    const updateCurrentTime = () => setCurrentTime(new Date());
    updateCurrentTime(); // 初回実行

    const timer = setInterval(updateCurrentTime, 60000); // 1分ごと

    return () => clearInterval(timer);
  }, [showCurrentTime]);

  return {
    currentTime,
    currentTimePosition,
    currentTimeLineColor: null,
  };
};

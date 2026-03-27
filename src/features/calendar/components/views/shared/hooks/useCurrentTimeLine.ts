/**
 * 現在時刻線のロジック
 *
 * ScrollableCalendarLayoutから抽出したカスタムフック
 */

import { useEffect, useMemo, useState } from 'react';

import { getActiveZoneLevel, getChronotypeProfile } from '@/features/chronotype';
import { useCalendarSettingsStore } from '@/stores/useCalendarSettingsStore';

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
  /** 現在時刻が peak/dip ゾーン内にある場合のレベル */
  currentZone: 'peak' | 'dip' | null;
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

  // Chronotype ゾーン判定
  const chronotype = useCalendarSettingsStore((s) => s.chronotype);
  const currentZone = useMemo(() => {
    if (!chronotype.enabled) return null;
    const profile = getChronotypeProfile(chronotype.type, chronotype.customZones);
    const hour = currentTime.getHours() + currentTime.getMinutes() / 60;
    return getActiveZoneLevel(profile.productivityZones, hour);
  }, [chronotype, currentTime]);

  return {
    currentTime,
    currentTimePosition,
    currentTimeLineColor: null,
    currentZone,
  };
};

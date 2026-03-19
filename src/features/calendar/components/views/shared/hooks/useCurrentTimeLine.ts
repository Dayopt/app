/**
 * 現在時刻線のロジック
 *
 * ScrollableCalendarLayoutから抽出したカスタムフック
 */

import { useEffect, useMemo, useState } from 'react';

import {
  getChronotypeColor,
  getChronotypeProfile,
  getProductivityZoneForHour,
} from '@/features/chronotype';
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
}

/**
 * 現在時刻線の位置・色を計算するフック
 */
export const useCurrentTimeLine = ({
  hourHeight,
  showCurrentTime,
}: UseCurrentTimeLineOptions): UseCurrentTimeLineReturn => {
  // クロノタイプ設定
  const chronotype = useCalendarSettingsStore((state) => state.chronotype);

  // 現在時刻の状態
  const [currentTime, setCurrentTime] = useState(new Date());

  // 現在時刻の位置を計算
  const currentTimePosition = useMemo(() => {
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    const totalHours = hours + minutes / 60;
    return totalHours * hourHeight;
  }, [currentTime, hourHeight]);

  // 現在時刻のクロノタイプゾーン色を取得（セマンティックトークン）
  const currentTimeLineColor = useMemo(() => {
    if (!chronotype.enabled) {
      return null; // クロノタイプ無効時はデフォルト色（bg-primary）
    }

    const profile = getChronotypeProfile(chronotype.type, chronotype.customZones);
    const currentHour = currentTime.getHours();
    const zone = getProductivityZoneForHour(profile, currentHour);

    if (!zone) {
      return null;
    }

    // levelベースでクロノタイプ専用色（CSS変数）を取得
    return getChronotypeColor(zone.level);
  }, [chronotype.enabled, chronotype.type, chronotype.customZones, currentTime]);

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
    currentTimeLineColor,
  };
};

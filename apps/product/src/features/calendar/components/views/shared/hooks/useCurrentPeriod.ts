/**
 * 現在期間判定統一フック
 * 5パターンで重複していた期間判定ロジックを統合
 */

import { useMemo } from 'react';

import { isSameDay, isSameWeek } from 'date-fns';

import { useUserPreferences } from '@/lib/hooks/useUserPreferences';

import { getTodayIndex } from '../utils/dateHelpers';

/** useCurrentPeriod フックのオプション */
interface UseCurrentPeriodOptions {
  dates: Date[];
  referenceDate?: Date | undefined; // 基準日（デフォルト: 今日）
  periodType: 'day' | 'week' | 'threeday' | 'fiveday' | 'multiday';
  weekStartsOn?: 0 | 1 | 6 | undefined; // 週の開始日
}

/** useCurrentPeriod フックの戻り値 */
interface UseCurrentPeriodReturn {
  isCurrentPeriod: boolean;
  todayIndex: number; // -1 if not in period
  currentWeekIndex?: number | undefined; // 複数週ビューでのみ使用
  relativeDayIndex?: number | undefined; // MultiDayView(3day)でのみ使用（-1=昨日, 0=今日, 1=明日）
}

/**
 * 現在期間判定の統一フック
 *
 * @description
 * 以前は各ビューで異なるロジックで期間判定していたが、これで統一
 * - isCurrentWeek, isCurrentTwoWeeks, isCurrentDay, isCurrentPeriod を統合
 * - todayIndex計算も統一
 * - ビュー固有の追加情報も提供
 */
export function useCurrentPeriod({
  dates,
  referenceDate,
  periodType,
  weekStartsOn = 0,
}: UseCurrentPeriodOptions): UseCurrentPeriodReturn {
  const timezone = useUserPreferences((state) => state.timezone);

  // 今日が期間内のどこにあるかを計算（ユーザー TZ 基準）
  const todayIndex = useMemo(() => {
    return getTodayIndex(dates, timezone);
  }, [dates, timezone]);

  // 期間タイプごとの判定
  const isCurrentPeriod = useMemo(() => {
    const today = referenceDate || new Date();

    switch (periodType) {
      case 'day':
        return dates.some((date) => isSameDay(date, today));

      case 'week':
        return dates.some((date) => isSameWeek(date, today, { weekStartsOn }));

      case 'threeday':
      case 'fiveday':
      case 'multiday':
        // 日付範囲チェック：今日がdates配列の期間内にある
        return dates.some((date) => isSameDay(date, today));

      default:
        return false;
    }
  }, [dates, referenceDate, periodType, weekStartsOn]);

  // 複数週ビュー用: 今日がある週のインデックス（0: 第1週, 1: 第2週）
  const currentWeekIndex = useMemo(() => {
    if (todayIndex === -1) return undefined;
    return Math.floor(todayIndex / 7);
  }, [todayIndex]);

  // MultiDayView(3day)用: 中央日を基準とした相対インデックス
  const relativeDayIndex = useMemo(() => {
    if (periodType !== 'threeday' || todayIndex === -1) return undefined;
    return todayIndex - 1; // 中央が1なので、0=昨日, 1=今日, 2=明日 → -1, 0, 1
  }, [todayIndex, periodType]);

  return {
    isCurrentPeriod,
    todayIndex,
    currentWeekIndex,
    relativeDayIndex,
  };
}

import { useResponsiveHourHeight } from '../../shared/hooks/useResponsiveHourHeight';
import { useViewPlans } from '../../shared/hooks/useViewPlans';
import type { UseDayPlansOptions, UseDayPlansReturn } from '../DayView.types';

/**
 * DayView用のプラン処理フック
 * 共通のuseViewPlansを使用
 */
export function useDayPlans({ date, plans, timezone }: UseDayPlansOptions): UseDayPlansReturn {
  const hourHeight = useResponsiveHourHeight();
  return useViewPlans({ date, plans, hourHeight, timezone });
}

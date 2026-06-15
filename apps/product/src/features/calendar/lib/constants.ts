/**
 * カレンダーグリッドの密度設定
 *
 * 元々 features/calendar/components/views/shared/constants/grid.constants.ts に定義されていたが、
 * useCalendarSettings が features を跨いで使用するため、共有レイヤーに移動。
 *
 * Note: グリッドレイアウトの詳細定数（HOUR_HEIGHT, MIN_EVENT_HEIGHT 等）は
 * カレンダー機能内部にそのまま残る。ここではストアが型として必要な最小限のみ定義。
 */

/** 時間の高さ密度プリセット（デバイス × 密度ごとのピクセル値） */
export const HOUR_HEIGHT_DENSITIES = {
  compact: { mobile: 36, tablet: 40, desktop: 48 },
  default: { mobile: 48, tablet: 60, desktop: 72 },
  spacious: { mobile: 64, tablet: 80, desktop: 96 },
} as const;

/** 時間の高さ密度のキー型 */
export type HourHeightDensity = keyof typeof HOUR_HEIGHT_DENSITIES;

/** 複数日ビューで表示可能な日数（2〜9） */
export type MultiDayCount = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
/** 複数日ビューの型（例: '3day', '5day'） */
export type MultiDayViewType = `${MultiDayCount}day`;
/** カレンダービューの種類 */
export type CalendarViewType = 'day' | 'week' | MultiDayViewType;

/** MultiDayView（2day〜9day）かどうかを判定 */
export function isMultiDayView(view: CalendarViewType): view is MultiDayViewType {
  return /^\d+day$/.test(view) && view !== 'day';
}

/** MultiDayViewType から日数を取得 */
export function getMultiDayCount(view: MultiDayViewType): MultiDayCount {
  return parseInt(view) as MultiDayCount;
}

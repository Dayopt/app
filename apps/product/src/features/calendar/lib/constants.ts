/**
 * カレンダーグリッドの密度設定
 *
 * 元々 features/calendar/components/views/shared/constants/grid.constants.ts に定義されていたが、
 * useCalendarSettings が features を跨いで使用するため、共有レイヤーに移動。
 *
 * Note: グリッドレイアウトの詳細定数（HOUR_HEIGHT, MIN_EVENT_HEIGHT 等）は
 * カレンダー機能内部にそのまま残る。ここではストアが型として必要な最小限のみ定義。
 */

/**
 * 時間の高さ密度プリセット（viewport フィット（コンテナ実測高 / 24）に対する倍率）
 *
 * compact = 1.0 は 24h が正確にコンテナへフィットする（スクロールなし）。
 * default / spacious はその上の倍率で、意図的にスクロールを許容する。
 */
export const DENSITY_FACTOR = {
  compact: 1,
  default: 1.5,
  spacious: 2,
} as const;

/** 密度プリセットの最小可読高（px）— 極端に低いコンテナでのフロア */
export const MIN_LEGIBLE_HOUR_HEIGHT = 36;

/** 時間の高さ密度のキー型 */
export type HourHeightDensity = keyof typeof DENSITY_FACTOR;

/** 複数日ビューで表示可能な日数（2〜7） */
export type MultiDayCount = 2 | 3 | 4 | 5 | 6 | 7;
/** 複数日ビューの型（例: '3day', '5day'） */
export type MultiDayViewType = `${MultiDayCount}day`;
/** カレンダービューの種類 */
export type CalendarViewType = 'day' | 'week' | MultiDayViewType;

/** MultiDayView（2day〜7day）かどうかを判定 */
export function isMultiDayView(view: CalendarViewType): view is MultiDayViewType {
  return /^\d+day$/.test(view) && view !== 'day';
}

/** MultiDayViewType から日数を取得 */
export function getMultiDayCount(view: MultiDayViewType): MultiDayCount {
  return parseInt(view) as MultiDayCount;
}

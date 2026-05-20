/**
 * Calendar Domain — Calendar 固有の仕様ルール
 *
 * このディレクトリには Calendar UI の policy / view 仕様を表現する純粋関数・定数を置く。
 * React / DOM / Zustand / tRPC / DB 非依存。
 *
 * - `view-range.ts`: ビュータイプ（day / week / Nday）の日付範囲計算とピリオド移動
 * - `precision.ts`: drag snap / inspector input の時刻精度ポリシー
 *
 * 汎用計算（時間↔pixel 変換、レイアウト sweep-line、URL date 変換など）は
 * `features/calendar/lib/` に置く。
 */

export { calculateViewDateRange, getNextPeriod, getPreviousPeriod } from './view-range';

export {
  ALLOWED_DRAG_SNAP_MINUTES,
  DEFAULT_DRAG_SNAP_MINUTES,
  INSPECTOR_TIME_PRECISION_MINUTES,
} from './precision';
export type { DragSnapMinutes } from './precision';

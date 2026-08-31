/**
 * Calendar の時刻精度ポリシー
 *
 * 全操作（drag / resize / tap / Inspector / text input）を 1 分粒度で統一する。
 * かつては drag/tap = 粗い grid snap、Inspector = 1 分という非対称設計だったが、
 * #2496 で「時間の刻みは 1 分単位」に一本化した。
 *
 * snap 粒度と最小ブロック長は独立した概念として分離する:
 * - snap 粒度 1 分 = 時刻の「位置」をどこに置けるか
 * - 最小ブロック長 5 分 = ブロックの「長さ」の下限（誤操作での極小ブロック防止）
 */

/** Inspector / text input 専用の入力精度。 */
export const INSPECTOR_TIME_PRECISION_MINUTES = 1;

/** drag / resize / tap の snap 粒度。全操作 1 分で統一（#2496）。 */
export const DEFAULT_DRAG_SNAP_MINUTES = 1;

/** drag / resize で作成・変更できるブロック長の下限。snap 粒度とは独立。 */
export const MIN_TIMEBLOCK_DURATION_MINUTES = 5;

/**
 * ハプティック発火の境界間隔。
 *
 * snap が 1 分粒度になったため「snap 変化ごとに発火」では 1px 移動ごとに
 * 振動が連射される。5 分境界を跨いだ時だけ発火させる。
 */
export const HAPTIC_BOUNDARY_MINUTES = 5;

/** prev → next の移動が HAPTIC_BOUNDARY_MINUTES 境界を跨いだか（分単位で比較）。 */
export function crossedHapticBoundary(prevMinutes: number, nextMinutes: number): boolean {
  if (prevMinutes === nextMinutes) return false;
  return (
    Math.floor(prevMinutes / HAPTIC_BOUNDARY_MINUTES) !==
    Math.floor(nextMinutes / HAPTIC_BOUNDARY_MINUTES)
  );
}

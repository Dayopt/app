/**
 * Calendar の時刻精度ポリシー
 *
 * drag/tap = 粗い grid snap、Inspector/text input = 1 分粒度 という
 * 非対称設計の出発点となる定数。
 *
 * 設計意図: useUserPreferences.snapInterval は user 設定の選択肢。
 * そこに 1 を含めると「drag を 1 分 snap にする選択肢」が UI に滲むため、
 * 1 分粒度は内部 policy 定数として隔離する。
 *
 * @see apps/storybook/docs/product/projects/timeline-precision-redesign/overview.mdx
 */

/** Inspector / text input 専用。drag snap には絶対に使わない。 */
export const INSPECTOR_TIME_PRECISION_MINUTES = 1;

/** drag / resize の default snap。store 未設定時のフォールバック。 */
export const DEFAULT_DRAG_SNAP_MINUTES = 15;

/** user setting で選べる drag snap の値域。 */
export const ALLOWED_DRAG_SNAP_MINUTES = [5, 10, 15, 30] as const;

export type DragSnapMinutes = (typeof ALLOWED_DRAG_SNAP_MINUTES)[number];

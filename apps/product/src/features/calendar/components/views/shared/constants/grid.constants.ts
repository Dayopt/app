/**
 * グリッドシステムの定数定義
 */

/** 1時間の高さ（px）— SSRフォールバック用デフォルト */
export const HOUR_HEIGHT = 72; // 1時間の高さ(px) — SSRフォールバック用

// 密度プリセット — feature lib/constants から re-export
export { HOUR_HEIGHT_DENSITIES } from '../../../../lib/constants';

/** 時間列の幅（px） */
export const TIME_COLUMN_WIDTH = 56; // 時間列の幅(px)

/** 現在時刻ドットのサイズ（px） */
export const CURRENT_TIME_DOT_SIZE = 6; // 現在時刻のドットサイズ(px)

/** Z-index層の定義 */
export const Z_INDEX = {
  GRID_LINES: 0,
  EVENTS: 10,
  CURRENT_TIME: 29,
  DRAGGING: 30,
  POPOVER: 40,
  MODAL: 50,
} as const;

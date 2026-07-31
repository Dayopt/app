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

/**
 * Z-index層の定義（カレンダーグリッド内ローカル）
 *
 * これは CalendarGridContent のエントリ層（absolute + z-20）が作る
 * stacking context **内側**の数値空間で、tokens/z-index.css のグローバル
 * スケール（z-dropdown: 50 等）とは意図的に別。数値が同じでも競合しない。
 * グローバルスケールへ「統一」してはいけない — 例えば DRAGGING(30) を
 * z-calendar-drag(1000) に寄せると POPOVER(40) との大小関係が反転する。
 */
export const Z_INDEX = {
  EVENTS: 10,
  CURRENT_TIME: 29,
  DRAGGING: 30,
  POPOVER: 40,
} as const;

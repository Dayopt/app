/**
 * グリッドシステムの定数定義
 */

/** 1時間の高さ（px）— SSRフォールバック用デフォルト */
export const HOUR_HEIGHT = 72; // 1時間の高さ(px) — SSRフォールバック用

/** グリッド全体の時間数（gridHeight = HOURS_PER_DAY * hourHeight の canonical 定数） */
export const HOURS_PER_DAY = 24;

// 密度プリセット（viewport フィットへの倍率）— feature lib/constants から re-export
export { DENSITY_FACTOR, MIN_LEGIBLE_HOUR_HEIGHT } from '../../../../lib/constants';

/** 時間列の幅（px） */
export const TIME_COLUMN_WIDTH = 56; // 時間列の幅(px)

/**
 * モバイル版時間列の幅（px）
 * ラベルは右詰めのため、PC と同じ 56px だと短いラベル（"9:00" 等）の
 * 左側に余白が溜まる。8px グリッド準拠で縮小する。
 */
export const MOBILE_TIME_COLUMN_WIDTH = 40;

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

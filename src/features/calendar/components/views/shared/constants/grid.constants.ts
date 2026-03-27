/**
 * グリッドシステムの定数定義
 */

/** 1時間の高さ（px）— SSRフォールバック用デフォルト */
export const HOUR_HEIGHT = 72; // 1時間の高さ(px) — SSRフォールバック用
/** 30分の高さ（px） */
export const HALF_HOUR_HEIGHT = HOUR_HEIGHT / 2; // 30分の高さ(px)
/** 1分の高さ（px） */
export const MINUTE_HEIGHT = HOUR_HEIGHT / 60; // 1分の高さ(px)

// 密度プリセット — 共有レイヤー (@/lib/calendar-constants) から re-export
export { HOUR_HEIGHT_DENSITIES } from '@/lib/calendar-constants';
export type { HourHeightDensity } from '@/lib/calendar-constants';

/** イベントの最小高さ（px） */
export const MIN_EVENT_HEIGHT = 20; // イベントの最小高さ(px)
/** イベントの左右パディング（px） */
export const EVENT_HORIZONTAL_PADDING = 4; // イベントの左右パディング(px)
/** イベントの上下パディング（px） */
export const EVENT_VERTICAL_PADDING = 2; // イベントの上下パディング(px)

/** 時間列の幅（px） */
export const TIME_COLUMN_WIDTH = 56; // 時間列の幅(px)
/** 時間ラベルの高さ（px） */
export const TIME_LABEL_HEIGHT = HOUR_HEIGHT; // 時間ラベルの高さ(px)

/** 正時線のTailwindクラス */
export const HOUR_LINE_COLOR = 'border-border';
/** 30分線のTailwindクラス（より薄い） */
export const HALF_HOUR_LINE_COLOR = 'border-border/50'; // より薄い線用

/** 現在時刻線のTailwindクラス */
export const CURRENT_TIME_LINE_COLOR = 'bg-primary';
/** 現在時刻ドットのサイズ（px） */
export const CURRENT_TIME_DOT_SIZE = 6; // 現在時刻のドットサイズ(px)

/** イベント間の隙間（px） */
export const EVENT_GAP = 2; // イベント間の隙間(px)

/** トランジション時間（ms） */
export const TRANSITION_DURATION = 150; // トランジション時間(ms)

/** 初期表示時にスクロールする時間（8時） */
export const SCROLL_TO_HOUR = 8; // 初期表示時にスクロールする時間（8時）
/** スクロールの動作設定 */
export const SCROLL_BEHAVIOR = 'smooth' as const;

/** グリッド背景のTailwindクラス */
export const GRID_BACKGROUND = 'bg-background';
/** グリッドボーダーのTailwindクラス */
export const GRID_BORDER = 'border-border';

/** Z-index層の定義 */
export const Z_INDEX = {
  GRID_LINES: 0,
  EVENTS: 10,
  CURRENT_TIME: 15,
  DRAGGING: 30,
  POPOVER: 40,
  MODAL: 50,
} as const;

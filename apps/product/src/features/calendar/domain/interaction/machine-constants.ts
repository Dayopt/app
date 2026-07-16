/**
 * Interaction State Machine — 定数
 */

import type { InteractionState } from './types';

/** マウスドラッグ起動閾値（px） */
export const DRAG_THRESHOLD_PX = 5;

/** タッチ移動でロングプレスをキャンセルする閾値（px） — スクロール許容のため */
export const TOUCH_SCROLL_THRESHOLD_PX = 10;

/** イベントドラッグのロングプレス遅延（ms） */
export const LONGPRESS_DELAY_MS = 500;

/** グリッド選択のロングプレス遅延（ms） */
export const SELECTION_LONGPRESS_DELAY_MS = 300;

/** アイドル状態の初期値 */
export const IDLE: InteractionState = { mode: 'idle' };

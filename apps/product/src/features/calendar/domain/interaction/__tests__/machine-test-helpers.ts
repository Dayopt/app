/**
 * Interaction State Machine テスト共有ヘルパー
 *
 * machine-*.test.ts 各ファイルから使う ctx / dispatch / 座標定数。
 */

import { interactionReducer } from '../machine';
import type {
  InteractionAction,
  InteractionContext,
  InteractionResult,
  InteractionState,
  Point,
  TimeblockRect,
} from '../types';

export function createCtx(overrides?: Partial<InteractionContext>): InteractionContext {
  return {
    hourHeight: 60,
    date: new Date('2026-01-15T00:00:00'),
    viewMode: 'day',
    getTimeblockDurationMs: () => 60 * 60 * 1000, // 1 hour
    checkOverlap: () => false,
    ...overrides,
  };
}

export function dispatch(
  state: InteractionState,
  action: InteractionAction,
  ctx?: InteractionContext,
): InteractionResult {
  return interactionReducer(state, action, ctx ?? createCtx());
}

export const origin: Point = { clientX: 100, clientY: 200 };
export const rect: TimeblockRect = { top: 540, left: 0, width: 200, height: 60 }; // 9:00 at 60px/h

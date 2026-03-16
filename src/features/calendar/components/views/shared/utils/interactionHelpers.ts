/**
 * インタラクション関連のヘルパー関数
 *
 * DayContent / WeekContent / MultiDayContent で共通使用される
 * ドラッグ・リサイズ中のスタイル調整とプレビュー時刻の取得。
 */

import type React from 'react';

import type { InteractionState } from '../../../../interaction';

/** ドラッグ・リサイズ中のプランスタイルを調整 */
export function getAdjustedStyle(
  originalStyle: React.CSSProperties,
  planId: string,
  state: InteractionState,
): React.CSSProperties {
  if (state.mode === 'dragging' && state.entryId === planId) {
    return { ...originalStyle, opacity: 0.3, zIndex: 1 };
  }
  if (state.mode === 'resizing' && state.entryId === planId) {
    return {
      ...originalStyle,
      height: `${state.snappedHeight}px`,
      zIndex: 1000,
    };
  }
  return originalStyle;
}

/** リサイズ中のプレビュー時刻を取得（ドラッグ時はゴースト側に表示） */
export function getPreviewTime(
  planId: string,
  state: InteractionState,
): { start: Date; end: Date } | null {
  if (state.mode === 'resizing' && state.entryId === planId) {
    return state.previewTime;
  }
  return null;
}

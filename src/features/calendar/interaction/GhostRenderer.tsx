'use client';

/**
 * GhostRenderer — React Portal でドラッグゴーストを描画
 *
 * DOM cloneNode を廃止し、React の宣言的レンダリングで
 * ゴースト要素を管理。PlanCard と同じスタイルを自動的に維持。
 *
 * 動的にターゲット列とスクロールコンテナを検出し、
 * 任意のビュー（Day/Week/MultiDay）で正しく描画。
 */

import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

import type { InteractionState, TimeRange } from './types';

// ========================================
// Types
// ========================================

interface GhostRendererProps {
  /** Current interaction state */
  state: InteractionState;
  /** Children to render as ghost content (typically a PlanCard) */
  renderGhost?: (params: GhostRenderParams) => React.ReactNode;
}

/** GhostRendererのrenderGhostコールバックに渡されるパラメータ */
export interface GhostRenderParams {
  entryId: string;
  previewTime: TimeRange;
  isOverlapping: boolean;
  /** 'dragging' or 'resizing' */
  mode: 'dragging' | 'resizing';
}

// ========================================
// Component
// ========================================

/** ドラッグ中のゴースト要素をReact Portalで描画するコンポーネント */
export function GhostRenderer({ state, renderGhost }: GhostRendererProps) {
  if (state.mode !== 'dragging') return null;

  // Find the target day column via data-calendar-day-index
  const targetIndex = state.targetDateIndex;
  const targetColumn = document.querySelector<HTMLElement>(
    `[data-calendar-day-index="${targetIndex}"]`,
  );
  if (!targetColumn) return null;

  // Find scrollable ancestor for offset calculation
  const scrollContainer = targetColumn.closest<HTMLElement>('[data-calendar-scroll]');
  const scrollTop = scrollContainer?.scrollTop ?? 0;
  const scrollRect = scrollContainer?.getBoundingClientRect();

  // Convert grid-relative snappedTop to viewport coordinates
  const columnRect = targetColumn.getBoundingClientRect();
  const viewportTop = scrollRect
    ? scrollRect.top + state.snappedTop - scrollTop
    : columnRect.top + state.snappedTop;

  const style: React.CSSProperties = {
    position: 'fixed',
    top: viewportTop,
    left: columnRect.left,
    width: columnRect.width,
    height: state.originalPosition.height,
    zIndex: 9999,
    pointerEvents: 'none',
    opacity: 0.85,
    transition: 'top 50ms ease-out, left 100ms ease-out',
  };

  const content = renderGhost?.({
    entryId: state.entryId,
    previewTime: state.previewTime,
    isOverlapping: state.isOverlapping,
    mode: 'dragging',
  });

  return createPortal(
    <div
      className={cn('rounded-lg shadow-md', state.isOverlapping && 'ring-destructive ring-2')}
      style={style}
    >
      {content ?? (
        <div className="bg-container rounded-lg px-2 py-1 text-sm">
          {state.previewTime.start.getHours()}:
          {String(state.previewTime.start.getMinutes()).padStart(2, '0')}
          {' - '}
          {state.previewTime.end.getHours()}:
          {String(state.previewTime.end.getMinutes()).padStart(2, '0')}
        </div>
      )}
    </div>,
    document.body,
  );
}

'use client';

/**
 * GhostRenderer — React Portal でドラッグゴーストを描画
 *
 * DOM cloneNode を廃止し、React の宣言的レンダリングで
 * ゴースト要素を管理。PlanCard と同じスタイルを自動的に維持。
 *
 * 動的にターゲット列とスクロールコンテナを検出し、
 * 任意のビュー（Day/Week/MultiDay）で正しく描画。
 *
 * ドロップ拒否時は元位置へのスナップバックアニメーション（200ms）を表示。
 */

import { useEffect, useRef, useState } from 'react';
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

/** スナップバック用に保存するドラッグ情報 */
interface SnapBackInfo {
  originalTop: number;
  originalLeft: number;
  width: number;
  height: number;
  content: React.ReactNode;
}

const SNAP_BACK_DURATION = 200;

// ========================================
// Component
// ========================================

/** ドラッグ中のゴースト要素をReact Portalで描画するコンポーネント */
export function GhostRenderer({ state, renderGhost }: GhostRendererProps) {
  const prevStateRef = useRef(state);
  const [snapBack, setSnapBack] = useState<SnapBackInfo | null>(null);

  // ドラッグ中→idle に遷移した時、前回が overlap だったらスナップバック発動
  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = state;

    if (prev.mode !== 'dragging' || state.mode !== 'idle' || !prev.isOverlapping) {
      return undefined;
    }

    // 元位置の座標を計算
    const origIndex = prev.dateIndex;
    const origColumn = document.querySelector<HTMLElement>(
      `[data-calendar-day-index="${origIndex}"]`,
    );
    if (!origColumn) return undefined;

    const scrollContainer = origColumn.closest<HTMLElement>('[data-calendar-scroll]');
    const scrollTop = scrollContainer?.scrollTop ?? 0;
    const scrollRect = scrollContainer?.getBoundingClientRect();
    const columnRect = origColumn.getBoundingClientRect();
    const origViewportTop = scrollRect
      ? scrollRect.top + prev.originalPosition.top - scrollTop
      : columnRect.top + prev.originalPosition.top;

    const content = renderGhost?.({
      entryId: prev.entryId,
      previewTime: prev.previewTime,
      isOverlapping: true,
      mode: 'dragging',
    });

    setSnapBack({
      originalTop: origViewportTop,
      originalLeft: columnRect.left,
      width: columnRect.width,
      height: prev.originalPosition.height,
      content,
    });

    const timer = setTimeout(() => setSnapBack(null), SNAP_BACK_DURATION);
    return () => clearTimeout(timer);
  }, [state, renderGhost]);

  // スナップバックアニメーション中
  if (snapBack) {
    const style: React.CSSProperties = {
      position: 'fixed',
      top: 0,
      left: 0,
      width: snapBack.width,
      height: snapBack.height,
      zIndex: 9999,
      transform: `translate(${snapBack.originalLeft}px, ${snapBack.originalTop}px)`,
      transition: `transform ${SNAP_BACK_DURATION}ms ease-out, opacity ${SNAP_BACK_DURATION}ms ease-out`,
      opacity: 0,
      willChange: 'transform, opacity',
    };

    return createPortal(
      <div className="pointer-events-none rounded-lg shadow-md" style={style}>
        {snapBack.content}
      </div>,
      document.body,
    );
  }

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

  // transform で位置指定（GPU合成レイヤーでレイアウトトリガーを回避）
  const style: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: columnRect.width,
    height: state.originalPosition.height,
    zIndex: 9999,
    transform: `translate(${columnRect.left}px, ${viewportTop}px)`,
    transition: 'transform 50ms ease-out',
    willChange: 'transform',
  };

  const content = renderGhost?.({
    entryId: state.entryId,
    previewTime: state.previewTime,
    isOverlapping: state.isOverlapping,
    mode: 'dragging',
  });

  return createPortal(
    <div
      className={cn(
        'pointer-events-none rounded-lg opacity-85 shadow-md',
        state.isOverlapping && 'ring-destructive ring-2',
      )}
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

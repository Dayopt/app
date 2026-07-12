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
 * 重複検出中はゴースト全体を destructive-tint に切替え（all-red 規範）。
 */

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useIsMobile } from '@/lib/hooks/useIsMobile';
import { cn } from '@dayopt/components';

import { ConflictOverlay } from '../components/views/shared/components/ConflictOverlay';
import type { InteractionState, TimeRange } from '../domain/interaction/types';

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
interface GhostRenderParams {
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

/**
 * モバイル時のゴースト最小高さ(px)。
 * Why: 15〜20分ブロック (18〜20px) をドラッグすると sky blue の細い横帯が
 * 指と離れた位置に浮いて見え「ノイズっぽい」印象になる。
 * 最小 40px に底上げすることで「掴めるチップ」として視認できる。
 */
const MIN_GHOST_HEIGHT_MOBILE = 40;

// ========================================
// Component
// ========================================

/** ドラッグ中のゴースト要素をReact Portalで描画するコンポーネント */
export function GhostRenderer({ state, renderGhost }: GhostRendererProps) {
  const t = useTranslations('timeblock');
  const isMobile = useIsMobile();
  const minGhostHeight = isMobile ? MIN_GHOST_HEIGHT_MOBILE : 0;
  const prevStateRef = useRef(state);
  const [snapBack, setSnapBack] = useState<SnapBackInfo | null>(null);

  // overlap 中は body の cursor を not-allowed にする（GAFA / Material DnD 規範）。
  // ghost は pointer-events:none のため、cursor を変えるには body に直接当てる。
  useEffect(() => {
    const isOverlapping =
      (state.mode === 'dragging' || state.mode === 'resizing') && state.isOverlapping;
    if (!isOverlapping) return undefined;
    const prev = document.body.style.cursor;
    document.body.style.cursor = 'not-allowed';
    return () => {
      document.body.style.cursor = prev;
    };
  }, [state]);

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

    // スナップバック中は overlap 状態を視覚的に残す
    const content = (
      <ConflictOverlay
        previewTime={prev.previewTime}
        message={t('errors.timeOverlap')}
        className="h-full"
      />
    );

    setSnapBack({
      originalTop: origViewportTop,
      originalLeft: columnRect.left,
      width: columnRect.width,
      height: prev.originalPosition.height,
      content,
    });

    const timer = setTimeout(() => setSnapBack(null), SNAP_BACK_DURATION);
    return () => clearTimeout(timer);
  }, [state, t]);

  // スナップバックアニメーション中
  if (snapBack) {
    const style: React.CSSProperties = {
      position: 'fixed',
      top: 0,
      left: 0,
      width: snapBack.width,
      height: Math.max(snapBack.height, minGhostHeight),
      zIndex: 9999,
      transform: `translate(${snapBack.originalLeft}px, ${snapBack.originalTop}px)`,
      transition: `transform ${SNAP_BACK_DURATION}ms ease-out, opacity ${SNAP_BACK_DURATION}ms ease-out`,
      opacity: 0,
      willChange: 'transform, opacity',
    };

    return createPortal(
      <div className="shadow-card pointer-events-none rounded-lg" style={style}>
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
    height: Math.max(state.originalPosition.height, minGhostHeight),
    zIndex: 9999,
    transform: `translate(${columnRect.left}px, ${viewportTop}px)`,
    transition: 'transform 50ms ease-out',
    willChange: 'transform',
  };

  // 重複時は全面 destructive、そうでなければ通常 ghost を描画
  const content = state.isOverlapping ? (
    <ConflictOverlay
      previewTime={state.previewTime}
      message={t('errors.timeOverlap')}
      className="h-full"
    />
  ) : (
    renderGhost?.({
      entryId: state.entryId,
      previewTime: state.previewTime,
      isOverlapping: false,
      mode: 'dragging',
    })
  );

  return createPortal(
    <div
      className={cn(
        'shadow-card pointer-events-none rounded-lg',
        // 重複時は不透明で文字をくっきり読ませる。通常時のみ opacity-85 でゴースト感を出す。
        state.isOverlapping ? 'cursor-not-allowed' : 'opacity-85',
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

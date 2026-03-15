/**
 * エントリー表示カードコンポーネント
 * タグカラーを反映した左ボーダーアクセント + 右角丸の統一デザイン
 */

'use client';

import React, { memo, useCallback, useEffect, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { useTagsMap } from '@/features/tags';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { MEDIA_QUERIES } from '@/lib/breakpoints';
import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import { computeActualTimeDiffOverlay } from '../../lib/actual-time-overlay';
import { useEntryInspectorStore } from '../../stores/useEntryInspectorStore';

import type { EntryCardProps } from './EntryCard.types';
import { EntryCardContent } from './EntryCardContent';

/** SSRフォールバック用デフォルトの1時間高さ(px) */
const DEFAULT_HOUR_HEIGHT = 72;

/** イベントの最小高さ(px) */
const MIN_EVENT_HEIGHT = 20;

/** Z-index層 */
const Z_INDEX = {
  EVENTS: 10,
  DRAGGING: 30,
} as const;

export const EntryCard = memo<EntryCardProps>(function EntryCard({
  plan,
  position,
  onClick,
  onContextMenu,
  onDragStart,
  onTouchStart,
  onDragEnd,
  onResizeStart,
  isDragging = false,
  isSelected = false,
  isActive = false,
  className = '',
  style = {},
  previewTime = null,
  hourHeight: hourHeightProp,
}) {
  const t = useTranslations();
  const isMobile = useMediaQuery(MEDIA_QUERIES.mobile);
  const { getTagById } = useTagsMap();

  // タグ情報を取得（未設定時はデフォルト色）
  const tag = plan.tagId ? getTagById(plan.tagId) : undefined;
  const colorClasses = tag ? getTagColorClasses(tag.color) : null;
  const accentColor = colorClasses?.cssVar ?? 'var(--entry-default)';
  const accentTint =
    colorClasses?.cssVarTint ?? 'color-mix(in oklch, var(--entry-default) 12%, var(--background))';

  // ドラフト（未保存プレビュー）かどうか判定
  const isDraft = plan.isDraft === true;
  // 過去ブロックはドラッグ・リサイズ不可（Time waits for no one）
  const isPast = plan.entryState === 'past';

  // 予定 vs 記録の差分オーバーレイ
  const overlay = useMemo(
    () => computeActualTimeDiffOverlay(plan, hourHeightProp ?? DEFAULT_HOUR_HEIGHT),
    [plan, hourHeightProp],
  );

  // positionが未定義の場合のデフォルト値
  const safePosition = useMemo(
    () =>
      position || {
        top: 0,
        left: 0,
        width: 100,
        height: MIN_EVENT_HEIGHT,
      },
    [position],
  );

  // hourHeightProp がある = DayColumn（グリッド相対配置）→ 位置調整を適用
  // hourHeightProp がない = WeekContent等（ラッパー相対配置）→ 位置調整は不要
  const applyPositionAdjust = hourHeightProp !== undefined;

  // 左アクセントの幅（モバイル: 2px、デスクトップ: 3px）
  const accentWidth = isMobile ? 2 : 3;

  // 動的スタイルを計算（overlay.topShift/heightDelta でカード位置を調整）
  const dynamicStyle: React.CSSProperties = useMemo(
    () => ({
      position: 'absolute' as const,
      top: `${safePosition.top - (applyPositionAdjust ? overlay.topShift : 0)}px`,
      left: `${safePosition.left}%`,
      width: `calc(${safePosition.width}% - 8px)`,
      height: `${Math.max(safePosition.height + (applyPositionAdjust ? overlay.heightDelta : 0), MIN_EVENT_HEIGHT)}px`,
      zIndex: isSelected || isDragging ? Z_INDEX.DRAGGING : Z_INDEX.EVENTS,
      cursor: isDragging ? 'grabbing' : 'pointer',
      ...style,
    }),
    [safePosition, overlay, applyPositionAdjust, isSelected, isDragging, style],
  );

  // 左アクセントの点線パターン（unplanned または超過部分で使用）
  const dashedAccentGradient = `repeating-linear-gradient(to bottom, ${accentColor} 0px, ${accentColor} 5px, transparent 5px, transparent 9px)`;
  const isUnplannedDashed = plan.origin === 'unplanned';

  // アンカー位置の設定（Inspector 配置用）
  const setAnchorRect = useEntryInspectorStore((s) => s.setAnchorRect);

  // イベントハンドラー
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setAnchorRect({
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      onClick?.(plan);
    },
    [onClick, plan, setAnchorRect],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu?.(plan, e);
    },
    [onContextMenu, plan],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isDraft || isPast) return;
      if (e.button === 0) {
        onDragStart?.(plan, e, {
          top: safePosition.top,
          left: safePosition.left,
          width: safePosition.width,
          height: safePosition.height,
        });
      }
    },
    [isDraft, isPast, onDragStart, plan, safePosition],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isDraft || isPast) return;
      onTouchStart?.(plan, e, {
        top: safePosition.top,
        left: safePosition.left,
        width: safePosition.width,
        height: safePosition.height,
      });
    },
    [isDraft, isPast, onTouchStart, plan, safePosition],
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      onDragEnd?.(plan);
    }
  }, [isDragging, onDragEnd, plan]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(plan);
      }
    },
    [onClick, plan],
  );

  const handleBottomResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onResizeStart?.(plan, 'bottom', e, {
        top: safePosition.top,
        left: safePosition.left,
        width: safePosition.width,
        height: safePosition.height,
      });
    },
    [onResizeStart, plan, safePosition],
  );

  const handleResizeKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
    }
  }, []);

  // Escキーでドラッグをキャンセル
  useEffect(() => {
    if (!isDragging) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDragEnd?.(plan);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDragging, onDragEnd, plan]);

  // CSSクラス（統一Entryデザイン: 左アクセント + 右角丸）
  const entryCardClasses = cn(
    'relative flex rounded-r-lg',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    // Draft: state-selected オーバーレイ
    isDraft &&
      'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:transition-colors hover:before:bg-state-hover',
    isDraft &&
      'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-state-selected',
    // 選択/アクティブ状態
    !isDraft && (isSelected || isActive) && 'brightness-110',
    // ホバーオーバーレイ
    !isDraft &&
      'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:transition-colors hover:after:bg-state-hover',
    isSelected && 'ring-2 ring-primary',
    'text-foreground',
    isDraft || isPast ? 'cursor-default' : isDragging ? 'cursor-grabbing' : 'cursor-pointer',
    className,
  );

  if (!plan || !plan.id) {
    return null;
  }

  return (
    <div
      data-entry-card
      className={entryCardClasses}
      style={dynamicStyle}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onKeyDown={handleKeyDown}
      draggable={false}
      role="group"
      tabIndex={0}
      aria-label={
        isDraft ? `draft: ${tag?.name ?? plan.title}` : `entry: ${tag?.name ?? plan.title}`
      }
    >
      {/* 左アクセントストリップ（実体要素：超過部分だけ点線に切替可） */}
      <div
        className="relative shrink-0"
        style={{
          width: `${accentWidth}px`,
          backgroundColor: isUnplannedDashed ? undefined : accentColor,
          backgroundImage: isUnplannedDashed ? dashedAccentGradient : undefined,
        }}
      >
        {/* 超過で上に拡張 → その区間だけ点線 */}
        {overlay.topKind === 'overtime' && !isUnplannedDashed && (
          <div
            className="absolute top-0 right-0 left-0"
            style={{
              height: `${overlay.topHeight}px`,
              backgroundColor: 'var(--background)',
              backgroundImage: dashedAccentGradient,
            }}
          />
        )}
        {/* 超過で下に拡張 → その区間だけ点線 */}
        {overlay.bottomKind === 'overtime' && !isUnplannedDashed && (
          <div
            className="absolute right-0 bottom-0 left-0"
            style={{
              height: `${overlay.bottomHeight}px`,
              backgroundColor: 'var(--background)',
              backgroundImage: dashedAccentGradient,
            }}
          />
        )}
      </div>

      {/* カード本体（overflow-hidden でハッチング/フェードをクリップ） */}
      <div
        className={cn(
          'relative min-w-0 flex-1 overflow-hidden rounded-r-lg',
          isMobile ? 'flex items-start gap-1 px-2 pt-2 text-xs' : 'p-2 text-sm',
        )}
        style={{ backgroundColor: accentTint }}
      >
        <EntryCardContent
          plan={plan}
          tagName={tag?.name ?? null}
          isCompact={safePosition.height < 40}
          showTime={safePosition.height >= 30}
          previewTime={previewTime}
        />

        {/* 予定 vs 記録: 上部 — 未実行は控えめな斜線 */}
        {overlay.topKind === 'unexecuted' && (
          <div
            aria-hidden="true"
            className="pattern-hatch pointer-events-none absolute top-0 right-0 left-0"
            style={{ height: `${overlay.topHeight}px` }}
          />
        )}

        {/* 予定 vs 記録: 上部超過の境界線 */}
        {overlay.topKind === 'overtime' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 left-0 border-b border-dashed border-current/25"
            style={{ top: `${overlay.topHeight}px` }}
          />
        )}

        {/* 予定 vs 記録: 下部 — 未実行は控えめな斜線 */}
        {overlay.bottomKind === 'unexecuted' && (
          <div
            aria-hidden="true"
            className="pattern-hatch pointer-events-none absolute right-0 bottom-0 left-0"
            style={{ height: `${overlay.bottomHeight}px` }}
          />
        )}

        {/* 予定 vs 記録: 下部超過の境界線 */}
        {overlay.bottomKind === 'overtime' && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-current/25"
            style={{ bottom: `${overlay.bottomHeight}px` }}
          />
        )}

        {/* 下端リサイズハンドル（Draft/Past は非表示） */}
        {!isDraft && !isPast && (
          <div
            className="focus:ring-ring absolute right-0 bottom-0 left-0 cursor-ns-resize focus:ring-2 focus:ring-offset-1 focus:outline-none"
            role="slider"
            tabIndex={0}
            aria-label="Resize entry duration"
            aria-orientation="vertical"
            aria-valuenow={safePosition.height}
            aria-valuemin={20}
            aria-valuemax={480}
            onMouseDown={handleBottomResizeMouseDown}
            onKeyDown={handleResizeKeyDown}
            style={{
              height: '8px',
              zIndex: 10,
            }}
            title={t('calendar.event.adjustEndTime')}
          />
        )}
      </div>
    </div>
  );
});

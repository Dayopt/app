/**
 * エントリー表示カードコンポーネント
 * タグカラーを反映した左ボーダーアクセント + 右角丸の統一デザイン
 *
 * Pure props コンポーネント: store / data-fetch hook なし。
 * タグ情報・アンカー位置・モバイル判定は呼び出し元から props で渡す。
 */

'use client';

import React, { memo, startTransition, useCallback, useEffect, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { getTagColorClasses } from '@/lib/tag-colors';
import { cn } from '@/lib/utils';

import {
  computeActualTimeDiffOverlay,
  formatDiffMinutes,
  toMinutesOfDay,
} from '../../lib/actual-time-overlay';

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

/** カレンダーグリッド上に表示するエントリカードコンポーネント（ドラッグ・リサイズ・Inspector連携対応） */
export const EntryCard = memo<EntryCardProps>(function EntryCard({
  entry,
  tagName = null,
  tagColor = null,
  position,
  onClick,
  onContextMenu,
  onDragStart,
  onTouchStart,
  onDragEnd,
  onResizeStart,
  onAnchorRect,
  isDragging = false,
  isSelected = false,
  isActive = false,
  isMobile = false,
  className = '',
  style = {},
  previewTime = null,
  hourHeight: hourHeightProp,
  overlayPositionApplied = false,
  onGapClick,
}) {
  const t = useTranslations();

  // タグカラー（props で解決済み）
  const colorClasses = tagColor ? getTagColorClasses(tagColor) : null;
  const accentColor = colorClasses?.cssVar ?? 'var(--entry-default)';

  // ドラフト（未保存プレビュー）かどうか判定
  const isDraft = entry.isDraft === true;
  // 過去エントリかどうか（リサイズ・ドラッグ無効化に使用）
  const isPast = entry.entryState === 'past';
  // 進行中エントリかどうか（視覚区別に使用）
  const isActiveEntry = entry.entryState === 'active';
  // 予定 vs 記録の差分オーバーレイ
  const overlay = useMemo(
    () => computeActualTimeDiffOverlay(entry, hourHeightProp ?? DEFAULT_HOUR_HEIGHT),
    [entry, hourHeightProp],
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

  // hourHeightProp がある && 外部未調整 = DayColumn（グリッド相対配置）→ 位置調整を適用
  // hourHeightProp がない or 外部調整済み = WeekContent等 → EntryCard内での位置調整は不要
  const applyPositionAdjust = hourHeightProp !== undefined && !overlayPositionApplied;

  // 左アクセントの幅（統一: 3px = --border-indicator トークン相当）
  const accentWidth = 3;

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

  // 超過オーバーレイの外枠（タグ色の破線で一周 + 角丸）
  const overtimeBorderStyle: React.CSSProperties = {
    border: `2px dashed ${accentColor}`,
    borderRadius: '8px',
  };

  // イベントハンドラー
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Rect計測は同期で即座に実行（レイアウト情報が必要）
      if (onAnchorRect) {
        const rect = e.currentTarget.getBoundingClientRect();
        onAnchorRect({
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        });
      }
      // Inspector マウントは重いため startTransition で INP 改善
      startTransition(() => {
        onClick?.(entry);
      });
    },
    [onClick, entry, onAnchorRect],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onContextMenu?.(entry, e);
    },
    [onContextMenu, entry],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isDraft) return;
      if (e.button === 0) {
        onDragStart?.(entry, e, {
          top: safePosition.top,
          left: safePosition.left,
          width: safePosition.width,
          height: safePosition.height,
        });
      }
    },
    [isDraft, onDragStart, entry, safePosition],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isDraft) return;
      onTouchStart?.(entry, e, {
        top: safePosition.top,
        left: safePosition.left,
        width: safePosition.width,
        height: safePosition.height,
      });
    },
    [isDraft, onTouchStart, entry, safePosition],
  );

  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      onDragEnd?.(entry);
    }
  }, [isDragging, onDragEnd, entry]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick?.(entry);
      }
    },
    [onClick, entry],
  );

  const handleBottomResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onResizeStart?.(entry, 'bottom', e, {
        top: safePosition.top,
        left: safePosition.left,
        width: safePosition.width,
        height: safePosition.height,
      });
    },
    [onResizeStart, entry, safePosition],
  );

  const handleBottomResizeTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.stopPropagation();
      onResizeStart?.(entry, 'bottom', e, {
        top: safePosition.top,
        left: safePosition.left,
        width: safePosition.width,
        height: safePosition.height,
      });
    },
    [onResizeStart, entry, safePosition],
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
        onDragEnd?.(entry);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isDragging, onDragEnd, entry]);

  // CSSクラス（統一Entryデザイン: 左アクセント + 右角丸）
  const entryCardClasses = cn(
    'relative flex rounded-r-lg',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
    // Draft: state-selected オーバーレイ
    isDraft &&
      'before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:transition-colors hover:before:bg-state-hover',
    isDraft &&
      'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-state-selected',
    // 選択/アクティブ状態（ホバーが継続しているような見た目）
    !isDraft && (isSelected || isActive) && 'after:!bg-state-hover',
    // ホバーオーバーレイ
    !isDraft &&
      'after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:transition-colors hover:after:bg-state-hover',
    'text-foreground',
    isDragging && 'opacity-30',
    isDraft ? 'cursor-default' : isDragging ? 'cursor-grabbing' : 'cursor-pointer',
    className,
  );

  if (!entry || !entry.id) {
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
      tabIndex={0}
      aria-label={isDraft ? `draft: ${tagName ?? entry.title}` : `entry: ${tagName ?? entry.title}`}
    >
      {/* 花びらパーティクル（新規作成アニメーション時のみ表示） */}
      {className?.includes('animate-entry-pop') && (
        <div
          className="entry-petals"
          aria-hidden
          style={{ '--petal-color': accentColor } as React.CSSProperties}
        >
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
          <div className="entry-petal" />
        </div>
      )}

      {/* 超過オーバーレイ: 上部 — カード外に破線枠、中は透明 */}
      {overlay.topKind === 'overtime' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 left-0 flex flex-col items-center justify-center"
          style={{ top: 0, height: `${overlay.topHeight}px`, ...overtimeBorderStyle }}
        >
          {overlay.topHeight >= 16 && (
            <span className="text-muted-foreground text-xs">
              <span className="mr-1 opacity-60">{t('calendar.event.diff.overtime')}</span>
              <span className="tabular-nums">{formatDiffMinutes(overlay.topDiffMin)}</span>
            </span>
          )}
        </div>
      )}

      {/* 超過オーバーレイ: 下部 — カード外に破線枠、中は透明 */}
      {overlay.bottomKind === 'overtime' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 left-0 flex flex-col items-center justify-center"
          style={{ bottom: 0, height: `${overlay.bottomHeight}px`, ...overtimeBorderStyle }}
        >
          {overlay.bottomHeight >= 16 && (
            <span className="text-muted-foreground text-xs">
              <span className="mr-1 opacity-60">{t('calendar.event.diff.overtime')}</span>
              <span className="tabular-nums">{formatDiffMinutes(overlay.bottomDiffMin)}</span>
            </span>
          )}
        </div>
      )}

      {/* カード実体（アクセント + 本体）— 予定範囲のみに制限 */}
      <div
        className="absolute right-0 left-0 flex"
        style={{
          top: overlay.topKind === 'overtime' ? `${overlay.topHeight}px` : 0,
          bottom: overlay.bottomKind === 'overtime' ? `${overlay.bottomHeight}px` : 0,
        }}
      >
        {/* 左アクセントストリップ */}
        <div
          className={cn(
            'relative shrink-0',
            isActiveEntry && 'animate-pulse',
            colorClasses ? colorClasses.dot : 'bg-entry-default',
          )}
          style={{ width: `${accentWidth}px` }}
        />

        {/* カード本体 */}
        <div
          className={cn(
            'relative min-w-0 flex-1 overflow-hidden rounded-r-lg',
            safePosition.height < 40
              ? isMobile
                ? 'flex items-center px-2 text-xs'
                : 'flex items-center px-2 text-xs'
              : isMobile
                ? 'flex items-start gap-1 px-2 pt-2 text-sm'
                : 'p-2 text-sm',
            colorClasses ? colorClasses.tint : 'bg-muted',
          )}
        >
          <EntryCardContent
            plan={entry}
            tagName={tagName}
            isCompact={safePosition.height < 40}
            showTime={safePosition.height >= 30}
            previewTime={previewTime}
          />

          {/* 予定 vs 記録: 上部 — 未実行はハッチング */}
          {overlay.topKind === 'unexecuted' && (
            <div
              aria-hidden="true"
              className="pattern-hatch pointer-events-none absolute top-0 right-0 left-0 flex flex-col items-center justify-center"
              style={{ height: `${overlay.topHeight}px` }}
            >
              {overlay.topHeight >= 16 && (
                <span className="text-muted-foreground text-xs">
                  <span className="mr-1 opacity-60">{t('calendar.event.diff.short')}</span>
                  <span className="tabular-nums">{formatDiffMinutes(overlay.topDiffMin)}</span>
                </span>
              )}
            </div>
          )}

          {/* 予定 vs 記録: 下部 — 未実行はハッチング + 空き枠「+」ボタン */}
          {overlay.bottomKind === 'unexecuted' && (
            <div
              aria-hidden={!onGapClick ? true : undefined}
              className={cn(
                'pattern-hatch absolute right-0 bottom-0 left-0 flex flex-col items-center justify-center',
                onGapClick ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
              )}
              style={{ height: `${overlay.bottomHeight}px` }}
              onClick={
                onGapClick && entry.actualEndDate && entry.endDate
                  ? (e) => {
                      e.stopPropagation();
                      onGapClick(
                        toMinutesOfDay(entry.actualEndDate!),
                        toMinutesOfDay(entry.endDate!),
                      );
                    }
                  : undefined
              }
            >
              {overlay.bottomHeight >= 16 && !onGapClick && (
                <span className="text-muted-foreground text-xs">
                  <span className="mr-1 opacity-60">{t('calendar.event.diff.short')}</span>
                  <span className="tabular-nums">{formatDiffMinutes(overlay.bottomDiffMin)}</span>
                </span>
              )}
              {overlay.bottomHeight >= 32 && onGapClick && (
                <span className="bg-background/60 text-muted-foreground hover:bg-background hover:text-foreground flex size-6 items-center justify-center rounded-full text-sm transition-colors">
                  +
                </span>
              )}
            </div>
          )}

          {/* 下端リサイズハンドル（Draft/Past は非表示）
             視覚的には8pxだが、タッチ領域は上下に拡大して44pt相当を確保。
             短いカード（< 40px）はハンドルを縮小してクリック領域を確保 */}
          {!isDraft && !isPast && (
            <div
              className="focus:ring-ring absolute right-0 left-0 cursor-ns-resize focus:ring-2 focus:ring-offset-1 focus:outline-none"
              role="slider"
              tabIndex={0}
              aria-label="Resize entry duration"
              aria-orientation="vertical"
              aria-valuenow={safePosition.height}
              aria-valuemin={20}
              aria-valuemax={480}
              onMouseDown={handleBottomResizeMouseDown}
              onTouchStart={handleBottomResizeTouchStart}
              onKeyDown={handleResizeKeyDown}
              style={{
                height: safePosition.height < 40 ? '16px' : '32px',
                bottom: safePosition.height < 40 ? '-4px' : '-12px',
                zIndex: 10,
              }}
              title={t('calendar.event.adjustEndTime')}
            />
          )}
        </div>
        {/* /カード本体 */}
      </div>
      {/* /カード実体ラッパー */}
    </div>
  );
});

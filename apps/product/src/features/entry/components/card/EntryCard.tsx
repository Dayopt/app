/**
 * エントリー表示カードコンポーネント
 * タグカラーを反映した左ボーダーアクセント + 右角丸の統一デザイン
 *
 * Pure props コンポーネント: store / data-fetch hook なし。
 * タグ情報・アンカー位置・モバイル判定は呼び出し元から props で渡す。
 */

'use client';

import React, { memo, startTransition, useCallback, useEffect, useMemo } from 'react';

import { GitCompareArrows, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { getTagColorClasses } from '@/features/tags';
import { cn } from '@/lib/utils';

import {
  computeActualTimeDiffOverlay,
  NO_OVERLAY,
  toMinutesOfDay,
} from '../../lib/actual-time-overlay';

import type { EntryCardProps } from './EntryCard.types';
import { EntryCardContent } from './EntryCardContent';

/** SSRフォールバック用デフォルトの1時間高さ(px) */
const DEFAULT_HOUR_HEIGHT = 72;

/** イベントの最小高さ(px) — 1 分粒度 entry でも視認できる程度に低く設定（PC のみ。mobile は touch target で底上げ） */
const MIN_EVENT_HEIGHT = 14;

/**
 * モバイル時のイベント最小高さ(px)。
 * Why: 15分ブロック (HOUR_HEIGHT=72 時で 18px) が指幅より狭く、タップ／リサイズが困難。
 * 視認性とタップ精度を優先して 28px まで底上げする。
 * 15分連続ブロックが隙間なく並ぶと描画が 8px/個重なるが、実運用で稀なため許容。
 */
const MIN_EVENT_HEIGHT_MOBILE = 28;
const MIN_VISIBLE_GAP_ACTION_HEIGHT = 24;

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
  tagIcon = null,
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
  isResizing = false,
  isActive = false,
  isMobile = false,
  className = '',
  style = {},
  previewTime = null,
  hourHeight: hourHeightProp,
  showActualDiff = true,
  showDayDiffMarker = false,
  plannedHeight: plannedHeightProp,
  overlayPositionApplied = false,
  onGapClick,
  isGapAvailable,
  gapCreationCutoffMs,
}) {
  const t = useTranslations();

  // タグカラー（props で解決済み）
  const colorClasses = tagColor ? getTagColorClasses(tagColor) : null;
  const accentColor = colorClasses?.cssVar ?? 'var(--entry-default)';

  // ドラフト（未保存プレビュー）かどうか判定
  const isDraft = entry.isDraft === true;
  // 進行中エントリかどうか（視覚区別に使用）
  const isActiveEntry = entry.entryState === 'active';
  // 過去エントリかどうか（subtle fade で「過ぎた」を視覚的に伝える。Apple Calendar 規範）
  const isPast = entry.entryState === 'past';
  // 予定外エントリかどうか（全体を破線枠で表示）
  const isUnplanned = entry.origin === 'unplanned';
  // スキップ済み（計画したがやらなかった）。計画レイヤーに muted で残し、実績の強調を消す
  const isSkippedEntry = entry.isSkipped === true;
  const plannedStart = entry.plannedStartDate ?? entry.startDate;
  const plannedEnd = entry.plannedEndDate ?? entry.endDate;
  const upcomingActualMatchesPlan =
    entry.entryState === 'upcoming' &&
    plannedStart != null &&
    plannedEnd != null &&
    entry.actualStartDate != null &&
    entry.actualEndDate != null &&
    plannedStart.getTime() === entry.actualStartDate.getTime() &&
    plannedEnd.getTime() === entry.actualEndDate.getTime();
  // actual が無い予定と、予定/記録が一致する upcoming は予定UIとして扱う。
  // upcoming でも実際に差分がある場合は、記録レイヤーと予定外部分を維持する。
  const renderAsPlanOnly =
    entry.origin === 'planned' &&
    (!showActualDiff ||
      (entry.actualStartDate == null && entry.actualEndDate == null) ||
      upcomingActualMatchesPlan);
  const contentEntry = renderAsPlanOnly
    ? { ...entry, actualStartDate: null, actualEndDate: null }
    : entry;
  // 予定 vs 記録の差分オーバーレイ
  const overlay = useMemo(
    () =>
      renderAsPlanOnly
        ? NO_OVERLAY
        : computeActualTimeDiffOverlay(entry, hourHeightProp ?? DEFAULT_HOUR_HEIGHT),
    [entry, hourHeightProp, renderAsPlanOnly],
  );
  const topGapStartMinutes =
    entry.startDate &&
    entry.actualStartDate &&
    entry.startDate.getTime() < entry.actualStartDate.getTime()
      ? toMinutesOfDay(entry.startDate)
      : null;
  const topGapEndMinutes =
    entry.startDate &&
    entry.actualStartDate &&
    entry.startDate.getTime() < entry.actualStartDate.getTime()
      ? toMinutesOfDay(entry.actualStartDate)
      : null;
  const bottomGapStartMinutes =
    entry.actualEndDate && entry.endDate && entry.actualEndDate.getTime() < entry.endDate.getTime()
      ? toMinutesOfDay(entry.actualEndDate)
      : null;
  const bottomGapEndMinutes =
    entry.actualEndDate && entry.endDate && entry.actualEndDate.getTime() < entry.endDate.getTime()
      ? toMinutesOfDay(entry.endDate)
      : null;
  const topGapAvailable =
    topGapStartMinutes != null && topGapEndMinutes != null
      ? (isGapAvailable?.(topGapStartMinutes, topGapEndMinutes) ?? true)
      : false;
  const bottomGapAvailable =
    bottomGapStartMinutes != null && bottomGapEndMinutes != null
      ? (isGapAvailable?.(bottomGapStartMinutes, bottomGapEndMinutes) ?? true)
      : false;
  const topGapClickEnabled =
    !!onGapClick &&
    topGapAvailable &&
    topGapEndMinutes != null &&
    entry.actualStartDate != null &&
    (gapCreationCutoffMs == null || entry.actualStartDate.getTime() <= gapCreationCutoffMs);
  const bottomGapClickEnabled =
    !!onGapClick &&
    bottomGapAvailable &&
    bottomGapEndMinutes != null &&
    entry.endDate != null &&
    (gapCreationCutoffMs == null || entry.endDate.getTime() <= gapCreationCutoffMs);
  const hasGapCreateLane = topGapClickEnabled || bottomGapClickEnabled;

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

  const minHeight = isMobile ? MIN_EVENT_HEIGHT_MOBILE : MIN_EVENT_HEIGHT;
  const planOnlyGridHeight = useMemo(() => {
    if (!renderAsPlanOnly || !hourHeightProp || isResizing) return null;

    const start = entry.displayStartDate ?? entry.startDate;
    const end = entry.displayEndDate ?? entry.endDate;
    if (!start || !end) return null;

    const startMinutes = toMinutesOfDay(start);
    const endMinutes = toMinutesOfDay(end);
    if (endMinutes <= startMinutes) return null;

    return ((endMinutes - startMinutes) * hourHeightProp) / 60;
  }, [entry, hourHeightProp, isResizing, renderAsPlanOnly]);
  const visualHeight = Math.max(
    planOnlyGridHeight ?? safePosition.height + (applyPositionAdjust ? overlay.heightDelta : 0),
    minHeight,
  );
  const plannedHeight = Math.max(
    planOnlyGridHeight ??
      plannedHeightProp ??
      (overlayPositionApplied ? safePosition.height - overlay.heightDelta : safePosition.height),
    minHeight,
  );
  const plannedLayerTop = isUnplanned ? 0 : overlay.topShift;
  const actualLayerTop = isUnplanned ? 0 : overlay.topKind !== 'none' ? overlay.topHeight : 0;
  const actualLayerBottomGap =
    !isUnplanned && overlay.bottomKind !== 'none' ? overlay.bottomHeight : 0;
  const actualLayerHeight = Math.max(
    visualHeight - actualLayerTop - actualLayerBottomGap,
    minHeight,
  );
  const contentLayerTop =
    isUnplanned || (!renderAsPlanOnly && showActualDiff) ? actualLayerTop : plannedLayerTop;
  const contentLayerHeight =
    isUnplanned || (!renderAsPlanOnly && showActualDiff) ? actualLayerHeight : plannedHeight;
  const alignPlannedLayerToGrid = entry.origin === 'planned' && !renderAsPlanOnly;
  // planned bg は「context」として後ろに引かせ、actual body が「main」として前に出る intensity 階層
  const plannedBackgroundColor = `color-mix(in oklch, ${accentColor} ${showActualDiff ? 10 : 8}%, var(--background))`;
  const actualBackgroundColor = `color-mix(in oklch, ${accentColor} ${showActualDiff ? 26 : 18}%, var(--background))`;

  // 動的スタイルを計算（overlay.topShift/heightDelta でカード位置を調整）
  const dynamicStyle: React.CSSProperties = useMemo(
    () => ({
      position: 'absolute' as const,
      top: `${safePosition.top - (applyPositionAdjust ? overlay.topShift : 0)}px`,
      left: renderAsPlanOnly ? `calc(${safePosition.left}% - 1px)` : `${safePosition.left}%`,
      width: `calc(${safePosition.width}% - ${renderAsPlanOnly ? 7 : 8}px)`,
      height: `${visualHeight}px`,
      zIndex: isSelected || isDragging ? Z_INDEX.DRAGGING : Z_INDEX.EVENTS,
      cursor: isDragging ? 'grabbing' : 'pointer',
      ...style,
    }),
    [
      safePosition,
      overlay,
      applyPositionAdjust,
      isSelected,
      isDragging,
      renderAsPlanOnly,
      style,
      visualHeight,
    ],
  );

  const unplannedBorderStyle: React.CSSProperties = {
    borderTopWidth: '2px',
    borderTopStyle: 'dashed',
    borderTopColor: accentColor,
    borderRightWidth: '2px',
    borderRightStyle: 'dashed',
    borderRightColor: accentColor,
    borderBottomWidth: '2px',
    borderBottomStyle: 'dashed',
    borderBottomColor: accentColor,
    borderRadius: '0 8px 8px 0',
  };

  const overtimeBorderStyle: React.CSSProperties = {
    borderTopWidth: '2px',
    borderTopStyle: 'dashed',
    borderTopColor: accentColor,
    borderRightWidth: '2px',
    borderRightStyle: 'dashed',
    borderRightColor: accentColor,
    borderBottomWidth: '2px',
    borderBottomStyle: 'dashed',
    borderBottomColor: accentColor,
    borderRadius: '0 8px 8px 0',
  };
  const topOvertimeBorderStyle: React.CSSProperties = {
    ...overtimeBorderStyle,
    borderRadius: '0 8px 0 0',
  };
  const bottomOvertimeBorderStyle: React.CSSProperties = {
    ...overtimeBorderStyle,
    borderRadius: '0 0 8px 0',
  };
  const actualBodyBorderRadius = `0 ${overlay.topKind === 'overtime' ? '0' : '8px'} ${
    overlay.bottomKind === 'overtime' ? '0' : '8px'
  } 0`;
  const resizeHandleHeight = isMobile
    ? 44
    : Math.min(32, Math.max(MIN_EVENT_HEIGHT, safePosition.height));
  const resizeHandleBottom = isMobile ? -40 : 0;
  const useCompactResizeHandle = !isMobile && safePosition.height <= 32;

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
  // `group/entry` は子の resize handle icon が hover 時に visible になるための trigger
  const entryCardClasses = cn(
    'group/entry relative flex rounded-r-lg',
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
    // past entry の subtle fade（draft / dragging には適用しない）
    !isDraft && !isDragging && isPast && 'opacity-90',
    // skipped entry: 計画したがやらなかった。muted で「実行されなかった計画」を伝える
    !isDraft && !isDragging && isSkippedEntry && 'opacity-60',
    isDraft ? 'cursor-default' : isDragging ? 'cursor-grabbing' : 'cursor-pointer',
    className,
  );

  if (!entry || !entry.id) {
    return null;
  }

  return (
    <div
      data-entry-card
      data-entry-id={entry.id}
      data-entry-origin={entry.origin}
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

      {/* Layer 1: planned — Google Calendar 風の薄い背景だけ。
          planned layer は左端を罫線にピタッと載せるため左角を直角にする
          （記録ブロックの左アクセント帯と同じく左辺をまっすぐ揃える）。 */}
      {!isUnplanned && (
        <div
          data-entry-planned-layer
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute right-0',
            entry.origin === 'planned' ? 'rounded-r-lg' : 'rounded-lg',
          )}
          style={{
            top: `${plannedLayerTop}px`,
            left: alignPlannedLayerToGrid ? '-1px' : '0px',
            height: `${plannedHeight}px`,
            // upcoming は記録(actual)と地の色を揃える（差は左アクセントの有無だけにする）。
            backgroundColor:
              renderAsPlanOnly && !isSkippedEntry && !showActualDiff
                ? actualBackgroundColor
                : plannedBackgroundColor,
          }}
        />
      )}

      {/* 超過オーバーレイ: 上部 — 破線枠だけで overflow を視覚的に伝える。 */}
      {overlay.topKind === 'overtime' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 left-0 overflow-hidden"
          style={{
            top: 0,
            height: `${overlay.topHeight}px`,
            backgroundColor: actualBackgroundColor,
          }}
        >
          <div
            data-entry-overtime-accent
            className={cn(
              'absolute left-0',
              isActiveEntry ? 'opacity-100' : 'opacity-70',
              isActiveEntry && 'entry-live-accent',
              colorClasses ? colorClasses.dot : 'bg-entry-default',
            )}
            style={{ top: 0, bottom: 0, width: `${accentWidth}px` }}
          />
          {/* 破線枠はアクセントの右端から開始（アクセントを横切らない） */}
          <div
            className="absolute top-0 right-0 bottom-0"
            style={{ left: `${accentWidth}px`, ...topOvertimeBorderStyle }}
          />
        </div>
      )}

      {/* 超過オーバーレイ: 下部 — 破線枠だけで overflow を視覚的に伝える。 */}
      {overlay.bottomKind === 'overtime' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 left-0 overflow-hidden"
          style={{
            bottom: 0,
            height: `${overlay.bottomHeight}px`,
            backgroundColor: actualBackgroundColor,
          }}
        >
          <div
            data-entry-overtime-accent
            className={cn(
              'absolute left-0',
              isActiveEntry ? 'opacity-100' : 'opacity-70',
              isActiveEntry && 'entry-live-accent',
              colorClasses ? colorClasses.dot : 'bg-entry-default',
            )}
            style={{ top: 0, bottom: 0, width: `${accentWidth}px` }}
          />
          {/* 破線枠はアクセントの右端から開始（アクセントを横切らない） */}
          <div
            className="absolute top-0 right-0 bottom-0"
            style={{ left: `${accentWidth}px`, ...bottomOvertimeBorderStyle }}
          />
        </div>
      )}

      {/* planned-only gap: 背景は planned layer のまま、追加導線だけ重ねる。 */}
      {overlay.topKind === 'unexecuted' && (
        <div
          data-entry-gap="top"
          aria-hidden={!topGapClickEnabled ? true : undefined}
          role={topGapClickEnabled ? 'button' : undefined}
          aria-label={topGapClickEnabled ? t('calendar.event.diff.addRecordToGap') : undefined}
          className={cn(
            'absolute right-0 left-0 rounded-t-lg',
            topGapClickEnabled ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
          )}
          style={{ top: `${plannedLayerTop}px`, height: `${overlay.topHeight}px` }}
          onMouseDown={topGapClickEnabled ? (e) => e.stopPropagation() : undefined}
          onTouchStart={topGapClickEnabled ? (e) => e.stopPropagation() : undefined}
          onClick={
            topGapClickEnabled
              ? (e) => {
                  e.stopPropagation();
                  onGapClick?.(
                    toMinutesOfDay(entry.startDate!),
                    toMinutesOfDay(entry.actualStartDate!),
                  );
                }
              : undefined
          }
        >
          {overlay.topHeight >= MIN_VISIBLE_GAP_ACTION_HEIGHT && topGapClickEnabled && (
            <span
              data-entry-gap-action
              className="bg-background/95 text-foreground border-border hover:bg-state-hover absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors"
              style={{ right: 'calc(25% - 10px)' }}
            >
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
            </span>
          )}
        </div>
      )}

      {overlay.bottomKind === 'unexecuted' && (
        <div
          data-entry-gap="bottom"
          aria-hidden={!bottomGapClickEnabled ? true : undefined}
          role={bottomGapClickEnabled ? 'button' : undefined}
          aria-label={bottomGapClickEnabled ? t('calendar.event.diff.addRecordToGap') : undefined}
          className={cn(
            'absolute right-0 left-0 rounded-b-lg',
            bottomGapClickEnabled ? 'pointer-events-auto cursor-pointer' : 'pointer-events-none',
          )}
          style={{
            top: `${Math.max(plannedLayerTop + plannedHeight - overlay.bottomHeight, 0)}px`,
            height: `${overlay.bottomHeight}px`,
          }}
          onMouseDown={bottomGapClickEnabled ? (e) => e.stopPropagation() : undefined}
          onTouchStart={bottomGapClickEnabled ? (e) => e.stopPropagation() : undefined}
          onClick={
            bottomGapClickEnabled
              ? (e) => {
                  e.stopPropagation();
                  onGapClick?.(
                    toMinutesOfDay(entry.actualEndDate!),
                    toMinutesOfDay(entry.endDate!),
                  );
                }
              : undefined
          }
        >
          {overlay.bottomHeight >= MIN_VISIBLE_GAP_ACTION_HEIGHT && bottomGapClickEnabled && (
            <span
              data-entry-gap-action
              className="bg-background/95 text-foreground border-border hover:bg-state-hover absolute top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border shadow-sm transition-colors"
              style={{ right: 'calc(25% - 10px)' }}
            >
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
            </span>
          )}
        </div>
      )}

      {/* Layer 2: actual — 既存の記録カード表現を維持。
          actual がまだ無い planned entry では描画せず、
          planned layer + content layer だけの「予定UI」(薄い・左線なし) にする。 */}
      {!renderAsPlanOnly && (
        <div
          data-entry-actual-layer
          className="absolute right-0 left-0 flex"
          style={{
            top: `${actualLayerTop}px`,
            height: `${actualLayerHeight}px`,
          }}
        >
          {/* 左アクセントストリップ（actual=記録のサイン。予定外にも表示）
              active 中は full intensity、それ以外は 70% で背景に引かせる（animation なしで brighter を表現） */}
          <div
            data-entry-actual-accent
            className={cn(
              'relative shrink-0',
              isSkippedEntry ? 'opacity-30' : isActiveEntry ? 'opacity-100' : 'opacity-70',
              isActiveEntry && 'entry-live-accent',
              colorClasses ? colorClasses.dot : 'bg-entry-default',
            )}
            style={{ width: `${accentWidth}px` }}
          />

          {/* カード本体 — actual recorded を main として強調（planned bg 8% に対して 18%） */}
          <div
            data-entry-actual-body
            className={cn(
              'relative min-w-0 flex-1 overflow-hidden',
              actualLayerHeight < 40
                ? isMobile
                  ? 'flex items-center px-2 text-xs'
                  : 'flex items-center px-2 text-xs'
                : isMobile
                  ? 'flex items-start gap-1 px-2 pt-2 text-sm'
                  : 'p-2 text-sm',
            )}
            style={{
              borderRadius: actualBodyBorderRadius,
              backgroundColor: actualBackgroundColor,
              // 予定外は破線枠を本体（アクセントの右）に当て、アクセントを横切らない
              ...(isUnplanned ? unplannedBorderStyle : {}),
            }}
          >
            {isUnplanned && (
              <EntryCardContent
                plan={contentEntry}
                tagName={tagName}
                tagColor={tagColor}
                tagIcon={tagIcon}
                isCompact={actualLayerHeight < 40}
                showTime={actualLayerHeight >= 30}
                previewTime={previewTime}
              />
            )}
          </div>
        </div>
      )}
      {/* /actual layer */}

      {!isUnplanned && (
        <div
          data-entry-content-layer
          className={cn(
            'pointer-events-none absolute right-0 overflow-hidden rounded-r-lg',
            contentLayerHeight < 40
              ? isMobile
                ? 'flex items-center px-2 text-xs'
                : 'flex items-center px-2 text-xs'
              : isMobile
                ? 'flex items-start gap-1 px-2 pt-2 text-sm'
                : 'p-2 text-sm',
            isSkippedEntry && 'text-muted-foreground line-through',
          )}
          style={{
            top: `${contentLayerTop}px`,
            // アクセントの有無で文言位置がずれないよう、upcoming も accent 幅分を確保して揃える。
            left: `${accentWidth}px`,
            right: hasGapCreateLane ? '50%' : '0px',
            height: `${contentLayerHeight}px`,
          }}
        >
          <EntryCardContent
            plan={contentEntry}
            tagName={tagName}
            tagColor={tagColor}
            tagIcon={tagIcon}
            isCompact={contentLayerHeight < 40}
            showTime={contentLayerHeight >= 30}
            previewTime={previewTime}
          />
        </div>
      )}

      {showDayDiffMarker && (
        <span
          data-entry-day-diff-marker
          className="bg-background text-muted-foreground border-border-subtle pointer-events-none absolute top-1 right-1 flex size-5 items-center justify-center rounded-full border shadow-sm"
          aria-hidden="true"
        >
          <GitCompareArrows className="size-3.5" />
        </span>
      )}

      {/* 下端リサイズハンドル（Draft は非表示）
           PC: 常時 render、hover で pill 出現。
           Mobile: Inspector 開いている entry（isActive）のみ render し、pill は常時表示。
           PC の当たり判定は card 内に収め、直下のグリッド選択を塞がない。
           card 本体の overflow-hidden 外に置くことで pill icon が短い card でも visible。 */}
      {!isDraft && (!isMobile || isActive) && (
        <div
          data-entry-resize-frame
          className="pointer-events-none absolute right-0 left-0"
          style={{
            top: `${isUnplanned ? 0 : plannedLayerTop}px`,
            height: `${isUnplanned ? visualHeight : plannedHeight}px`,
          }}
        >
          {/* drawer pill 風 affordance — PC は hover で出現、Mobile は isActive のとき常時 visible。
              pointer-events-none で click は下にある handle が拾う。 */}
          <span
            aria-hidden
            className={cn(
              'bg-muted-foreground pointer-events-none absolute bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full transition-opacity duration-150',
              isMobile && isActive ? 'opacity-100' : 'opacity-0 group-hover/entry:opacity-100',
            )}
            style={{ zIndex: 11 }}
          />
          <div
            className="focus:ring-ring pointer-events-auto absolute cursor-ns-resize focus:ring-2 focus:ring-offset-1 focus:outline-none"
            role="slider"
            tabIndex={0}
            aria-label="Resize entry duration"
            aria-orientation="vertical"
            aria-valuenow={safePosition.height}
            aria-valuemin={MIN_EVENT_HEIGHT}
            aria-valuemax={480}
            onMouseDown={handleBottomResizeMouseDown}
            onTouchStart={handleBottomResizeTouchStart}
            onKeyDown={handleResizeKeyDown}
            style={{
              // Mobile は touch target 規約 (min-h-11) に合わせて常に 44px。
              // PC は card 内の下端だけを掴む。短い予定の直下に予定を作れるよう外へ張り出さない。
              height: `${resizeHandleHeight}px`,
              bottom: `${resizeHandleBottom}px`,
              left: useCompactResizeHandle ? '50%' : '0px',
              right: useCompactResizeHandle ? 'auto' : '0px',
              width: useCompactResizeHandle ? '32px' : 'auto',
              transform: useCompactResizeHandle ? 'translateX(-50%)' : 'none',
              zIndex: 10,
            }}
            title={t('calendar.event.adjustEndTime')}
          />
        </div>
      )}
    </div>
  );
});

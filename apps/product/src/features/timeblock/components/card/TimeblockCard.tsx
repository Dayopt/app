/**
 * Timeblock表示カードコンポーネント
 * タグカラーを反映した左ボーダーアクセント + 右角丸の統一デザイン
 *
 * Pure props コンポーネント: store / data-fetch hook なし。
 * タグ情報・アンカー位置・モバイル判定は呼び出し元から props で渡す。
 *
 * レイヤー幾何計算は useTimeblockCardLayout、イベントハンドラーは
 * useTimeblockCardInteractions に分離している。
 */

'use client';

import { memo } from 'react';

import { GitCompareArrows } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@dayopt/components';

import type { TimeblockCardProps } from './TimeblockCard.types';
import { TimeblockCardActualLayer } from './TimeblockCardActualLayer';
import { TimeblockCardContent } from './TimeblockCardContent';
import { TimeblockCardGapZone } from './TimeblockCardGapZone';
import { TimeblockCardOvertimeOverlay } from './TimeblockCardOvertimeOverlay';
import { TimeblockCardResizeHandle } from './TimeblockCardResizeHandle';
import { useTimeblockCardInteractions } from './useTimeblockCardInteractions';
import { MIN_EVENT_HEIGHT, useTimeblockCardLayout } from './useTimeblockCardLayout';

/** カレンダーグリッド上に表示するエントリカードコンポーネント（ドラッグ・リサイズ・Inspector連携対応） */
export const TimeblockCard = memo<TimeblockCardProps>(function TimeblockCard({
  entry,
  tagName = null,
  tagColor = null,
  tagIcon = null,
  timeFormat = '24h',
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
  hourHeight,
  showActualDiff = true,
  showDayDiffMarker = false,
  plannedHeight,
  overlayPositionApplied = false,
  onGapClick,
  isGapAvailable,
  gapCreationCutoffMs,
}) {
  const t = useTranslations();

  const layout = useTimeblockCardLayout({
    entry,
    position,
    isMobile,
    className,
    style,
    isDragging,
    isSelected,
    isActive,
    isResizing,
    hourHeight,
    showActualDiff,
    plannedHeight,
    overlayPositionApplied,
    tagColor,
    onGapClick,
    isGapAvailable,
    gapCreationCutoffMs,
  });

  const {
    colorClasses,
    isDraft,
    isActiveEntry,
    isUnplanned,
    isSkippedEntry,
    renderAsPlanOnly,
    contentEntry,
    overlay,
    topGapStartMinutes,
    topGapEndMinutes,
    bottomGapStartMinutes,
    bottomGapEndMinutes,
    topGapClickEnabled,
    bottomGapClickEnabled,
    hasGapCreateLane,
    safePosition,
    accentWidth,
    visualHeight,
    plannedHeight: resolvedPlannedHeight,
    plannedLayerTop,
    actualLayerTop,
    actualLayerHeight,
    contentLayerTop,
    contentLayerHeight,
    alignPlannedLayerToGrid,
    plannedBackgroundColor,
    actualBackgroundColor,
    skippedBackgroundColor,
    skippedHatchImage,
    dynamicStyle,
    unplannedBorderStyle,
    topOvertimeBorderStyle,
    bottomOvertimeBorderStyle,
    actualBodyBorderRadius,
    resizeHandleHeight,
    resizeHandleBottom,
    useCompactResizeHandle,
    timeblockCardClasses,
  } = layout;

  const {
    handleClick,
    handleContextMenu,
    handleMouseDown,
    handleTouchStart: handleCardTouchStart,
    handleMouseUp,
    handleKeyDown,
    handleBottomResizeMouseDown,
    handleBottomResizeTouchStart,
    handleResizeKeyDown,
  } = useTimeblockCardInteractions({
    entry,
    onClick,
    onContextMenu,
    onDragStart,
    onTouchStart,
    onDragEnd,
    onResizeStart,
    onAnchorRect,
    isDragging,
    isDraft,
    safePosition,
  });

  if (!entry || !entry.id) {
    return null;
  }

  return (
    <div
      data-timeblock-card
      data-entry-id={entry.id}
      data-entry-origin={entry.origin}
      className={timeblockCardClasses}
      style={dynamicStyle}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleCardTouchStart}
      onKeyDown={handleKeyDown}
      draggable={false}
      tabIndex={0}
      aria-label={isDraft ? `draft: ${tagName ?? entry.title}` : `entry: ${tagName ?? entry.title}`}
    >
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
            height: `${resolvedPlannedHeight}px`,
            // skip は専用 tint + 斜線ハッチング。それ以外の upcoming は記録(actual)と地の色を
            // 揃える（差は左アクセントの有無だけにする）。
            backgroundColor: isSkippedEntry
              ? skippedBackgroundColor
              : renderAsPlanOnly
                ? actualBackgroundColor
                : plannedBackgroundColor,
            ...(isSkippedEntry ? { backgroundImage: skippedHatchImage } : {}),
          }}
        />
      )}

      {/* 超過オーバーレイ: 上部 — 破線枠だけで overflow を視覚的に伝える。 */}
      {overlay.topKind === 'overtime' && (
        <TimeblockCardOvertimeOverlay
          side="top"
          height={overlay.topHeight}
          backgroundColor={actualBackgroundColor}
          isActiveEntry={isActiveEntry}
          colorClasses={colorClasses}
          accentWidth={accentWidth}
          borderStyle={topOvertimeBorderStyle}
        />
      )}

      {/* 超過オーバーレイ: 下部 — 破線枠だけで overflow を視覚的に伝える。 */}
      {overlay.bottomKind === 'overtime' && (
        <TimeblockCardOvertimeOverlay
          side="bottom"
          height={overlay.bottomHeight}
          backgroundColor={actualBackgroundColor}
          isActiveEntry={isActiveEntry}
          colorClasses={colorClasses}
          accentWidth={accentWidth}
          borderStyle={bottomOvertimeBorderStyle}
        />
      )}

      {/* planned-only gap: 背景は planned layer のまま、追加導線だけ重ねる。 */}
      {overlay.topKind === 'unexecuted' && (
        <TimeblockCardGapZone
          side="top"
          top={plannedLayerTop}
          height={overlay.topHeight}
          clickEnabled={topGapClickEnabled}
          startMinutes={topGapStartMinutes}
          endMinutes={topGapEndMinutes}
          onGapClick={onGapClick}
          label={t('calendar.event.diff.addRecordToGap')}
        />
      )}

      {overlay.bottomKind === 'unexecuted' && (
        <TimeblockCardGapZone
          side="bottom"
          top={Math.max(plannedLayerTop + resolvedPlannedHeight - overlay.bottomHeight, 0)}
          height={overlay.bottomHeight}
          clickEnabled={bottomGapClickEnabled}
          startMinutes={bottomGapStartMinutes}
          endMinutes={bottomGapEndMinutes}
          onGapClick={onGapClick}
          label={t('calendar.event.diff.addRecordToGap')}
        />
      )}

      {/* Layer 2: actual — 既存の記録カード表現を維持。
          actual がまだ無い planned entry では描画せず、
          planned layer + content layer だけの「予定UI」(薄い・左線なし) にする。 */}
      {!renderAsPlanOnly && (
        <TimeblockCardActualLayer
          top={actualLayerTop}
          height={actualLayerHeight}
          isActiveEntry={isActiveEntry}
          colorClasses={colorClasses}
          accentWidth={accentWidth}
          isUnplanned={isUnplanned}
          isMobile={isMobile}
          actualBodyBorderRadius={actualBodyBorderRadius}
          actualBackgroundColor={actualBackgroundColor}
          unplannedBorderStyle={unplannedBorderStyle}
          contentEntry={contentEntry}
          tagName={tagName}
          tagColor={tagColor}
          tagIcon={tagIcon}
          timeFormat={timeFormat}
          previewTime={previewTime}
        />
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
          )}
          style={{
            top: `${contentLayerTop}px`,
            // アクセントの有無で文言位置がずれないよう、upcoming も accent 幅分を確保して揃える。
            left: `${accentWidth}px`,
            right: hasGapCreateLane ? '50%' : '0px',
            height: `${contentLayerHeight}px`,
          }}
        >
          <TimeblockCardContent
            plan={contentEntry}
            tagName={tagName}
            tagColor={tagColor}
            tagIcon={tagIcon}
            isCompact={contentLayerHeight < 40}
            showTime={contentLayerHeight >= 30}
            timeFormat={timeFormat}
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

      {/* 下端リサイズハンドル（Draft は非表示） */}
      {!isDraft && (!isMobile || isActive) && (
        <TimeblockCardResizeHandle
          frameTop={isUnplanned ? 0 : plannedLayerTop}
          frameHeight={isUnplanned ? visualHeight : resolvedPlannedHeight}
          height={resizeHandleHeight}
          bottom={resizeHandleBottom}
          compact={useCompactResizeHandle}
          ariaValueNow={safePosition.height}
          ariaValueMin={MIN_EVENT_HEIGHT}
          label={t('calendar.event.adjustEndTime')}
          onMouseDown={handleBottomResizeMouseDown}
          onTouchStart={handleBottomResizeTouchStart}
          onKeyDown={handleResizeKeyDown}
        />
      )}
    </div>
  );
});

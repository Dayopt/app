/**
 * Record レーン用カード（overview.md §4: 塗りカード、視覚的な主役）。
 *
 * `TimeblockCard.tsx` のトークン使用を踏襲するが、DnD・overlay 計算・gap クリック
 * 導線は Step 6 の対象のため持ち込まない（read 側専用の軽量プレゼンテーショナル
 * コンポーネント）。差分は `DiffBadge`（±0 は非表示）、予定外の記録は
 * 静かなマーカーのみ（二値ラベルは使わない、copywriting準拠）。
 */
'use client';

import type React from 'react';

import { useTranslations } from 'next-intl';

import { getTagColorClasses, TagIcon } from '@/features/tags';
import type { RecordEvent } from '@/features/timeblock';
import { formatTimeString } from '@/lib/date';
import { cn } from '@dayopt/components';
import type { TimeFormat } from '@dayopt/domain';

import type { TwoLanePosition } from '../../../../../lib/two-lane-layout';
import { DayDiffMarker } from './DayDiffMarker';
import { DiffBadge } from './DiffBadge';

interface RecordLaneCardProps {
  event: RecordEvent;
  position: TwoLanePosition;
  /** Calendar カードの表示名。title ではなくタグを source of truth とする。 */
  tagName: string | null;
  tagColor?: string | null | undefined;
  tagIcon?: string | null | undefined;
  className?: string | undefined;
  /** Inspector で選択中か（強調表示） */
  isActive?: boolean | undefined;
  /** auto_migrated など RLS で不変な record。ドラッグ・リサイズを禁止する */
  disableDrag?: boolean | undefined;
  /** Compare panel に表示中の entry であることを示す */
  showDayDiffMarker?: boolean | undefined;
  /** 複数日表示の狭い列では secondary detail と余白を減らす */
  compact?: boolean | undefined;
  /** ユーザー設定に基づく時刻表記 */
  timeFormat?: TimeFormat | undefined;
  onClick?: ((event: RecordEvent, e: React.MouseEvent) => void) | undefined;
  onContextMenu?: ((event: RecordEvent, e: React.MouseEvent) => void) | undefined;
  onPointerDown?: ((event: RecordEvent, e: React.MouseEvent) => void) | undefined;
  onTouchStart?: ((event: RecordEvent, e: React.TouchEvent) => void) | undefined;
  onResizeStart?:
    ((event: RecordEvent, e: React.MouseEvent | React.TouchEvent) => void) | undefined;
  /** ドラッグ中の opacity / リサイズ中の zIndex など、呼び出し側から上書きしたい style */
  styleOverride?: React.CSSProperties | undefined;
}

const MIN_HEIGHT = 20;
const DETAIL_HEIGHT_THRESHOLD = 40;
const RESIZE_HANDLE_HEIGHT = 20;

function formatTimeRange(start: Date, end: Date, timeFormat: TimeFormat): string {
  return `${formatTimeString(start.getHours(), start.getMinutes(), timeFormat)}–${formatTimeString(end.getHours(), end.getMinutes(), timeFormat)}`;
}

export function RecordLaneCard({
  event,
  position,
  tagName,
  tagColor = null,
  tagIcon = null,
  className,
  isActive = false,
  disableDrag = false,
  showDayDiffMarker = false,
  compact = false,
  timeFormat = '24h',
  onClick,
  onContextMenu,
  onPointerDown,
  onTouchStart,
  onResizeStart,
  styleOverride,
}: RecordLaneCardProps) {
  const t = useTranslations();
  const colorClasses = tagColor ? getTagColorClasses(tagColor) : null;
  const displayName = tagName ?? t('common.tags.noTag');
  const isUnplanned = event.planId == null;
  const hasDiff = event.diffMinutes != null && event.diffMinutes !== 0;
  const showDetails = !compact && position.height >= DETAIL_HEIGHT_THRESHOLD;
  const canDrag = !disableDrag && Boolean(onPointerDown);
  return (
    <div
      data-record-lane-card
      data-record-planned={!isUnplanned}
      data-entry-block="true"
      tabIndex={0}
      role="button"
      aria-label={displayName}
      className={cn(
        'pointer-events-auto absolute flex flex-col gap-1 overflow-hidden rounded-lg py-1 text-xs',
        compact ? 'px-1' : 'px-2',
        colorClasses?.tint ?? 'bg-card',
        'text-foreground',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        isActive && 'ring-ring ring-2',
        showDayDiffMarker && 'pr-7',
        canDrag ? 'cursor-grab' : 'cursor-pointer',
        className,
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}%`,
        width: `calc(${position.width}% - 4px)`,
        height: `${Math.max(position.height, MIN_HEIGHT)}px`,
        ...styleOverride,
      }}
      onClick={(e) => onClick?.(event, e)}
      onContextMenu={(e) => onContextMenu?.(event, e)}
      onMouseDown={(e) => {
        if (e.button === 0 && canDrag) onPointerDown?.(event, e);
      }}
      onTouchStart={(e) => {
        if (canDrag) onTouchStart?.(event, e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(event, e as unknown as React.MouseEvent);
        }
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="flex min-h-0 items-start gap-1 truncate font-medium">
          <TagIcon icon={tagIcon} color={tagColor ?? undefined} size="sm" className="shrink-0" />
          <span className="truncate">{displayName}</span>
        </p>
        {hasDiff && !compact && <DiffBadge diffMinutes={event.diffMinutes ?? 0} />}
      </div>
      {showDetails && (
        <p className="text-muted-foreground truncate">
          {formatTimeRange(event.displayStartDate, event.displayEndDate, timeFormat)}
        </p>
      )}
      {isUnplanned && !compact && (
        <span data-record-unplanned-marker className="text-muted-foreground truncate">
          {t('timeblock.inspector.unplanned')}
        </span>
      )}
      {showDayDiffMarker && <DayDiffMarker />}
      {canDrag && onResizeStart && (
        <div
          role="slider"
          tabIndex={-1}
          aria-label={t('calendar.event.adjustEndTime')}
          aria-orientation="vertical"
          aria-valuenow={position.height}
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={1440}
          className="absolute right-0 bottom-0 left-0 cursor-ns-resize"
          style={{ height: RESIZE_HANDLE_HEIGHT }}
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onResizeStart(event, e);
          }}
          onTouchStart={(e) => {
            e.stopPropagation();
            onResizeStart(event, e);
          }}
        />
      )}
    </div>
  );
}

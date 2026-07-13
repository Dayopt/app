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

import { getTagColorClasses } from '@/features/tags';
import type { RecordEvent } from '@/features/timeblock';
import { cn } from '@dayopt/components';

import type { TwoLanePosition } from '../../../../../lib/two-lane-layout';
import { DiffBadge } from './DiffBadge';

interface RecordLaneCardProps {
  event: RecordEvent;
  position: TwoLanePosition;
  tagColor?: string | null | undefined;
  className?: string | undefined;
  /** Inspector で選択中か（強調表示） */
  isActive?: boolean | undefined;
  /** auto_migrated など RLS で不変な record。ドラッグ・リサイズを禁止する */
  disableDrag?: boolean | undefined;
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

function formatTimeRange(start: Date, end: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

export function RecordLaneCard({
  event,
  position,
  tagColor = null,
  className,
  isActive = false,
  disableDrag = false,
  onClick,
  onContextMenu,
  onPointerDown,
  onTouchStart,
  onResizeStart,
  styleOverride,
}: RecordLaneCardProps) {
  const t = useTranslations();
  const colorClasses = tagColor ? getTagColorClasses(tagColor) : null;
  const isUnplanned = event.planId == null;
  const hasDiff = event.diffMinutes != null && event.diffMinutes !== 0;
  const showDetails = position.height >= DETAIL_HEIGHT_THRESHOLD;
  const canDrag = !disableDrag && Boolean(onPointerDown);

  return (
    <div
      data-record-lane-card
      data-record-planned={!isUnplanned}
      data-entry-block="true"
      tabIndex={0}
      role="button"
      aria-label={event.title || t('timeblock.untitled')}
      className={cn(
        'pointer-events-auto absolute flex flex-col gap-1 overflow-hidden rounded-lg px-2 py-1 text-xs',
        colorClasses?.tint ?? 'bg-card',
        'text-foreground',
        isActive && 'ring-ring ring-2',
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
        <p className="truncate font-medium">{event.title || t('timeblock.untitled')}</p>
        {hasDiff && <DiffBadge diffMinutes={event.diffMinutes ?? 0} />}
      </div>
      {showDetails && (
        <p className="text-muted-foreground truncate">
          {formatTimeRange(event.displayStartDate, event.displayEndDate)}
        </p>
      )}
      {isUnplanned && (
        <span data-record-unplanned-marker className="text-muted-foreground truncate">
          {t('timeblock.inspector.unplanned')}
        </span>
      )}
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

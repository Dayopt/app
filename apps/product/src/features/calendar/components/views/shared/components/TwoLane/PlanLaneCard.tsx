/**
 * Plan レーン用カード（overview.md §4: アウトライン・淡色、控えめ）。
 *
 * `TimeblockCard.tsx` のトークン使用（タグカラー、色分けロジック）を踏襲するが、
 * DnD・overlay 計算・gap クリック導線は Step 6 の対象のため持ち込まない
 * （read 側専用の軽量プレゼンテーショナルコンポーネント）。
 */
'use client';

import type React from 'react';

import { useTranslations } from 'next-intl';

import { getTagColorClasses } from '@/features/tags';
import type { PlanEvent } from '@/features/timeblock';
import { formatTimeString } from '@/lib/date';
import { cn } from '@dayopt/components';
import type { TimeFormat } from '@dayopt/domain';

import type { TwoLanePosition } from '../../../../../lib/two-lane-layout';

interface PlanLaneCardProps {
  event: PlanEvent;
  position: TwoLanePosition;
  tagColor?: string | null | undefined;
  className?: string | undefined;
  /** Inspector で選択中か（強調表示） */
  isActive?: boolean | undefined;
  /** 過去 plan などドラッグ・リサイズを禁止する場合 true */
  disableDrag?: boolean | undefined;
  /** 過去 plan などリサイズだけを禁止する場合 true */
  disableResize?: boolean | undefined;
  /** 複数日表示の狭い列では secondary detail と余白を減らす */
  compact?: boolean | undefined;
  /** ユーザー設定に基づく時刻表記 */
  timeFormat?: TimeFormat | undefined;
  onClick?: ((event: PlanEvent, e: React.MouseEvent) => void) | undefined;
  onContextMenu?: ((event: PlanEvent, e: React.MouseEvent) => void) | undefined;
  onPointerDown?: ((event: PlanEvent, e: React.MouseEvent) => void) | undefined;
  onTouchStart?: ((event: PlanEvent, e: React.TouchEvent) => void) | undefined;
  onResizeStart?: ((event: PlanEvent, e: React.MouseEvent | React.TouchEvent) => void) | undefined;
  /** ドラッグ中の opacity / リサイズ中の zIndex など、呼び出し側から上書きしたい style */
  styleOverride?: React.CSSProperties | undefined;
}

const MIN_HEIGHT = 20;
const DETAIL_HEIGHT_THRESHOLD = 40;
const RESIZE_HANDLE_HEIGHT = 20;

function formatTimeRange(start: Date, end: Date, timeFormat: TimeFormat): string {
  return `${formatTimeString(start.getHours(), start.getMinutes(), timeFormat)}–${formatTimeString(end.getHours(), end.getMinutes(), timeFormat)}`;
}

/** skip 済み plan の斜線ハッチング背景。TimeblockCard の skip 表現を踏襲。 */
function skippedHatchImage(accentColor: string): string {
  return `repeating-linear-gradient(45deg, transparent 0 5px, color-mix(in oklch, ${accentColor} 38%, transparent) 5px 7px)`;
}

export function PlanLaneCard({
  event,
  position,
  tagColor = null,
  className,
  isActive = false,
  disableDrag = false,
  disableResize = false,
  compact = false,
  timeFormat = '24h',
  onClick,
  onContextMenu,
  onPointerDown,
  onTouchStart,
  onResizeStart,
  styleOverride,
}: PlanLaneCardProps) {
  const t = useTranslations();
  const colorClasses = tagColor ? getTagColorClasses(tagColor) : null;
  const borderClass = colorClasses?.border ?? 'border-border';

  const isSkipped = event.status === 'skipped';
  const isUnrecorded = event.status === 'unrecorded';
  const isRecorded = event.status === 'recorded';
  const showDetails = !compact && position.height >= DETAIL_HEIGHT_THRESHOLD;
  const canDrag = !disableDrag && Boolean(onPointerDown);

  return (
    <div
      data-plan-lane-card
      data-plan-status={event.status}
      data-entry-block="true"
      tabIndex={0}
      role="button"
      aria-label={event.title || t('timeblock.untitled')}
      className={cn(
        'absolute overflow-hidden rounded-lg py-1 text-xs',
        compact ? 'border px-1' : 'border-2 px-2',
        borderClass,
        // skip / 記録済みは控えめに沈める。未記録の過去 plan は静かなプロンプトとして
        // 破線で「まだ何かが足りない」を示す。
        isSkipped ? 'opacity-50' : isRecorded ? 'opacity-60' : 'opacity-100',
        isUnrecorded ? 'border-dashed' : 'border-solid',
        'text-foreground bg-transparent',
        'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        isActive && 'ring-ring ring-2',
        canDrag ? 'cursor-grab' : 'cursor-pointer',
        className,
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}%`,
        width: `calc(${position.width}% - 4px)`,
        height: `${Math.max(position.height, MIN_HEIGHT)}px`,
        ...(isSkipped && colorClasses
          ? { backgroundImage: skippedHatchImage(colorClasses.cssVar) }
          : {}),
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
      <p className="truncate font-medium">{event.title || t('timeblock.untitled')}</p>
      {showDetails && (
        <p className="text-muted-foreground truncate">
          {formatTimeRange(event.displayStartDate, event.displayEndDate, timeFormat)}
        </p>
      )}
      {canDrag && !disableResize && onResizeStart && (
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

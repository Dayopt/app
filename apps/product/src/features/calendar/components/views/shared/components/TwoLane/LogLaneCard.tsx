/**
 * Log レーン用カード（overview.md §4: 塗りカード、視覚的な主役）。
 *
 * `EntryCard.tsx` のトークン使用を踏襲するが、DnD・overlay 計算・gap クリック
 * 導線は Step 6 の対象のため持ち込まない（read 側専用の軽量プレゼンテーショナル
 * コンポーネント）。差分は `DiffBadge`（±0 は非表示）、予定外の記録は
 * 静かなマーカーのみ（二値ラベルは使わない、copywriting準拠）。
 */
'use client';

import { useTranslations } from 'next-intl';

import type { LogEvent } from '@/features/entry';
import { getTagColorClasses } from '@/features/tags';
import { cn } from '@dayopt/components';

import type { TwoLanePosition } from '../../../../../lib/two-lane-layout';
import { DiffBadge } from './DiffBadge';

export interface LogLaneCardProps {
  event: LogEvent;
  position: TwoLanePosition;
  tagColor?: string | null | undefined;
  className?: string | undefined;
}

const MIN_HEIGHT = 20;
const DETAIL_HEIGHT_THRESHOLD = 40;

function formatTimeRange(start: Date, end: Date): string {
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

export function LogLaneCard({ event, position, tagColor = null, className }: LogLaneCardProps) {
  const t = useTranslations();
  const colorClasses = tagColor ? getTagColorClasses(tagColor) : null;
  const isUnplanned = event.planId == null;
  const hasDiff = event.diffMinutes != null && event.diffMinutes !== 0;
  const showDetails = position.height >= DETAIL_HEIGHT_THRESHOLD;

  return (
    <div
      data-log-lane-card
      data-log-planned={!isUnplanned}
      className={cn(
        'absolute flex flex-col gap-1 overflow-hidden rounded-lg px-2 py-1 text-xs',
        colorClasses?.tint ?? 'bg-card',
        'text-foreground',
        className,
      )}
      style={{
        top: `${position.top}px`,
        left: `${position.left}%`,
        width: `calc(${position.width}% - 4px)`,
        height: `${Math.max(position.height, MIN_HEIGHT)}px`,
      }}
    >
      <div className="flex items-start justify-between gap-1">
        <p className="truncate font-medium">{event.title || t('entry.untitled')}</p>
        {hasDiff && <DiffBadge diffMinutes={event.diffMinutes ?? 0} />}
      </div>
      {showDetails && (
        <p className="text-muted-foreground truncate">
          {formatTimeRange(event.displayStartDate, event.displayEndDate)}
        </p>
      )}
      {isUnplanned && (
        <span data-log-unplanned-marker className="text-muted-foreground truncate">
          {t('entry.inspector.unplanned')}
        </span>
      )}
    </div>
  );
}

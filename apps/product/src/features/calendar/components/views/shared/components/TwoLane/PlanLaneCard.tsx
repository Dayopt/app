/**
 * Plan レーン用カード（overview.md §4: アウトライン・淡色、控えめ）。
 *
 * `EntryCard.tsx` のトークン使用（タグカラー、色分けロジック）を踏襲するが、
 * DnD・overlay 計算・gap クリック導線は Step 6 の対象のため持ち込まない
 * （read 側専用の軽量プレゼンテーショナルコンポーネント）。
 */
'use client';

import { useTranslations } from 'next-intl';

import type { PlanEvent } from '@/features/entry';
import { getTagColorClasses } from '@/features/tags';
import { cn } from '@dayopt/components';

import type { TwoLanePosition } from '../../../../../lib/two-lane-layout';

export interface PlanLaneCardProps {
  event: PlanEvent;
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

/** skip 済み plan の斜線ハッチング背景。EntryCard の skip 表現を踏襲。 */
function skippedHatchImage(accentColor: string): string {
  return `repeating-linear-gradient(45deg, transparent 0 5px, color-mix(in oklch, ${accentColor} 38%, transparent) 5px 7px)`;
}

export function PlanLaneCard({ event, position, tagColor = null, className }: PlanLaneCardProps) {
  const t = useTranslations();
  const colorClasses = tagColor ? getTagColorClasses(tagColor) : null;
  const borderClass = colorClasses?.border ?? 'border-border';

  const isSkipped = event.status === 'skipped';
  const isUnrecorded = event.status === 'unrecorded';
  const isRecorded = event.status === 'recorded';
  const showDetails = position.height >= DETAIL_HEIGHT_THRESHOLD;

  return (
    <div
      data-plan-lane-card
      data-plan-status={event.status}
      className={cn(
        'absolute overflow-hidden rounded-lg border-2 px-2 py-1 text-xs',
        borderClass,
        // skip / 記録済みは控えめに沈める。未記録の過去 plan は静かなプロンプトとして
        // 破線で「まだ何かが足りない」を示す（クリック導線は Step 6）。
        isSkipped ? 'opacity-50' : isRecorded ? 'opacity-60' : 'opacity-100',
        isUnrecorded ? 'border-dashed' : 'border-solid',
        'text-foreground bg-transparent',
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
      }}
    >
      <p className="truncate font-medium">{event.title || t('entry.untitled')}</p>
      {showDetails && (
        <p className="text-muted-foreground truncate">
          {formatTimeRange(event.displayStartDate, event.displayEndDate)}
        </p>
      )}
    </div>
  );
}

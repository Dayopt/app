/**
 * エントリカードの中身（タグ名、時間等）のコンポーネント
 */

'use client';

import { memo } from 'react';

import { useTranslations } from 'next-intl';

import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { formatTimeRange } from '@/lib/date';
import type { CalendarEvent } from '../../types/calendar-event';

interface EntryCardContentProps {
  plan: CalendarEvent;
  tagName: string | null;
  isCompact?: boolean;
  showTime?: boolean;
  timeFormat?: '12h' | '24h';
  previewTime?: { start: Date; end: Date } | null;
}

function parseStartDate(plan: CalendarEvent): Date | null {
  if (plan.startDate instanceof Date) return plan.startDate;
  if (plan.startDate) return new Date(plan.startDate);
  return null;
}

function parseEndDate(plan: CalendarEvent): Date | null {
  if (plan.endDate instanceof Date) return plan.endDate;
  if (plan.endDate) return new Date(plan.endDate);
  return null;
}

/** エントリカードの内部コンテンツ（タグ名・時間範囲・リマインダーアイコン） */
export const EntryCardContent = memo<EntryCardContentProps>(function EntryCardContent({
  plan,
  tagName,
  isCompact = false,
  showTime = true,
  timeFormat = '24h',
  previewTime = null,
}) {
  const t = useTranslations();

  const planStart = parseStartDate(plan);
  const planEnd = parseEndDate(plan);

  // 実績時間があればそちらを優先（片方のみの場合は予定時間でフォールバック）
  const hasActual = plan.actualStartDate != null || plan.actualEndDate != null;
  const displayStart = hasActual ? (plan.actualStartDate ?? planStart) : planStart;
  const displayEnd = hasActual ? (plan.actualEndDate ?? planEnd) : planEnd;

  const fallbackLabel = plan.title || t('common.tags.add');

  if (isCompact) {
    return (
      <div className="flex h-full items-center gap-1">
        {tagName ? (
          <ColonTagLabel
            name={tagName}
            className="text-foreground text-sm leading-tight font-normal"
          />
        ) : (
          <span className="text-foreground truncate text-sm leading-tight font-normal">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col gap-1 overflow-hidden">
      <div className="flex flex-shrink-0 items-baseline gap-1 text-sm leading-tight font-normal">
        {tagName ? (
          <ColonTagLabel name={tagName} className="text-foreground" />
        ) : (
          <span className="text-foreground line-clamp-2">{fallbackLabel}</span>
        )}
      </div>

      {showTime != null && (
        <div className="event-time text-muted-foreground pointer-events-none flex flex-shrink-0 items-center gap-1 text-xs leading-tight">
          <span className="mr-1 tabular-nums">
            {previewTime
              ? formatTimeRange(previewTime.start, previewTime.end, timeFormat)
              : displayStart && displayEnd
                ? formatTimeRange(displayStart, displayEnd, timeFormat)
                : t('calendar.event.noTimeSet')}
          </span>
        </div>
      )}
    </div>
  );
});

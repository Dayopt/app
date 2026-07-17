/**
 * エントリカードの中身（タグ名、時間等）のコンポーネント
 */

'use client';

import { memo } from 'react';

import { Clock, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { TagIcon } from '@/features/tags';
import { formatTimeRange } from '@/lib/date';
import type { TimeFormat } from '@dayopt/domain';
import type { CalendarEvent } from '../../types/calendar-event';

interface TimeblockCardContentProps {
  plan: CalendarEvent;
  tagName: string | null;
  tagColor?: string | null;
  tagIcon?: string | null;
  isCompact?: boolean;
  showTime?: boolean;
  timeFormat?: TimeFormat;
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

function parseOptionalDate(date: Date | null | undefined): Date | null {
  if (date instanceof Date) return date;
  if (date) return new Date(date);
  return null;
}

function sameTime(
  firstStart: Date | null,
  firstEnd: Date | null,
  secondStart: Date | null,
  secondEnd: Date | null,
): boolean {
  if (!firstStart || !firstEnd || !secondStart || !secondEnd) return false;
  return (
    firstStart.getTime() === secondStart.getTime() && firstEnd.getTime() === secondEnd.getTime()
  );
}

/** エントリカードの内部コンテンツ（タグ名・時間範囲・リマインダーアイコン） */
export const TimeblockCardContent = memo<TimeblockCardContentProps>(function TimeblockCardContent({
  plan,
  tagName,
  tagColor = null,
  tagIcon = null,
  isCompact = false,
  showTime = true,
  timeFormat = '24h',
  previewTime = null,
}) {
  const t = useTranslations();

  const planStart = parseStartDate(plan);
  const planEnd = parseEndDate(plan);
  const plannedStart = parseOptionalDate(plan.plannedStartDate) ?? planStart;
  const plannedEnd = parseOptionalDate(plan.plannedEndDate) ?? planEnd;
  const actualStart = parseOptionalDate(plan.actualStartDate);
  const actualEnd = parseOptionalDate(plan.actualEndDate);

  // 実績時間があればそちらを優先（片方のみの場合は予定時間でフォールバック）
  const hasActual = actualStart != null || actualEnd != null;
  const displayStart = hasActual ? (actualStart ?? planStart) : planStart;
  const displayEnd = hasActual ? (actualEnd ?? planEnd) : planEnd;
  const actualDisplayStart = actualStart ?? planStart;
  const actualDisplayEnd = actualEnd ?? planEnd;
  const showBothTimes =
    plan.origin === 'planned' &&
    hasActual &&
    !sameTime(plannedStart, plannedEnd, actualDisplayStart, actualDisplayEnd);
  const previewLabel =
    plan.origin === 'unplanned'
      ? t('timeblock.inspector.time.actual')
      : t('timeblock.inspector.time.planned');
  const timeRows = previewTime
    ? [
        {
          key: 'preview',
          label: previewLabel,
          start: previewTime.start,
          end: previewTime.end,
          isActual: plan.origin === 'unplanned',
        },
      ]
    : showBothTimes
      ? [
          {
            key: 'planned',
            label: t('timeblock.inspector.time.planned'),
            start: plannedStart,
            end: plannedEnd,
            isActual: false,
          },
          {
            key: 'actual',
            label: t('timeblock.inspector.time.actual'),
            start: actualDisplayStart,
            end: actualDisplayEnd,
            isActual: true,
          },
        ]
      : [
          {
            key: hasActual || plan.origin === 'unplanned' ? 'actual' : 'planned',
            label:
              hasActual || plan.origin === 'unplanned'
                ? t('timeblock.inspector.time.actual')
                : t('timeblock.inspector.time.planned'),
            start: displayStart,
            end: displayEnd,
            isActual: hasActual || plan.origin === 'unplanned',
          },
        ];

  const fallbackLabel = plan.title || t('common.tags.add');

  if (isCompact) {
    return (
      <div className="flex h-full items-center gap-1">
        <TagIcon icon={tagIcon} color={tagColor} size="sm" className="shrink-0" />
        {tagName ? (
          <span className="text-foreground truncate text-sm leading-tight font-normal">
            {tagName}
          </span>
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
      <div className="flex flex-shrink-0 items-center gap-1 text-sm leading-tight font-normal">
        <TagIcon icon={tagIcon} color={tagColor} size="sm" className="shrink-0" />
        {tagName ? (
          <span className="text-foreground truncate">{tagName}</span>
        ) : (
          <span className="text-foreground line-clamp-2">{fallbackLabel}</span>
        )}
      </div>

      {showTime != null && (
        <div className="event-time pointer-events-none flex flex-shrink-0 flex-col items-start gap-0.5 text-xs leading-tight">
          {timeRows.map((row) => (
            <div
              key={row.key}
              data-entry-time-kind={row.isActual ? 'actual' : 'planned'}
              className="flex max-w-full min-w-0 items-center gap-1"
            >
              <span className="sr-only">{row.label}</span>
              {row.isActual ? (
                <Play
                  aria-hidden="true"
                  className="text-foreground size-3 shrink-0"
                  strokeWidth={2}
                />
              ) : (
                <Clock
                  aria-hidden="true"
                  className="text-muted-foreground size-3 shrink-0"
                  strokeWidth={2}
                />
              )}
              <span className="text-muted-foreground min-w-0 truncate whitespace-nowrap tabular-nums">
                {row.start && row.end
                  ? formatTimeRange(row.start, row.end, timeFormat, ' 〜 ')
                  : t('calendar.event.noTimeSet')}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

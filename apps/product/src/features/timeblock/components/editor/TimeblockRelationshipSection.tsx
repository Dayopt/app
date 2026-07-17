'use client';

import { useId } from 'react';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ErrorState } from '@/components/ui/feedback/ErrorState';
import { TagIcon } from '@/features/tags';
import { formatDurationMinutes, isSameDay } from '@/lib/date';
import { useDateFormat } from '@/lib/hooks/useDateFormat';
import { Skeleton } from '@dayopt/components';

import type { TimeblockDestination } from '../../domain/timeblock-destination';

export interface TimeblockRelationshipItem {
  id: string;
  tagName: string;
  tagColor: string | null;
  tagIcon: string | null;
  startAt: Date;
  endAt: Date;
}

type RelationshipStatus = 'loading' | 'error' | 'success' | 'unavailable';

interface SharedRelationshipProps {
  status: RelationshipStatus;
  onOpen: (id: string, kind: TimeblockDestination) => void;
  onRetry: () => void;
}

type TimeblockRelationshipSectionProps = SharedRelationshipProps &
  (
    | {
        kind: 'plan';
        records: readonly TimeblockRelationshipItem[];
      }
    | {
        kind: 'record';
        plan: TimeblockRelationshipItem | null;
      }
  );

function getDurationMinutes(item: TimeblockRelationshipItem): number {
  return Math.max(0, Math.round((item.endAt.getTime() - item.startAt.getTime()) / 60_000));
}

/** Plan / Record の関係を、人間が読めるタグと日時で表示する。 */
export function TimeblockRelationshipSection(props: TimeblockRelationshipSectionProps) {
  const t = useTranslations('timeblock.relationships');
  const { formatDate, formatTime } = useDateFormat();
  const headingId = useId();
  const heading = props.kind === 'plan' ? t('relatedRecords') : t('originalPlan');

  if (props.kind === 'plan' && props.status === 'success' && props.records.length === 0) {
    return null;
  }

  const renderItem = (item: TimeblockRelationshipItem, kind: TimeblockDestination) => {
    const startDate = formatDate(item.startAt);
    const startTime = formatTime(item.startAt);
    const endTime = formatTime(item.endAt);
    const dateTime = isSameDay(item.startAt, item.endAt)
      ? `${startDate} · ${startTime}–${endTime}`
      : `${startDate} ${startTime}–${formatDate(item.endAt)} ${endTime}`;
    const duration = formatDurationMinutes(getDurationMinutes(item));
    const openLabel = t(kind === 'record' ? 'openRecord' : 'openPlan', {
      tag: item.tagName,
      dateTime,
      duration,
    });

    return (
      <button
        key={item.id}
        type="button"
        className="hover:bg-state-hover focus-visible:ring-ring flex min-h-11 w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
        aria-label={openLabel}
        onClick={() => props.onOpen(item.id, kind)}
      >
        <TagIcon icon={item.tagIcon} color={item.tagColor} size="sm" className="shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="text-foreground block truncate text-sm">{item.tagName}</span>
          <span className="text-muted-foreground block truncate font-mono text-xs tabular-nums">
            {dateTime}
          </span>
        </span>
        <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
          {duration}
        </span>
        <ChevronRight className="text-muted-foreground size-3.5 shrink-0" aria-hidden="true" />
      </button>
    );
  };

  return (
    <section className="border-border-subtle border-t pt-4" aria-labelledby={headingId}>
      <div className="flex min-h-6 items-center justify-between gap-2 px-2">
        <h2 id={headingId} className="text-foreground text-sm font-medium">
          {heading}
        </h2>
        {props.kind === 'plan' && props.status === 'success' ? (
          <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
            {t('recordSummary', {
              count: props.records.length,
              duration: formatDurationMinutes(
                props.records.reduce((total, record) => total + getDurationMinutes(record), 0),
              ),
            })}
          </span>
        ) : null}
      </div>

      {props.status === 'loading' ? (
        <div className="space-y-2 pt-2" role="status" aria-label={heading}>
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      ) : null}

      {props.status === 'error' ? (
        <ErrorState title={t('loadFailed')} onRetry={props.onRetry} size="sm" className="pt-2" />
      ) : null}

      {props.status === 'unavailable' ||
      (props.kind === 'record' && props.status === 'success' && !props.plan) ? (
        <p className="text-muted-foreground px-2 pt-2 text-sm">{t('originalPlanUnavailable')}</p>
      ) : null}

      {props.status === 'success' ? (
        <div className="pt-2">
          {props.kind === 'plan'
            ? props.records.map((record) => renderItem(record, 'record'))
            : props.plan
              ? renderItem(props.plan, 'plan')
              : null}
        </div>
      ) : null}
    </section>
  );
}

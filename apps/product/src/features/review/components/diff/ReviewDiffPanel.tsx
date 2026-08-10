'use client';

import { ArrowDown, ArrowUp, Circle, GitCompareArrows, Minus, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { useTagsMap } from '@/features/tags';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { Button, cn } from '@dayopt/components';

export type ReviewDiffKind =
  'unplanned' | 'missed' | 'recorded' | 'resized' | 'shifted' | 'skipped' | 'unrecorded';

export interface ReviewDiffItem {
  id: string;
  timeblockId: string;
  kind: ReviewDiffKind;
  title: string;
  tagId: string | null;
  color: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  plannedMinutes: number;
  actualMinutes: number;
  diffMinutes: number;
  startDiffMinutes: number;
  endDiffMinutes: number;
  sortTime: number;
}

export interface ReviewDiffSummary {
  plannedMinutes: number;
  actualMinutes: number;
  diffMinutes: number;
  unplannedMinutes: number;
  missedMinutes: number;
  unrecordedMinutes?: number | undefined;
}

export interface ReviewDiffResult {
  summary: ReviewDiffSummary;
  items: readonly ReviewDiffItem[];
}

interface ReviewDiffPanelProps {
  diff: ReviewDiffResult;
  onItemClick?: ((timeblockId: string) => void) | undefined;
  onClose?: (() => void) | undefined;
  variant?: 'rail' | 'sheet' | undefined;
  className?: string | undefined;
}

const KIND_ICON = {
  unplanned: Plus,
  missed: Minus,
  shifted: GitCompareArrows,
  resized: GitCompareArrows,
  recorded: GitCompareArrows,
  skipped: Minus,
  unrecorded: Minus,
} satisfies Record<ReviewDiffKind, typeof Plus>;

export function ReviewDiffPanel({
  diff,
  onItemClick,
  onClose,
  variant = 'rail',
  className,
}: ReviewDiffPanelProps) {
  const t = useTranslations();
  const locale = useLocale();
  const { timeFormat, timezone } = useUserPreferences();
  const { getTagById } = useTagsMap();
  const isSheet = variant === 'sheet';
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: timeFormat === '24h' ? 'h23' : 'h12',
        timeZone: timezone,
      }),
    [locale, timeFormat, timezone],
  );

  return (
    <section
      className={cn('flex min-h-0 w-full flex-col', className)}
      aria-label={t('calendar.compare.rail.title')}
    >
      <header className={cn('shrink-0', !isSheet && 'border-border-subtle border-b')}>
        <div className="flex h-12 items-center gap-2 px-4">
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium">
            {t('calendar.compare.rail.title')}
          </h2>
          {onClose ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon
              className={cn(
                'text-muted-foreground hover:text-foreground -mr-2',
                isSheet && 'min-h-11 min-w-11',
              )}
              onClick={onClose}
              aria-label={t('common.actions.close')}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <dl className="mx-4 mt-2 mb-4 flex flex-col gap-2">
          <SummaryMetric
            label={t('calendar.compare.rail.summary.diff')}
            value={formatSignedDuration(t, diff.summary.diffMinutes)}
            valueClassName="text-foreground"
            emphasis
          />
          <SummaryMetric
            label={t('calendar.compare.rail.summary.planned')}
            value={formatDuration(t, diff.summary.plannedMinutes)}
          />
          <SummaryMetric
            label={t('calendar.compare.rail.summary.actual')}
            value={formatDuration(t, diff.summary.actualMinutes)}
          />
          <SummaryMetric
            label={t('calendar.compare.rail.summary.unplanned')}
            value={formatDuration(t, diff.summary.unplannedMinutes)}
          />
          <SummaryMetric
            label={t('calendar.compare.rail.summary.missed')}
            value={formatDuration(t, diff.summary.missedMinutes)}
          />
          {diff.summary.unrecordedMinutes != null ? (
            <SummaryMetric
              label={t('calendar.compare.rail.summary.unrecorded')}
              value={formatDuration(t, diff.summary.unrecordedMinutes)}
            />
          ) : null}
        </dl>
      </header>

      {diff.items.length === 0 ? (
        <div
          className={cn(
            'flex flex-col items-center px-6 py-8 text-center',
            isSheet ? 'shrink-0' : 'min-h-0 flex-1 justify-center',
          )}
        >
          <Circle className="text-muted-foreground size-8" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium">{t('calendar.compare.rail.emptyTitle')}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('calendar.compare.rail.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className={cn('min-h-0 overflow-y-auto p-2', isSheet ? 'max-h-96' : 'flex-1')}>
          <ol className="flex flex-col gap-1">
            {diff.items.map((item) => {
              const tag = item.tagId ? getTagById(item.tagId) : null;
              const Icon = KIND_ICON[item.kind];
              const rangeStart = item.actualStart ?? item.plannedStart;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="hover:bg-state-hover focus-visible:ring-ring flex min-h-11 w-full min-w-0 items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => onItemClick?.(item.timeblockId)}
                  >
                    <span
                      className="mt-1 h-8 w-1 shrink-0 rounded-full"
                      style={{ backgroundColor: tag ? `var(--tag-${tag.color})` : item.color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="truncate text-sm font-medium">
                          {item.title || t('calendar.event.noTitle')}
                        </span>
                      </span>
                      <span className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                        <span className="tabular-nums">
                          {rangeStart
                            ? timeFormatter.format(rangeStart)
                            : t('calendar.event.noTimeSet')}
                        </span>
                        <span>{kindLabel(t, item.kind)}</span>
                      </span>
                    </span>
                    <DiffBadge item={item} />
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  valueClassName,
  emphasis = false,
}: {
  label: string;
  value: string;
  valueClassName?: string | undefined;
  emphasis?: boolean | undefined;
}) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-4">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd
        className={cn(
          'text-right text-sm font-medium tabular-nums',
          emphasis && 'text-base',
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function DiffBadge({ item }: { item: ReviewDiffItem }) {
  const t = useTranslations();

  if (item.diffMinutes === 0 && item.startDiffMinutes === 0 && item.endDiffMinutes === 0) {
    return null;
  }

  const content = diffBadgeLabel(t, item);
  const pointsUp = item.kind === 'unplanned' || item.diffMinutes > 0 || item.startDiffMinutes < 0;
  const Icon = pointsUp ? ArrowUp : ArrowDown;

  return (
    <span
      data-review-diff-badge
      className="bg-container text-muted-foreground border-border-subtle mt-1 flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 text-xs tabular-nums"
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {content}
    </span>
  );
}

function diffBadgeLabel(
  t: ReturnType<typeof useTranslations<never>>,
  item: ReviewDiffItem,
): string {
  if (item.kind === 'unplanned') return formatSignedDuration(t, item.actualMinutes);
  if (item.kind === 'missed' || item.kind === 'skipped' || item.kind === 'unrecorded') {
    return formatSignedDuration(t, -item.plannedMinutes);
  }

  if (item.kind === 'shifted' && item.startDiffMinutes !== 0) {
    const duration = formatDuration(t, Math.abs(item.startDiffMinutes));
    return item.startDiffMinutes > 0
      ? t('calendar.compare.rail.badge.late', { duration })
      : t('calendar.compare.rail.badge.early', { duration });
  }

  return formatSignedDuration(t, item.diffMinutes);
}

function kindLabel(t: ReturnType<typeof useTranslations<never>>, kind: ReviewDiffKind): string {
  switch (kind) {
    case 'unplanned':
      return t('calendar.compare.rail.kind.unplanned');
    case 'missed':
      return t('calendar.compare.rail.kind.missed');
    case 'shifted':
      return t('calendar.compare.rail.kind.shifted');
    case 'resized':
      return t('calendar.compare.rail.kind.resized');
    case 'recorded':
      return t('calendar.compare.rail.kind.recorded');
    case 'skipped':
      return t('calendar.compare.rail.kind.skipped');
    case 'unrecorded':
      return t('calendar.compare.rail.kind.unrecorded');
  }
}

function formatSignedDuration(
  t: ReturnType<typeof useTranslations<never>>,
  minutes: number,
): string {
  if (minutes === 0) return formatDuration(t, 0);
  return `${minutes > 0 ? '+' : '-'}${formatDuration(t, Math.abs(minutes))}`;
}

function formatDuration(t: ReturnType<typeof useTranslations<never>>, minutes: number): string {
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;

  if (hours > 0 && rest > 0) {
    return t('calendar.toast.durationHoursMinutes', { hours, minutes: rest });
  }
  if (hours > 0) return t('calendar.toast.durationHours', { hours });
  return t('calendar.toast.durationMinutes', { minutes: rest });
}

'use client';

import { ArrowDown, ArrowUp, Circle, GitCompareArrows, Minus, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { useTagsMap } from '@/features/tags';
import { useUserPreferences } from '@/lib/hooks/useUserPreferences';
import { cn } from '@/lib/utils';
import { Button } from '@dayopt/components';

import type {
  CalendarDayDiffItem,
  CalendarDayDiffKind,
  CalendarDayDiffResult,
} from '../../lib/day-diff';
import type { CalendarEvent } from '../../types/calendar.types';

interface CalendarDayDiffRailProps {
  diff: CalendarDayDiffResult;
  entries: readonly CalendarEvent[];
  onEntryClick: (entry: CalendarEvent) => void;
  onClose?: (() => void) | undefined;
  className?: string | undefined;
}

const KIND_ICON = {
  unplanned: Plus,
  missed: Minus,
  shifted: GitCompareArrows,
  resized: GitCompareArrows,
} satisfies Record<CalendarDayDiffKind, typeof Plus>;

export function CalendarDayDiffRail({
  diff,
  entries,
  onEntryClick,
  onClose,
  className,
}: CalendarDayDiffRailProps) {
  const t = useTranslations();
  const locale = useLocale();
  const timezone = useUserPreferences((s) => s.timezone);
  const { getTagById } = useTagsMap();
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: timezone,
      }),
    [locale, timezone],
  );

  return (
    <section
      className={cn('bg-background flex min-h-0 w-full flex-col', className)}
      aria-label={t('calendar.compare.rail.title')}
    >
      <header className="border-border-subtle shrink-0 border-b">
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
              className="text-muted-foreground hover:text-foreground -mr-2"
              onClick={onClose}
              aria-label={t('actions.close')}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          ) : null}
        </div>
        <dl className="bg-container mx-4 mt-2 mb-4 flex flex-col gap-4 rounded-lg p-4">
          <SummaryMetric
            label={t('calendar.compare.rail.summary.diff')}
            value={formatSignedDuration(t, diff.summary.diffMinutes)}
            valueClassName={diff.summary.diffMinutes >= 0 ? 'text-success' : 'text-destructive'}
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
        </dl>
      </header>

      {diff.items.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <Circle className="text-muted-foreground size-8" aria-hidden="true" />
          <p className="mt-4 text-sm font-medium">{t('calendar.compare.rail.emptyTitle')}</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {t('calendar.compare.rail.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <ol className="flex flex-col gap-1">
            {diff.items.map((item) => {
              const entry = entryById.get(item.entryId);
              const tag = item.tagId ? getTagById(item.tagId) : null;
              const Icon = KIND_ICON[item.kind];
              const rangeStart = item.actualStart ?? item.plannedStart;

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="hover:bg-state-hover focus-visible:ring-ring flex min-h-11 w-full min-w-0 items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
                    onClick={() => {
                      if (entry) onEntryClick(entry);
                    }}
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
                        <span className="font-mono tabular-nums">
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
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={cn(
          'mt-1 font-mono font-medium tabular-nums',
          emphasis ? 'text-lg' : 'text-sm',
          valueClassName,
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function DiffBadge({ item }: { item: CalendarDayDiffItem }) {
  const t = useTranslations();

  const content = diffBadgeLabel(t, item);
  const isPositive = item.kind === 'unplanned' || item.diffMinutes > 0 || item.startDiffMinutes < 0;
  const Icon = isPositive ? ArrowUp : ArrowDown;

  return (
    <span
      className={cn(
        'bg-container border-border-subtle mt-1 flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1 font-mono text-xs tabular-nums',
        isPositive ? 'text-success' : 'text-destructive',
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {content}
    </span>
  );
}

function diffBadgeLabel(t: ReturnType<typeof useTranslations>, item: CalendarDayDiffItem): string {
  if (item.kind === 'unplanned') return formatSignedDuration(t, item.actualMinutes);
  if (item.kind === 'missed') return formatSignedDuration(t, -item.plannedMinutes);

  if (item.kind === 'shifted' && item.startDiffMinutes !== 0) {
    const duration = formatDuration(t, Math.abs(item.startDiffMinutes));
    return item.startDiffMinutes > 0
      ? t('calendar.compare.rail.badge.late', { duration })
      : t('calendar.compare.rail.badge.early', { duration });
  }

  return formatSignedDuration(t, item.diffMinutes);
}

function kindLabel(t: ReturnType<typeof useTranslations>, kind: CalendarDayDiffKind): string {
  switch (kind) {
    case 'unplanned':
      return t('calendar.compare.rail.kind.unplanned');
    case 'missed':
      return t('calendar.compare.rail.kind.missed');
    case 'shifted':
      return t('calendar.compare.rail.kind.shifted');
    case 'resized':
      return t('calendar.compare.rail.kind.resized');
  }
}

function formatSignedDuration(t: ReturnType<typeof useTranslations>, minutes: number): string {
  if (minutes === 0) return formatDuration(t, 0);
  return `${minutes > 0 ? '+' : '-'}${formatDuration(t, Math.abs(minutes))}`;
}

function formatDuration(t: ReturnType<typeof useTranslations>, minutes: number): string {
  const abs = Math.abs(minutes);
  const hours = Math.floor(abs / 60);
  const rest = abs % 60;

  if (hours > 0 && rest > 0) {
    return t('calendar.toast.durationHoursMinutes', { hours, minutes: rest });
  }
  if (hours > 0) return t('calendar.toast.durationHours', { hours });
  return t('calendar.toast.durationMinutes', { minutes: rest });
}

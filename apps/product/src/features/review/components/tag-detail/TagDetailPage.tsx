'use client';

import { BarChart3, CalendarClock, Clock, Diff, ListChecks } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useMemo } from 'react';

import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { TagIcon } from '@/features/tags';
import { formatDateShort, formatDurationMinutes, formatTimeRange } from '@/lib/date';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@dayopt/components';

import { useTagDashboardData } from '../../hooks/useTagDetailData';
import { parseReviewDateParam } from '../../lib/date-param';
import { formatMetricValue } from '../../lib/metrics';
import type { ReviewGranularity } from '../../stores/useReviewFilterStore';
import { useReviewFilterStore } from '../../stores/useReviewFilterStore';

import { TagDetailTitle } from './TagDetailTitle';

interface TagDetailPageProps {
  tagId: string;
  initialGranularity: ReviewGranularity;
  initialDateStr: string;
}

type DashboardData = NonNullable<ReturnType<typeof useTagDashboardData>['data']>;
type DashboardEntry = DashboardData['entries'][number];
type DailyRow = DashboardData['dailyRows'][number];

function formatSignedMinutes(minutes: number): string {
  if (minutes === 0) return '0m';
  const sign = minutes > 0 ? '+' : '-';
  return `${sign}${formatDurationMinutes(Math.abs(minutes))}`;
}

function dateFromKey(dateKey: string): Date {
  return new Date(dateKey + 'T00:00:00');
}

function KpiCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: typeof Clock;
  tone: 'neutral' | 'plan' | 'actual' | 'diffPositive' | 'diffNegative';
}) {
  return (
    <Card className="gap-3 rounded-lg py-4 shadow-none">
      <CardContent className="flex items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-xs font-medium">{label}</p>
          <p
            className={cn(
              'mt-2 truncate text-2xl leading-none font-semibold tabular-nums',
              tone === 'diffPositive' && 'text-success',
              tone === 'diffNegative' && 'text-destructive',
            )}
          >
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            tone === 'plan' && 'bg-info-tint text-info',
            tone === 'actual' && 'bg-tag-teal-tint text-tag-teal',
            tone === 'diffPositive' && 'bg-success-tint text-success',
            tone === 'diffNegative' && 'bg-destructive-tint text-destructive',
            tone === 'neutral' && 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="size-4" />
        </div>
      </CardContent>
    </Card>
  );
}

function DailyActualBars({ rows, locale }: { rows: DailyRow[]; locale: string }) {
  const t = useTranslations('calendar.stats.tagDetail');
  const maxMinutes = Math.max(...rows.map((row) => row.actualMinutes), 1);

  return (
    <Card className="gap-4 rounded-lg py-5 shadow-none">
      <CardHeader className="px-5">
        <CardTitle className="text-sm">{t('dailyActual')}</CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.date} className="grid grid-cols-12 items-center gap-3">
              <span className="text-muted-foreground col-span-3 text-xs sm:col-span-2">
                {formatDateShort(dateFromKey(row.date), locale)}
              </span>
              <div className="bg-muted col-span-6 h-2 overflow-hidden rounded-full sm:col-span-8">
                <div
                  className="bg-tag-teal h-full rounded-full"
                  style={{ width: `${Math.max(3, (row.actualMinutes / maxMinutes) * 100)}%` }}
                />
              </div>
              <span className="col-span-3 text-right font-mono text-xs tabular-nums sm:col-span-2">
                {formatDurationMinutes(row.actualMinutes)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PlanActualRows({ rows, locale }: { rows: DailyRow[]; locale: string }) {
  const t = useTranslations('calendar.stats.tagDetail');
  const maxMinutes = Math.max(...rows.flatMap((row) => [row.plannedMinutes, row.actualMinutes]), 1);

  return (
    <Card className="gap-4 rounded-lg py-5 shadow-none">
      <CardHeader className="px-5">
        <CardTitle className="text-sm">{t('planActual')}</CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.date} className="grid grid-cols-12 items-center gap-3">
              <span className="text-muted-foreground col-span-3 text-xs sm:col-span-2">
                {formatDateShort(dateFromKey(row.date), locale)}
              </span>
              <div className="col-span-6 space-y-1.5 sm:col-span-8">
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-info h-full rounded-full"
                    style={{ width: `${Math.max(3, (row.plannedMinutes / maxMinutes) * 100)}%` }}
                  />
                </div>
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-tag-teal h-full rounded-full"
                    style={{ width: `${Math.max(3, (row.actualMinutes / maxMinutes) * 100)}%` }}
                  />
                </div>
              </div>
              <span
                className={cn(
                  'col-span-3 text-right font-mono text-xs font-medium tabular-nums sm:col-span-2',
                  row.diffMinutes > 0 && 'text-success',
                  row.diffMinutes < 0 && 'text-destructive',
                  row.diffMinutes === 0 && 'text-muted-foreground',
                )}
              >
                {formatSignedMinutes(row.diffMinutes)}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function EntryTime(entry: DashboardEntry): string {
  const start = entry.actualStartTime ?? entry.startTime;
  const end = entry.actualEndTime ?? entry.endTime;
  if (start == null || end == null) return '';
  return formatTimeRange(new Date(start), new Date(end));
}

function EntriesTable({ entries, locale }: { entries: DashboardEntry[]; locale: string }) {
  const t = useTranslations('calendar.stats.tagDetail');

  return (
    <Card className="gap-4 rounded-lg py-5 shadow-none">
      <CardHeader className="px-5">
        <CardTitle className="text-sm">{t('entryList')}</CardTitle>
      </CardHeader>
      <CardContent className="px-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-border text-muted-foreground border-b text-left text-xs">
                <th className="pb-2 font-medium">{t('date')}</th>
                <th className="pb-2 font-medium">{t('time')}</th>
                <th className="pb-2 font-medium">{t('tag')}</th>
                <th className="pb-2 font-medium">{t('content')}</th>
                <th className="pb-2 font-medium">{t('memo')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.entryId} className="border-border border-b last:border-b-0">
                  <td className="text-muted-foreground py-3 text-xs whitespace-nowrap">
                    {formatDateShort(dateFromKey(entry.date), locale)}
                  </td>
                  <td className="py-3 font-mono text-xs whitespace-nowrap">{EntryTime(entry)}</td>
                  <td className="py-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <TagIcon
                        icon={entry.tag.icon}
                        color={entry.tag.color}
                        size="sm"
                        className="shrink-0"
                      />
                      <span className="max-w-32 truncate text-xs">{entry.tag.name}</span>
                    </div>
                  </td>
                  <td className="max-w-56 py-3">
                    <span className="line-clamp-1">{entry.title ?? t('untitled')}</span>
                  </td>
                  <td className="text-muted-foreground max-w-72 py-3 text-xs">
                    <span className="line-clamp-1">{entry.description ?? ''}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-56 rounded-lg" />
      <Skeleton className="h-64 rounded-lg" />
    </div>
  );
}

export function TagDetailPage({ tagId, initialGranularity, initialDateStr }: TagDetailPageProps) {
  const t = useTranslations('calendar.stats.tagDetail');
  const locale = useLocale();

  const granularity = initialGranularity;
  const currentDate = useMemo(() => parseReviewDateParam(initialDateStr), [initialDateStr]);

  const syncGranularity = useReviewFilterStore((s) => s.setGranularity);
  const syncCurrentDate = useReviewFilterStore((s) => s.setCurrentDate);
  useEffect(() => {
    syncGranularity(granularity);
    syncCurrentDate(currentDate);
  }, [granularity, currentDate, syncGranularity, syncCurrentDate]);

  const { data, isPending, isError, refetch } = useTagDashboardData(tagId);

  if (isPending) {
    return (
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="p-4">
          <DashboardSkeleton />
        </div>
      </div>
    );
  }

  if (isError || data == null) {
    return (
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="p-4">
          <ErrorState title={t('errorTitle')} onRetry={() => refetch()} size="sm" centered />
        </div>
      </div>
    );
  }

  const diffTone = data.summary.diffMinutes >= 0 ? 'diffPositive' : 'diffNegative';
  const hasRows = data.dailyRows.length > 0;

  return (
    <div className="scrollbar-stable flex-1 overflow-y-auto">
      <div className="flex flex-col gap-5 p-4">
        <TagDetailTitle
          tagId={tagId}
          tagName={data.tag.name}
          tagIcon={data.tag.icon}
          tagColor={data.tag.color}
          granularity={granularity}
          dateStr={initialDateStr}
        />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label={t('kpiTotal')}
            value={formatMetricValue(data.summary.totalMinutes, 'duration')}
            icon={Clock}
            tone="neutral"
          />
          <KpiCard
            label={t('kpiPlanned')}
            value={formatMetricValue(data.summary.plannedMinutes, 'duration')}
            icon={CalendarClock}
            tone="plan"
          />
          <KpiCard
            label={t('kpiActual')}
            value={formatMetricValue(data.summary.actualMinutes, 'duration')}
            icon={BarChart3}
            tone="actual"
          />
          <KpiCard
            label={t('kpiDiff')}
            value={formatSignedMinutes(data.summary.diffMinutes)}
            icon={Diff}
            tone={diffTone}
          />
        </div>

        {!hasRows ? (
          <Card className="rounded-lg py-10 shadow-none">
            <CardContent>
              <EmptyState icon={ListChecks} title={t('noData')} size="sm" centered />
            </CardContent>
          </Card>
        ) : (
          <>
            <DailyActualBars rows={data.dailyRows} locale={locale} />
            <PlanActualRows rows={data.dailyRows} locale={locale} />
            <EntriesTable entries={data.entries} locale={locale} />
          </>
        )}
      </div>
    </div>
  );
}

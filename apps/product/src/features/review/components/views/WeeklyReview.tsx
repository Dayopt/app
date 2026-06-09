'use client';

import { BarChart3, CalendarClock, Clock3, Gauge, Trophy } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { useRouter } from 'next/navigation';
import type { ComponentType, ReactNode } from 'react';
import { useEffect, useMemo } from 'react';

import { resolveTagColor, TagIcon } from '@/features/tags';
import { EmptyState } from '@/lib/components/common/EmptyState';
import { ErrorState } from '@/lib/components/common/ErrorState';
import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { api } from '@/lib/trpc';
import { cn } from '@/lib/utils';

import { deriveStatement } from '@/features/review/domain/timePL/derivers';
import type { TimePLInput } from '@/features/review/domain/timePL/types';
import { useReviewPageData } from '../../hooks/useReviewPageData';
import { useTimePLData } from '../../hooks/useTimePLData';
import type { ReviewViewProps } from '../../types/review.types';
import { TagBreakdownBar } from '../review/TagBreakdownBar';
import { formatMinutesDuration } from '../time-pl/data/timePL.presentation';

interface TagSummaryRow {
  tagId: string;
  tagName: string;
  tagColor: ReturnType<typeof resolveTagColor>;
  tagIcon: string | null;
  minutes: number;
  percentage: number;
}

interface PlanActualSummary {
  plannedMinutes: number;
  actualMinutes: number;
  diffMinutes: number;
  under: {
    tagId: string;
    tagName: string;
    tagColor: ReturnType<typeof resolveTagColor>;
    tagIcon: string | null;
    diffMinutes: number;
  } | null;
  over: {
    tagId: string;
    tagName: string;
    tagColor: ReturnType<typeof resolveTagColor>;
    tagIcon: string | null;
    diffMinutes: number;
  } | null;
}

/**
 * WeeklyReview - 週次振り返りビュー
 *
 * Review の入口として、期間内の時間の流れを要約する。
 * 深掘りはタグ詳細や今後の詳細ページに委ね、ここでは判断材料だけを並べる。
 */
export function WeeklyReview({ className }: ReviewViewProps) {
  const t = useTranslations('calendar.stats');
  const locale = useLocale();
  const router = useRouter();

  const {
    data: pageData,
    isPending,
    isFetching,
    isError: isStatsError,
    dateRange,
  } = useReviewPageData();

  const { data: timePLData, isPending: isTimePLPending, isError: isTimePLError } = useTimePLData();
  const fallbackTimeByTagQuery = api.entries.getTimeByTag.useQuery(
    {
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    },
    {
      enabled: isStatsError || !pageData?.timeByTag?.length,
    },
  );

  const planActualSummary = useMemo(() => derivePlanActualSummary(timePLData), [timePLData]);
  const totalTrackedMinutes = pageData?.overview.totalMinutes ?? planActualSummary.actualMinutes;
  const fallbackTimeByTag = fallbackTimeByTagQuery.data;
  const timeByTag = pageData?.timeByTag?.length ? pageData.timeByTag : fallbackTimeByTag;
  const tagRows = useMemo<TagSummaryRow[]>(() => {
    if (!timeByTag && !timePLData) return [];

    const rows = timeByTag
      ? timeByTag.map((tag) => {
          const minutes = Math.round(tag.hours * 60);
          return {
            tagId: tag.tagId,
            tagName: tag.name,
            tagColor: resolveTagColor(tag.color),
            tagIcon: null,
            minutes,
          };
        })
      : (timePLData?.tags.map((tag) => ({
          tagId: tag.tagId,
          tagName: tag.tagName,
          tagColor: tag.tagColor,
          tagIcon: tag.tagIcon ?? null,
          minutes: tag.actualMinutes,
        })) ?? []);

    return rows
      .filter((tag) => tag.minutes > 0)
      .map((tag) => ({
        ...tag,
        percentage:
          totalTrackedMinutes > 0 ? Math.round((tag.minutes / totalTrackedMinutes) * 100) : 0,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [timeByTag, timePLData, totalTrackedMinutes]);

  const tagSegments = tagRows.map((tag) => ({
    tagId: tag.tagId,
    tagName: tag.tagName,
    tagColor: tag.tagColor,
    tagIcon: tag.tagIcon,
    minutes: tag.minutes,
  }));
  const topTag = tagRows[0] ?? null;
  const blankMinutes = useMemo(() => {
    if (timePLData) {
      return Math.max(0, timePLData.availableMinutes - planActualSummary.actualMinutes);
    }

    const blankRate = pageData?.blankRate;
    if (!blankRate) return 0;
    return Math.max(0, blankRate.availableMinutes - blankRate.scheduledMinutes);
  }, [timePLData, planActualSummary.actualMinutes, pageData?.blankRate]);

  // タグ詳細ルートをプリフェッチ（クリック前にRSCペイロードを準備）
  const tagIds = useMemo(() => tagRows.map((tag) => tag.tagId), [tagRows]);
  useEffect(() => {
    for (const id of tagIds) {
      router.prefetch(`/${locale}/review/tags/${id}`);
    }
  }, [router, locale, tagIds]);

  const handleTagClick = (tagId: string) => {
    router.push(`/${locale}/review/tags/${tagId}`);
  };

  // エラー状態
  if (isStatsError && isTimePLError && fallbackTimeByTagQuery.isError) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <ErrorState title={t('review.errorTitle')} description={t('review.errorDescription')} />
      </div>
    );
  }

  // 空状態判定
  const isAllLoaded = !isPending && !isTimePLPending && !fallbackTimeByTagQuery.isPending;
  const hasNoData =
    isAllLoaded && !isFetching && !fallbackTimeByTagQuery.isFetching && tagSegments.length === 0;

  if (hasNoData) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <EmptyState
          icon={BarChart3}
          title={t('review.emptyTitle')}
          description={t('review.emptyDescription')}
          size="sm"
          centered
        />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="scrollbar-stable flex-1 overflow-y-auto">
        <div className="flex flex-col gap-4 p-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              icon={Clock3}
              label={t('overview.trackedTime')}
              value={formatMinutesDuration(totalTrackedMinutes)}
              description={t('overview.trackedTimeDesc')}
            />
            <SummaryCard
              icon={Trophy}
              label={t('overview.topTag')}
              value={topTag ? topTag.tagName : t('metrics.noData')}
              description={
                topTag
                  ? `${formatMinutesDuration(topTag.minutes)} / ${topTag.percentage}%`
                  : t('noTagData')
              }
            />
            <SummaryCard
              icon={Gauge}
              label={t('overview.planDiff')}
              value={
                isTimePLPending
                  ? t('metrics.noData')
                  : formatSignedDuration(planActualSummary.diffMinutes)
              }
              description={
                planActualSummary.diffMinutes === 0
                  ? t('overview.planDiffEven')
                  : planActualSummary.diffMinutes > 0
                    ? t('overview.planDiffOver')
                    : t('overview.planDiffUnder')
              }
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <OverviewPanel
              title={t('overview.tagTime')}
              description={t('overview.tagTimeDesc')}
              icon={<BarChart3 className="size-4" />}
              className="lg:col-span-2"
            >
              <TagBreakdownBar segments={tagSegments} onTagClick={handleTagClick} />
              <div className="divide-border mt-3 divide-y">
                {tagRows.map((tag) => (
                  <button
                    key={tag.tagId}
                    type="button"
                    className="hover:bg-state-hover flex min-h-11 w-full min-w-0 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors"
                    onClick={() => handleTagClick(tag.tagId)}
                  >
                    <TagIcon icon={tag.tagIcon ?? null} color={tag.tagColor} size="sm" />
                    <ColonTagLabel
                      name={tag.tagName}
                      className="text-foreground min-w-0 flex-1 truncate text-sm"
                    />
                    <span className="text-foreground font-mono text-sm tabular-nums">
                      {formatMinutesDuration(tag.minutes)}
                    </span>
                    <span className="text-muted-foreground w-10 text-right font-mono text-sm tabular-nums">
                      {tag.percentage}%
                    </span>
                  </button>
                ))}
              </div>
            </OverviewPanel>

            <div className="flex flex-col gap-4">
              <OverviewPanel
                title={t('overview.planActual')}
                description={t('overview.planActualDesc')}
                icon={<CalendarClock className="size-4" />}
              >
                <div className="space-y-3">
                  <PlanActualRow
                    label={t('overview.planned')}
                    value={formatMinutesDuration(planActualSummary.plannedMinutes)}
                  />
                  <PlanActualRow
                    label={t('overview.actual')}
                    value={formatMinutesDuration(planActualSummary.actualMinutes)}
                  />
                  <PlanActualRow
                    label={t('overview.diff')}
                    value={formatSignedDuration(planActualSummary.diffMinutes)}
                    emphasized
                  />
                  <VarianceHighlight
                    label={t('overview.lessThanPlanned')}
                    item={planActualSummary.under}
                  />
                  <VarianceHighlight
                    label={t('overview.moreThanPlanned')}
                    item={planActualSummary.over}
                  />
                </div>
              </OverviewPanel>

              <OverviewPanel
                title={t('overview.blankTime')}
                description={t('overview.blankTimeDesc')}
                icon={<Clock3 className="size-4" />}
              >
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-foreground font-mono text-3xl font-medium tabular-nums">
                      {formatMinutesDuration(blankMinutes)}
                    </div>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {t('overview.blankTimeNote')}
                    </p>
                  </div>
                  <div className="text-muted-foreground text-right text-xs">
                    {timePLData
                      ? t('overview.availableTime', {
                          time: formatMinutesDuration(timePLData.availableMinutes),
                        })
                      : t('metrics.noData')}
                  </div>
                </div>
              </OverviewPanel>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function derivePlanActualSummary(input: TimePLInput | null | undefined): PlanActualSummary {
  if (!input) {
    return {
      plannedMinutes: 0,
      actualMinutes: 0,
      diffMinutes: 0,
      under: null,
      over: null,
    };
  }

  const statement = deriveStatement(input);
  const rows = input.tags
    .filter((tag) => tag.budgetMinutes > 0 || tag.actualMinutes > 0)
    .map((tag) => ({
      tagId: tag.tagId,
      tagName: tag.tagName,
      tagColor: tag.tagColor,
      tagIcon: tag.tagIcon ?? null,
      diffMinutes: tag.actualMinutes - tag.budgetMinutes,
    }))
    .sort((a, b) => Math.abs(b.diffMinutes) - Math.abs(a.diffMinutes));

  return {
    plannedMinutes: statement.budgetTotal,
    actualMinutes: statement.actualTotal,
    diffMinutes: statement.actualTotal - statement.budgetTotal,
    under: rows.find((row) => row.diffMinutes < 0) ?? null,
    over: rows.find((row) => row.diffMinutes > 0) ?? null,
  };
}

function formatSignedDuration(minutes: number): string {
  if (minutes === 0) return '±0';
  const sign = minutes > 0 ? '+' : '-';
  return `${sign}${formatMinutesDuration(minutes)}`;
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="border-border-subtle bg-card flex min-h-32 flex-col justify-between rounded-lg border p-4">
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Icon className="size-4" />
        <span>{label}</span>
      </div>
      <div>
        <div className="text-foreground truncate text-2xl font-medium">{value}</div>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}

function OverviewPanel({
  title,
  description,
  icon,
  className,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn('border-border-subtle bg-card rounded-lg border p-4', className)}>
      <div className="mb-4 flex items-start gap-3">
        <div className="bg-secondary text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
          {icon}
        </div>
        <div className="min-w-0">
          <h2 className="text-foreground text-base font-medium">{title}</h2>
          <p className="text-muted-foreground mt-0.5 text-sm">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function PlanActualRow({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground text-sm">{label}</span>
      <span
        className={cn(
          'font-mono text-sm tabular-nums',
          emphasized ? 'text-foreground font-medium' : 'text-muted-foreground',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function VarianceHighlight({ label, item }: { label: string; item: PlanActualSummary['under'] }) {
  if (!item) return null;

  return (
    <div className="border-border-subtle flex min-w-0 items-center gap-2 rounded-lg border p-2">
      <TagIcon icon={item.tagIcon ?? null} color={item.tagColor} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="text-muted-foreground text-xs">{label}</div>
        <ColonTagLabel name={item.tagName} className="text-foreground block truncate text-sm" />
      </div>
      <span className="text-muted-foreground font-mono text-sm tabular-nums">
        {formatSignedDuration(item.diffMinutes)}
      </span>
    </div>
  );
}

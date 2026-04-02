'use client';

import { CalendarDays, Clock, Sparkles } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';

import { cn } from '@/lib/utils';

import type { InsightsEmptyInfo } from '../../types/insights.types';

interface InsightsEmptyStateProps {
  info: InsightsEmptyInfo;
  className?: string;
}

/**
 * InsightsEmptyState — Insights タブの空状態（3段階）
 *
 * watching AI 哲学: 事実を淡々と伝える。励ましや「おかえり」は言わない。
 *
 * - no_records: 記録なし → 前回記録への導線
 * - insufficient_data: 1-2日分 → 記録された日を認める
 * - pending_generation: 生成待ち → 予定日を表示
 */
export function InsightsEmptyState({ info, className }: InsightsEmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-4 py-12 text-center', className)}>
      {info.reason === 'no_records' && <NoRecordsState info={info} />}
      {info.reason === 'insufficient_data' && <InsufficientDataState info={info} />}
      {info.reason === 'pending_generation' && <PendingGenerationState info={info} />}
    </div>
  );
}

// =============================================================================
// State Components
// =============================================================================

function NoRecordsState({ info }: { info: InsightsEmptyInfo }) {
  const t = useTranslations('common.insights');
  const format = useFormatter();

  return (
    <>
      <CalendarDays className="text-muted-foreground size-10" />
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-sm">{t('noRecords')}</p>
        {info.lastRecordDate && (
          <p className="text-muted-foreground text-sm">
            {t('lastRecord', {
              date: format.dateTime(info.lastRecordDate, {
                month: 'numeric',
                day: 'numeric',
                weekday: 'short',
              }),
            })}
          </p>
        )}
      </div>
      {info.lastInsightPath && (
        <Link href={info.lastInsightPath} className="text-primary hover:text-primary text-sm">
          {t('viewInsights')}
        </Link>
      )}
    </>
  );
}

function InsufficientDataState({ info }: { info: InsightsEmptyInfo }) {
  const t = useTranslations('common.insights');

  return (
    <>
      <Clock className="text-muted-foreground size-10" />
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-sm">{t('insufficientData')}</p>
        <p className="text-muted-foreground text-sm">{t('insufficientDataHint')}</p>
      </div>
      {info.recordedDays && info.recordedDays.length > 0 && (
        <div className="text-muted-foreground text-sm">
          <p className="mb-1">{t('recordedDays')}</p>
          {info.recordedDays.map((day) => (
            <p key={day.dayLabel}>
              {day.dayLabel}（{day.duration}）
            </p>
          ))}
        </div>
      )}
    </>
  );
}

function PendingGenerationState({ info }: { info: InsightsEmptyInfo }) {
  const t = useTranslations('common.insights');
  const format = useFormatter();

  return (
    <>
      <Sparkles className="text-muted-foreground size-10" />
      <p className="text-foreground text-sm">
        {info.expectedDate
          ? t('pendingGeneration', {
              date: format.dateTime(info.expectedDate, {
                month: 'numeric',
                day: 'numeric',
                weekday: 'short',
              }),
            })
          : t('pendingGenerationNoDate')}
      </p>
    </>
  );
}

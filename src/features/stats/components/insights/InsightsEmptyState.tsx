'use client';

import { CalendarDays, Clock, Sparkles } from 'lucide-react';
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
  return (
    <>
      <CalendarDays className="text-muted-foreground size-10" />
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-sm font-medium">この週の記録はありません。</p>
        {info.lastRecordDate && (
          <p className="text-muted-foreground text-sm">
            前回の記録: {formatDate(info.lastRecordDate)}
          </p>
        )}
      </div>
      {info.lastInsightPath && (
        <Link
          href={info.lastInsightPath}
          className="text-primary hover:text-primary/80 text-sm font-medium"
        >
          その週のインサイトを見る →
        </Link>
      )}
    </>
  );
}

function InsufficientDataState({ info }: { info: InsightsEmptyInfo }) {
  return (
    <>
      <Clock className="text-muted-foreground size-10" />
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-sm font-medium">この週のデータが十分ではありません。</p>
        <p className="text-muted-foreground text-sm">
          3日以上の記録があるとインサイトを生成できます。
        </p>
      </div>
      {info.recordedDays && info.recordedDays.length > 0 && (
        <div className="text-muted-foreground text-sm">
          <p className="mb-1 font-medium">記録された日:</p>
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
  return (
    <>
      <Sparkles className="text-muted-foreground size-10" />
      <p className="text-foreground text-sm font-medium">
        {info.expectedDate ? `${formatDate(info.expectedDate)}に生成予定です` : '生成予定です'} ✦
      </p>
    </>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function formatDate(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
  return `${month}月${day}日（${weekday}）`;
}

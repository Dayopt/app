'use client';

import { FileSpreadsheet } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { TagIcon } from '@/features/tags';
import { cn } from '@/lib/utils';

import { formatMinutesDuration, getAccuracyColors } from '../timePL.utils';

import type { TimePLData, TimePLSectionData } from '../timePL.types';

interface TimePLStackedComparisonProps {
  data: TimePLData | null;
  className?: string;
}

/**
 * 積み上げバー対比 — Budget と Actual の2本の積み上げ棒を横に並べる
 *
 * 全体の構成比の変化が視覚的に分かる。
 */
export function TimePLStackedComparison({ data, className }: TimePLStackedComparisonProps) {
  if (!data) {
    return (
      <Card className={cn('gap-0 border-none py-0', className)}>
        <CardContent className="p-4">
          <EmptyState
            icon={FileSpreadsheet}
            title="まっさらな期間です"
            description="予定を追加すると、構成比の変化が見えてきます"
            size="sm"
            centered
          />
        </CardContent>
      </Card>
    );
  }

  const colors = getAccuracyColors(data.accuracyStatus);

  // 全タグの凡例用にマージ（Budget + Actual のユニークタグ）
  const allTags = new Map<string, { tagName: string; tagColor: string; tagIcon?: string | null }>();
  for (const row of [...data.budget.rows, ...data.actual.rows]) {
    if (!allTags.has(row.tagId)) {
      allTags.set(row.tagId, {
        tagName: row.tagName,
        tagColor: row.tagColor,
        tagIcon: row.tagIcon ?? null,
      });
    }
  }

  return (
    <Card className={cn('gap-0 border-none py-0', className)}>
      <CardHeader className="flex items-start justify-between p-4 pb-0">
        <div>
          <h3 className="text-foreground text-sm font-medium">構成比較</h3>
          <p className="text-muted-foreground text-xs">{data.period.label}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            colors.bg,
            colors.text,
          )}
        >
          {Math.round(data.accuracyRate * 100)}%
        </span>
      </CardHeader>

      <CardContent className="px-4 pt-4 pb-4">
        <div className="flex flex-col gap-4">
          <StackedBar section={data.budget} label="予算" />
          <StackedBar section={data.actual} label="実績" />
        </div>

        {/* 凡例 */}
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
          {[...allTags.entries()].map(([tagId, tag]) => (
            <span key={tagId} className="inline-flex items-center gap-1 text-xs">
              <TagIcon icon={tag.tagIcon ?? null} color={tag.tagColor} size="sm" />
              <ColonTagLabel name={tag.tagName} className="text-muted-foreground" />
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Internal ──

function StackedBar({ section, label }: { section: TimePLSectionData; label: string }) {
  const total = section.totalMinutes;
  if (total === 0) return null;

  const sorted = [...section.rows].sort((a, b) => b.minutes - a.minutes);

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-foreground text-sm font-medium">{label}</span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {formatMinutesDuration(total)}
        </span>
      </div>
      <div className="flex h-8 w-full overflow-hidden rounded-lg">
        {sorted.map((row) => {
          const pct = (row.minutes / total) * 100;
          if (pct < 1) return null;
          return (
            <div
              key={row.tagId}
              className="h-full transition-all first:rounded-l-lg last:rounded-r-lg"
              style={{
                width: `${pct}%`,
                backgroundColor: `var(--tag-${row.tagColor})`,
              }}
              title={`${row.tagName}: ${formatMinutesDuration(row.minutes)} (${Math.round(pct)}%)`}
            />
          );
        })}
      </div>
      {/* % ラベル */}
      <div className="mt-0.5 flex">
        {sorted.map((row) => {
          const pct = (row.minutes / total) * 100;
          if (pct < 8) return null;
          return (
            <div key={row.tagId} className="text-center" style={{ width: `${pct}%` }}>
              <span className="text-muted-foreground text-xs">{Math.round(pct)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

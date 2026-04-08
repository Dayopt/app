'use client';

import { FileSpreadsheet } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { TimePLSection, TimePLVarianceSection } from './TimePLSection';
import { TimePLSkeleton } from './TimePLSkeleton';
import { TimePLSummary } from './TimePLSummary';
import { getAccuracyColors } from './timePL.utils';

import type { TimePLData } from './timePL.types';

interface TimePLStatementProps {
  data: TimePLData | null;
  isLoading?: boolean;
  className?: string;
}

/** 時間損益計算書 — 予定 vs 記録を財務P/L形式で表示 */
export function TimePLStatement({ data, isLoading, className }: TimePLStatementProps) {
  if (isLoading) {
    return (
      <Card className={cn('gap-0 border-none py-0', className)}>
        <TimePLSkeleton />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card className={cn('gap-0 border-none py-0', className)}>
        <CardContent className="p-4">
          <EmptyState
            icon={FileSpreadsheet}
            title="まっさらな期間です"
            description="予定を追加すると、時間の損益が見えてきます"
            size="sm"
            centered
          />
        </CardContent>
      </Card>
    );
  }

  const colors = getAccuracyColors(data.accuracyStatus);
  const accuracyPercent = Math.round(data.accuracyRate * 100);

  const statusLabel: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
  };

  return (
    <Card className={cn('gap-0 border-none py-0', className)}>
      <CardHeader className="flex items-start justify-between p-4 pb-0">
        <div>
          <h3 className="text-foreground text-sm font-medium">時間損益計算書</h3>
          <p className="text-muted-foreground text-xs">{data.period.label}</p>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
            colors.bg,
            colors.text,
          )}
        >
          {accuracyPercent}% {statusLabel[data.accuracyStatus]}
        </span>
      </CardHeader>

      <CardContent className="px-4 pt-0 pb-4">
        <table className="w-full">
          <TimePLSection section={data.budget} />
          <TimePLSection section={data.actual} />
          <TimePLVarianceSection
            varianceRows={data.varianceRows}
            netVarianceMinutes={data.netVarianceMinutes}
          />
          <TimePLSummary data={data} />
        </table>
      </CardContent>
    </Card>
  );
}

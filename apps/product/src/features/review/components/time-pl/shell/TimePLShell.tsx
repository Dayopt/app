'use client';

import { FileSpreadsheet } from 'lucide-react';

import { EmptyState } from '@/components/ui/feedback/EmptyState';
import { Card, CardContent, CardHeader, cn, Skeleton } from '@dayopt/components';

import { getAccuracyColors } from '../data/timePL.presentation';

import type { TimePLAccuracy } from '@/features/review/domain/timePL/types';

interface TimePLShellProps {
  /** カードタイトル */
  title: string;
  /** サブタイトル（期間ラベル等） */
  subtitle?: string | undefined;
  /** 精度バッジ（null で非表示） */
  accuracy?: TimePLAccuracy | null | undefined;
  isLoading?: boolean | undefined;
  isEmpty?: boolean | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}

const STATUS_LABEL: Record<string, string> = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
};

/**
 * Time P/L 共通シェル — Card + Header + Empty + Loading を1箇所で管理
 *
 * 各 View は children として純粋な描画だけを渡す。
 */
export function TimePLShell({
  title,
  subtitle,
  accuracy,
  isLoading,
  isEmpty,
  children,
  className,
}: TimePLShellProps) {
  if (isLoading) {
    return (
      <Card className={cn('gap-0 border-none py-0', className)}>
        <CardContent className="p-4">
          <ShellSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (isEmpty) {
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

  const badge = accuracy ? <AccuracyBadge accuracy={accuracy} /> : null;

  return (
    <Card className={cn('gap-0 border-none py-0', className)}>
      <CardHeader className="flex items-start justify-between p-4 pb-0">
        <div>
          <h3 className="text-foreground text-sm font-medium">{title}</h3>
          {subtitle && <p className="text-muted-foreground text-xs">{subtitle}</p>}
        </div>
        {badge}
      </CardHeader>
      <CardContent className="px-4 pt-4 pb-4">{children}</CardContent>
    </Card>
  );
}

// ── Internal ──

function AccuracyBadge({ accuracy }: { accuracy: TimePLAccuracy }) {
  const colors = getAccuracyColors(accuracy.status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        colors.bg,
        colors.text,
      )}
    >
      {Math.round(accuracy.rate * 100)}% {STATUS_LABEL[accuracy.status]}
    </span>
  );
}

function ShellSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>
      <div className="space-y-2 pt-2">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between pl-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
      <div className="border-border space-y-2 border-t-2 pt-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

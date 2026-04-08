'use client';

import { FileSpreadsheet } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { formatMinutesDuration, formatVariance, getAccuracyColors } from '../timePL.utils';

import type { TimePLData } from '../timePL.types';

interface TimePLWaterfallProps {
  data: TimePLData | null;
  className?: string;
}

/**
 * ウォーターフォール図 — Budget → タグ別差異 → Actual を滝グラフで表示
 *
 * 各ステップが前の値から増減する「滝」を描く。
 * P/Lのブリッジ分析に相当。
 */
export function TimePLWaterfall({ data, className }: TimePLWaterfallProps) {
  if (!data) {
    return (
      <Card className={cn('gap-0 border-none py-0', className)}>
        <CardContent className="p-4">
          <EmptyState
            icon={FileSpreadsheet}
            title="まっさらな期間です"
            description="予定を追加すると、差異の流れが見えてきます"
            size="sm"
            centered
          />
        </CardContent>
      </Card>
    );
  }

  const colors = getAccuracyColors(data.accuracyStatus);

  // ウォーターフォールのステップを構築
  const steps: WaterfallStep[] = [];

  // 開始: Budget total
  steps.push({
    label: '予算',
    value: data.budget.totalMinutes,
    type: 'total',
    runningTotal: data.budget.totalMinutes,
    prevRunningTotal: 0,
  });

  // 差異ステップ（影響の大きい順）
  const sorted = [...data.varianceRows].sort(
    (a, b) => Math.abs(b.varianceMinutes) - Math.abs(a.varianceMinutes),
  );

  let running = data.budget.totalMinutes;
  for (const row of sorted) {
    const prev = running;
    // variance = budget - actual → positive means budget surplus
    // waterfall delta = -variance → positive means actual exceeded budget
    running -= row.varianceMinutes;
    steps.push({
      label: row.tagName,
      value: -row.varianceMinutes,
      type: row.varianceMinutes > 0 ? 'decrease' : row.varianceMinutes < 0 ? 'increase' : 'neutral',
      runningTotal: running,
      prevRunningTotal: prev,
    });
  }

  // 終了: Actual total
  steps.push({
    label: '実績',
    value: data.actual.totalMinutes,
    type: 'total',
    runningTotal: data.actual.totalMinutes,
    prevRunningTotal: 0,
  });

  // スケール: 全 runningTotal + 全 prevRunningTotal の最大値
  const allValues = steps.flatMap((s) => [s.runningTotal, s.prevRunningTotal, Math.abs(s.value)]);
  const maxValue = Math.max(...allValues, 1);

  return (
    <Card className={cn('gap-0 border-none py-0', className)}>
      <CardHeader className="flex items-start justify-between p-4 pb-0">
        <div>
          <h3 className="text-foreground text-sm font-medium">ウォーターフォール</h3>
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
        {/* チャートエリア: 全カラムが同じ高さ */}
        <div className="flex gap-1" style={{ height: 192 }}>
          {steps.map((step, i) => (
            <WaterfallColumn key={`${step.label}-${i}`} step={step} maxValue={maxValue} />
          ))}
        </div>

        {/* ラベル行 */}
        <div className="mt-1 flex gap-1">
          {steps.map((step, i) => (
            <div key={`label-${step.label}-${i}`} className="min-w-0 flex-1 text-center">
              <p className="text-muted-foreground truncate text-xs">{step.label}</p>
            </div>
          ))}
        </div>

        {/* 凡例 */}
        <div className="mt-4 flex justify-center gap-4">
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <span className="bg-primary inline-block size-2 rounded-full" />
            合計
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <span className="bg-success inline-block size-2 rounded-full" />
            増加
          </span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <span className="bg-destructive inline-block size-2 rounded-full" />
            減少
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Internal ──

interface WaterfallStep {
  label: string;
  value: number;
  type: 'total' | 'increase' | 'decrease' | 'neutral';
  runningTotal: number;
  prevRunningTotal: number;
}

/**
 * ウォーターフォールの1カラム
 *
 * 全カラムが親の 100% 高さを持ち、内部で absolute 配置する。
 * Total: bottom=0 から barHeight 分。
 * Delta: bottom=min(running, prev) から |delta| 分。
 */
function WaterfallColumn({ step, maxValue }: { step: WaterfallStep; maxValue: number }) {
  const isTotal = step.type === 'total';

  if (isTotal) {
    const barPct = (step.value / maxValue) * 100;
    return (
      <div className="relative min-w-0 flex-1">
        {/* 値ラベル */}
        <div className="absolute right-0 left-0 text-center" style={{ bottom: `${barPct + 1}%` }}>
          <span className="text-foreground text-xs font-medium">
            {formatMinutesDuration(step.value)}
          </span>
        </div>
        {/* バー */}
        <div
          className="bg-primary absolute bottom-0 rounded-t-lg"
          style={{ left: '10%', right: '10%', height: `${Math.max(barPct, 2)}%` }}
        />
      </div>
    );
  }

  // Delta bar
  const bottomValue = Math.min(step.runningTotal, step.prevRunningTotal);
  const barHeight = Math.abs(step.value);
  const bottomPct = (bottomValue / maxValue) * 100;
  const barPct = (barHeight / maxValue) * 100;

  const colorClass =
    step.type === 'increase'
      ? 'bg-success'
      : step.type === 'decrease'
        ? 'bg-destructive'
        : 'bg-muted';

  const textColorClass = step.type === 'increase' ? 'text-success' : 'text-destructive';

  return (
    <div className="relative min-w-0 flex-1">
      {/* 値ラベル */}
      <div
        className="absolute right-0 left-0 text-center"
        style={{ bottom: `${Math.min(bottomPct + barPct + 1, 94)}%` }}
      >
        <span className={cn('text-xs font-medium', textColorClass)}>
          {formatVariance(step.value)}
        </span>
      </div>
      {/* バー */}
      <div
        className={cn('absolute rounded-lg', colorClass)}
        style={{
          left: '10%',
          right: '10%',
          bottom: `${bottomPct}%`,
          height: `${Math.max(barPct, 2)}%`,
        }}
      />
      {/* コネクターライン（前のバーのrunningTotalから接続） */}
      <div
        className="border-border absolute left-0 border-t border-dashed"
        style={{
          bottom: `${(step.prevRunningTotal / maxValue) * 100}%`,
          width: '10%',
        }}
      />
    </div>
  );
}

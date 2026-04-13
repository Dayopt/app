'use client';

import { cn } from '@/lib/utils';

import { formatMinutesDuration, formatVariance } from '../data/timePL.derivers';

import type { WaterfallStep } from '../data/timePL.types';

interface WaterfallViewProps {
  steps: WaterfallStep[];
}

const CHART_H = 192;

/** ウォーターフォール図 — Budget → タグ別差異 → Actual */
export function WaterfallView({ steps }: WaterfallViewProps) {
  const allValues = steps.flatMap((s) => [s.runningTotal, s.prevRunningTotal, Math.abs(s.value)]);
  const maxValue = Math.max(...allValues, 1);

  return (
    <div>
      <div className="flex gap-1" style={{ height: CHART_H }}>
        {steps.map((step, i) => (
          <WaterfallColumn key={`${step.label}-${i}`} step={step} maxValue={maxValue} />
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {steps.map((step, i) => (
          <div key={`l-${step.label}-${i}`} className="min-w-0 flex-1 text-center">
            <p className="text-muted-foreground truncate text-xs">{step.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-center gap-4">
        <Legend className="bg-primary" label="合計" />
        <Legend className="bg-success" label="増加" />
        <Legend className="bg-destructive" label="減少" />
      </div>
    </div>
  );
}

// ── Internal ──

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
      <span className={cn('inline-block size-2 rounded-full', className)} />
      {label}
    </span>
  );
}

function WaterfallColumn({ step, maxValue }: { step: WaterfallStep; maxValue: number }) {
  const isTotal = step.type === 'total';

  if (isTotal) {
    const barPct = (step.value / maxValue) * 100;
    return (
      <div className="relative min-w-0 flex-1">
        <div className="absolute right-0 left-0 text-center" style={{ bottom: `${barPct + 1}%` }}>
          <span className="text-foreground text-xs font-medium">
            {formatMinutesDuration(step.value)}
          </span>
        </div>
        <div
          className="bg-primary absolute bottom-0 rounded-t-lg"
          style={{ left: '10%', right: '10%', height: `${Math.max(barPct, 2)}%` }}
        />
      </div>
    );
  }

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
      <div
        className="absolute right-0 left-0 text-center"
        style={{ bottom: `${Math.min(bottomPct + barPct + 1, 94)}%` }}
      >
        <span className={cn('text-xs font-medium', textColorClass)}>
          {formatVariance(step.value)}
        </span>
      </div>
      <div
        className={cn('absolute rounded-lg', colorClass)}
        style={{
          left: '10%',
          right: '10%',
          bottom: `${bottomPct}%`,
          height: `${Math.max(barPct, 2)}%`,
        }}
      />
      <div
        className="border-border absolute left-0 border-t border-dashed"
        style={{ bottom: `${(step.prevRunningTotal / maxValue) * 100}%`, width: '10%' }}
      />
    </div>
  );
}

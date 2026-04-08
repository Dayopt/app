'use client';

import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { TagIcon } from '@/features/tags';
import { cn } from '@/lib/utils';

import {
  formatMinutesDuration,
  formatVariance,
  getAccuracyColors,
  getVarianceColor,
} from '../data/timePL.derivers';

import type {
  StatementViewData,
  TimePLAccuracy,
  TimePLRow,
  TimePLVarianceRow,
} from '../data/timePL.types';

interface StatementViewProps {
  data: StatementViewData;
  accuracy: TimePLAccuracy;
}

/** テーブル型 P/L（財務諸表風） */
export function StatementView({ data, accuracy }: StatementViewProps) {
  return (
    <table className="w-full">
      <Section label="予算 (Budget)" rows={data.budgetRows} total={data.budgetTotal} />
      <Section label="実績 (Actual)" rows={data.actualRows} total={data.actualTotal} />
      <VarianceSection rows={data.varianceRows} net={data.netVarianceMinutes} />
      <SummarySection accuracy={accuracy} />
    </table>
  );
}

// ── Internal ──

function Section({ label, rows, total }: { label: string; rows: TimePLRow[]; total: number }) {
  return (
    <tbody>
      <tr>
        <td colSpan={3} className="text-foreground pt-4 pb-1 text-sm font-medium">
          {label}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.tagId} className="text-sm">
          <td className="py-1 pr-2 pl-4">
            <span className="inline-flex items-center gap-1.5">
              <TagIcon icon={row.tagIcon ?? null} color={row.tagColor} size="sm" />
              <ColonTagLabel name={row.tagName} className="text-foreground" />
            </span>
          </td>
          <td className="text-foreground py-1 pr-4 text-right font-mono text-sm tabular-nums">
            {formatMinutesDuration(row.minutes)}
          </td>
          <td className="text-muted-foreground py-1 pr-4 text-right font-mono text-sm tabular-nums">
            {row.percentage}%
          </td>
        </tr>
      ))}
      <tr className="border-border border-t">
        <td className="text-foreground py-1 text-sm font-medium">小計</td>
        <td className="text-foreground py-1 pr-4 text-right font-mono text-sm font-medium tabular-nums">
          {formatMinutesDuration(total)}
        </td>
        <td className="text-muted-foreground py-1 pr-4 text-right font-mono text-sm tabular-nums">
          100%
        </td>
      </tr>
    </tbody>
  );
}

function VarianceSection({ rows, net }: { rows: TimePLVarianceRow[]; net: number }) {
  return (
    <tbody>
      <tr>
        <td colSpan={3} className="pt-4">
          <div className="border-border border-t-2" />
        </td>
      </tr>
      <tr>
        <td colSpan={3} className="text-foreground pt-2 pb-1 text-sm font-medium">
          差異 (Variance)
        </td>
      </tr>
      {rows.map((row) => {
        const color = getVarianceColor(row.variancePercent);
        return (
          <tr key={row.tagId} className="text-sm">
            <td className="py-1 pr-2 pl-4">
              <span className="inline-flex items-center gap-1.5">
                <TagIcon icon={row.tagIcon ?? null} color={row.tagColor} size="sm" />
                <ColonTagLabel name={row.tagName} className="text-foreground" />
              </span>
            </td>
            <td className={cn('py-1 pr-4 text-right font-mono text-sm tabular-nums', color)}>
              {formatVariance(row.varianceMinutes)}
            </td>
            <td className={cn('py-1 pr-4 text-right font-mono text-sm tabular-nums', color)}>
              {row.variancePercent !== null
                ? `${row.variancePercent > 0 ? '+' : ''}${row.variancePercent}%`
                : 'new'}
            </td>
          </tr>
        );
      })}
      <tr className="border-border border-t">
        <td className="text-foreground py-1 text-sm font-medium">純差異</td>
        <td
          className={cn(
            'py-1 pr-4 text-right font-mono text-sm font-medium tabular-nums',
            getVarianceColor(net === 0 ? 0 : 10),
          )}
        >
          {formatVariance(net)}
        </td>
        <td />
      </tr>
    </tbody>
  );
}

function SummarySection({ accuracy }: { accuracy: TimePLAccuracy }) {
  const colors = getAccuracyColors(accuracy.status);
  const statusLabel: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    fair: 'Fair',
    poor: 'Poor',
  };

  return (
    <tbody>
      <tr>
        <td colSpan={3} className="pt-4">
          <div className="border-border border-t-2" />
        </td>
      </tr>
      <tr>
        <td className="text-foreground py-2 text-sm font-medium">予算精度</td>
        <td className="py-2 pr-4 text-right">
          <span className="text-foreground font-mono text-sm font-medium tabular-nums">
            {Math.round(accuracy.rate * 100)}%
          </span>
        </td>
        <td className="py-2 pr-4 text-right">
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
              colors.bg,
              colors.text,
            )}
          >
            {statusLabel[accuracy.status]}
          </span>
        </td>
      </tr>
    </tbody>
  );
}

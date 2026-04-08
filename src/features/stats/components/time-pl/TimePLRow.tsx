'use client';

import { ColonTagLabel } from '@/components/ui/colon-tag-label';
import { TagIcon } from '@/features/tags';
import { cn } from '@/lib/utils';

import { formatMinutesDuration, formatVariance, getVarianceColor } from './timePL.utils';

import type { TimePLRowData, TimePLVarianceRow } from './timePL.types';

interface TimePLRowProps {
  row: TimePLRowData;
  className?: string;
}

/** P/Lセクション内の1行（Budget / Actual） */
export function TimePLRow({ row, className }: TimePLRowProps) {
  return (
    <tr className={cn('text-sm', className)}>
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
  );
}

interface TimePLVarianceRowProps {
  row: TimePLVarianceRow;
  className?: string;
}

/** 差異セクションの1行 */
export function TimePLVarianceRowComponent({ row, className }: TimePLVarianceRowProps) {
  const colorClass = getVarianceColor(row.variancePercent);

  return (
    <tr className={cn('text-sm', className)}>
      <td className="py-1 pr-2 pl-4">
        <span className="inline-flex items-center gap-1.5">
          <TagIcon icon={row.tagIcon ?? null} color={row.tagColor} size="sm" />
          <ColonTagLabel name={row.tagName} className="text-foreground" />
        </span>
      </td>
      <td className={cn('py-1 pr-4 text-right font-mono text-sm tabular-nums', colorClass)}>
        {formatVariance(row.varianceMinutes)}
      </td>
      <td className={cn('py-1 pr-4 text-right font-mono text-sm tabular-nums', colorClass)}>
        {row.variancePercent !== null
          ? `${row.variancePercent > 0 ? '+' : ''}${row.variancePercent}%`
          : 'new'}
      </td>
    </tr>
  );
}

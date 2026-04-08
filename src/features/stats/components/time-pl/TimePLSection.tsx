'use client';

import { cn } from '@/lib/utils';

import { TimePLRow, TimePLVarianceRowComponent } from './TimePLRow';
import { formatMinutesDuration, formatVariance, getVarianceColor } from './timePL.utils';

import type { TimePLSectionData, TimePLVarianceRow } from './timePL.types';

interface TimePLSectionProps {
  section: TimePLSectionData;
  className?: string;
}

/** P/Lのセクション（Budget / Actual） */
export function TimePLSection({ section, className }: TimePLSectionProps) {
  return (
    <tbody className={className}>
      {/* セクションヘッダー */}
      <tr>
        <td colSpan={3} className="text-foreground pt-4 pb-1 text-sm font-medium">
          {section.label}
        </td>
      </tr>

      {/* タグ行 */}
      {section.rows.map((row) => (
        <TimePLRow key={row.tagId} row={row} />
      ))}

      {/* 小計行 */}
      <tr className="border-border border-t">
        <td className="text-foreground py-1 text-sm font-medium">小計</td>
        <td className="text-foreground py-1 pr-4 text-right font-mono text-sm font-medium tabular-nums">
          {formatMinutesDuration(section.totalMinutes)}
        </td>
        <td className="text-muted-foreground py-1 pr-4 text-right font-mono text-sm tabular-nums">
          100%
        </td>
      </tr>
    </tbody>
  );
}

interface TimePLVarianceSectionProps {
  varianceRows: TimePLVarianceRow[];
  netVarianceMinutes: number;
  className?: string;
}

/** 差異セクション */
export function TimePLVarianceSection({
  varianceRows,
  netVarianceMinutes,
  className,
}: TimePLVarianceSectionProps) {
  return (
    <tbody className={className}>
      {/* セクションヘッダー（二重線で区切り） */}
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

      {/* 差異行 */}
      {varianceRows.map((row) => (
        <TimePLVarianceRowComponent key={row.tagId} row={row} />
      ))}

      {/* 純差異行 */}
      <tr className="border-border border-t">
        <td className="text-foreground py-1 text-sm font-medium">純差異</td>
        <td
          className={cn(
            'py-1 pr-4 text-right font-mono text-sm font-medium tabular-nums',
            getVarianceColor(
              netVarianceMinutes === 0
                ? 0
                : (netVarianceMinutes / Math.abs(netVarianceMinutes)) * 10,
            ),
          )}
        >
          {formatVariance(netVarianceMinutes)}
        </td>
        <td />
      </tr>
    </tbody>
  );
}

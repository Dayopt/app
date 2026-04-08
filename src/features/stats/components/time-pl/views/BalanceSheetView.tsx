'use client';

import { cn } from '@/lib/utils';

import { formatMinutesDuration } from '../data/timePL.derivers';

import type { BalanceSheetData, BalanceSheetSide } from '../data/timePL.types';

interface BalanceSheetViewProps {
  data: BalanceSheetData;
}

const BOX_HEIGHT = 320;

const SECTION_STYLES: Record<string, { bg: string; text: string }> = {
  記録済み時間: { bg: 'bg-primary/15', text: 'text-primary' },
  空白時間: { bg: 'bg-muted', text: 'text-muted-foreground' },
  '予定時間（負債）': { bg: 'bg-destructive/10', text: 'text-destructive' },
  '自由時間（資本）': { bg: 'bg-success/10', text: 'text-success' },
};

/** 貸借対照表（面積図） — 可処分時間を左右に分解 */
export function BalanceSheetView({ data }: BalanceSheetViewProps) {
  return (
    <div>
      {/* 2列ラベル */}
      <div className="mb-1 grid grid-cols-2 gap-1">
        <p className="text-muted-foreground text-center text-xs font-medium">{data.assets.label}</p>
        <p className="text-muted-foreground text-center text-xs font-medium">
          {data.liabilitiesAndEquity.label}
        </p>
      </div>

      {/* 面積図 */}
      <div className="grid grid-cols-2 gap-1" style={{ height: BOX_HEIGHT }}>
        <SideColumn side={data.assets} total={data.availableMinutes} variant="asset" />
        <SideColumn
          side={data.liabilitiesAndEquity}
          total={data.availableMinutes}
          variant="liability"
        />
      </div>

      {/* 合計一致バー */}
      <div className="mt-2 grid grid-cols-2 gap-1">
        <div className="text-center">
          <span className="text-foreground font-mono text-sm font-medium tabular-nums">
            {formatMinutesDuration(data.assets.totalMinutes)}
          </span>
        </div>
        <div className="text-center">
          <span className="text-foreground font-mono text-sm font-medium tabular-nums">
            {formatMinutesDuration(data.liabilitiesAndEquity.totalMinutes)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Internal ──

function SideColumn({
  side,
  total,
  variant,
}: {
  side: BalanceSheetSide;
  total: number;
  variant: 'asset' | 'liability';
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg">
      {side.sections.map((section) => {
        if (total === 0) return null;
        const pct = (section.totalMinutes / total) * 100;
        if (pct < 1) return null;

        const style =
          SECTION_STYLES[section.label] ??
          (variant === 'asset'
            ? { bg: 'bg-primary/15', text: 'text-primary' }
            : { bg: 'bg-success/10', text: 'text-success' });

        const isSmall = pct < 15;

        return (
          <div
            key={section.label}
            className={cn(
              'relative flex flex-col items-center justify-center overflow-hidden border-b last:border-b-0',
              'border-background',
              style.bg,
            )}
            style={{ flex: `${section.totalMinutes} 0 0%` }}
          >
            <span className={cn('text-xs font-medium', style.text)}>{section.label}</span>
            <span
              className={cn(
                'font-mono tabular-nums',
                style.text,
                isSmall ? 'text-xs' : 'text-sm font-medium',
              )}
            >
              {formatMinutesDuration(section.totalMinutes)}
            </span>
            {!isSmall && (
              <span className={cn('text-xs opacity-60', style.text)}>{Math.round(pct)}%</span>
            )}
            {!isSmall && section.rows.length > 0 && pct > 30 && (
              <div className="mt-1 flex flex-wrap justify-center gap-x-2 gap-y-0 px-2">
                {section.rows.slice(0, 4).map((row) => (
                  <span key={row.tagId} className="text-foreground/60 text-xs">
                    {row.tagName} {formatMinutesDuration(row.minutes)}
                  </span>
                ))}
                {section.rows.length > 4 && (
                  <span className="text-foreground/40 text-xs">+{section.rows.length - 4}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

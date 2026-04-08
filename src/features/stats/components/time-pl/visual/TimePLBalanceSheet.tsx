'use client';

import { FileSpreadsheet } from 'lucide-react';

import { EmptyState } from '@/components/common/EmptyState';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { formatMinutesDuration } from '../timePL.utils';

import type { TimePLBalanceSheetData, TimePLBSSection } from './timePLBalanceSheet.types';

interface TimePLBalanceSheetProps {
  data: TimePLBalanceSheetData | null;
  className?: string;
}

const BOX_HEIGHT = 320;

/**
 * 時間貸借対照表（面積図）
 *
 * 会計B/Sと同じ箱レイアウト:
 * - 左列: 資産（記録済み + 空白）
 * - 右列: 負債（予定）+ 純資産（自由時間）
 * 面積比が時間比率に対応する。
 */
export function TimePLBalanceSheet({ data, className }: TimePLBalanceSheetProps) {
  if (!data) {
    return (
      <Card className={cn('gap-0 border-none py-0', className)}>
        <CardContent className="p-4">
          <EmptyState
            icon={FileSpreadsheet}
            title="まっさらな期間です"
            description="予定と記録が増えると、時間の構造が見えてきます"
            size="sm"
            centered
          />
        </CardContent>
      </Card>
    );
  }

  const total = data.availableMinutes;

  return (
    <Card className={cn('gap-0 border-none py-0', className)}>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-foreground text-sm font-medium">時間貸借対照表</h3>
            <p className="text-muted-foreground text-xs">{data.period.label}</p>
          </div>
          <span className="text-muted-foreground text-xs">
            可処分 {formatMinutesDuration(total)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pt-0 pb-4">
        {/* 2列ラベル */}
        <div className="mb-1 grid grid-cols-2 gap-1">
          <p className="text-muted-foreground text-center text-xs font-medium">
            {data.assets.label}
          </p>
          <p className="text-muted-foreground text-center text-xs font-medium">
            {data.liabilitiesAndEquity.label}
          </p>
        </div>

        {/* 面積図本体 */}
        <div className="grid grid-cols-2 gap-1" style={{ height: BOX_HEIGHT }}>
          {/* 左列: 資産 */}
          <div className="flex flex-col overflow-hidden rounded-lg">
            {data.assets.sections.map((section) => (
              <SectionBox key={section.label} section={section} total={total} variant="asset" />
            ))}
          </div>

          {/* 右列: 負債＋資本 */}
          <div className="flex flex-col overflow-hidden rounded-lg">
            {data.liabilitiesAndEquity.sections.map((section) => (
              <SectionBox key={section.label} section={section} total={total} variant="liability" />
            ))}
          </div>
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
      </CardContent>
    </Card>
  );
}

// ── Internal ──

type BoxVariant = 'asset' | 'liability';

const SECTION_STYLES: Record<string, { bg: string; text: string }> = {
  // 資産側
  記録済み時間: { bg: 'bg-primary/15', text: 'text-primary' },
  空白時間: { bg: 'bg-muted', text: 'text-muted-foreground' },
  // 負債＋資本側
  '予定時間（負債）': { bg: 'bg-destructive/10', text: 'text-destructive' },
  '自由時間（資本）': { bg: 'bg-success/10', text: 'text-success' },
};

function getBoxStyle(label: string, variant: BoxVariant): { bg: string; text: string } {
  const match = SECTION_STYLES[label];
  if (match) return match;
  // フォールバック
  return variant === 'asset'
    ? { bg: 'bg-primary/15', text: 'text-primary' }
    : { bg: 'bg-success/10', text: 'text-success' };
}

function SectionBox({
  section,
  total,
  variant,
}: {
  section: TimePLBSSection;
  total: number;
  variant: BoxVariant;
}) {
  if (total === 0) return null;

  const pct = (section.totalMinutes / total) * 100;
  if (pct < 1) return null;

  const style = getBoxStyle(section.label, variant);
  const isSmall = pct < 15;

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden border-b last:border-b-0',
        'border-background',
        style.bg,
      )}
      style={{ flex: `${section.totalMinutes} 0 0%` }}
    >
      {/* セクションラベル */}
      <span className={cn('text-xs font-medium', style.text, isSmall && 'text-xs')}>
        {section.label}
      </span>

      {/* 時間 */}
      <span
        className={cn(
          'font-mono tabular-nums',
          style.text,
          isSmall ? 'text-xs' : 'text-sm font-medium',
        )}
      >
        {formatMinutesDuration(section.totalMinutes)}
      </span>

      {/* 比率 */}
      {!isSmall && <span className={cn('text-xs opacity-60', style.text)}>{Math.round(pct)}%</span>}

      {/* タグ内訳（スペースがあれば） */}
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
}

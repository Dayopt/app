'use client';

import {
  deriveAccuracy,
  deriveBalanceSheet,
  deriveBarComparison,
  deriveBreakEven,
  deriveStatement,
  deriveWaterfall,
} from '@/features/review/domain/timePL/derivers';
import { formatMinutesDuration } from './data/timePL.presentation';
import { TimePLShell } from './shell/TimePLShell';
import { BalanceSheetView } from './views/BalanceSheetView';
import { BarComparisonView } from './views/BarComparisonView';
import { BreakEvenView } from './views/BreakEvenView';
import { StackedView } from './views/StackedView';
import { StatementView } from './views/StatementView';
import { WaterfallView } from './views/WaterfallView';

import type { TimePLInput, TimePLViewType } from '@/features/review/domain/timePL/types';

interface TimePLContainerProps {
  input: TimePLInput | null;
  view: TimePLViewType;
  isLoading?: boolean;
  className?: string;
}

const VIEW_TITLES: Record<TimePLViewType, string> = {
  statement: '時間損益計算書',
  waterfall: 'ウォーターフォール',
  barComparison: '予実比較',
  stacked: '構成比較',
  breakEven: '損益分岐点',
  balanceSheet: '時間貸借対照表',
};

/**
 * Time P/L Container — ビュー切替オーケストレーター
 *
 * 1つの TimePLInput から全ビューを導出し、Shell でラップして描画する。
 */
export function TimePLContainer({ input, view, isLoading, className }: TimePLContainerProps) {
  const isEmpty = !input || input.tags.length === 0;

  if (isLoading || isEmpty) {
    return (
      <TimePLShell
        title={VIEW_TITLES[view]}
        isLoading={isLoading}
        isEmpty={!isLoading && isEmpty}
        className={className}
      >
        {null}
      </TimePLShell>
    );
  }

  const accuracy = deriveAccuracy(input);

  // B/S は精度バッジではなく可処分時間を表示
  const isBS = view === 'balanceSheet';
  const trailing = isBS ? (
    <span className="text-muted-foreground text-xs">
      可処分 {formatMinutesDuration(input.availableMinutes)}
    </span>
  ) : undefined;

  return (
    <TimePLShell
      title={VIEW_TITLES[view]}
      subtitle={input.period.label}
      accuracy={isBS ? null : accuracy}
      trailing={trailing}
      className={className}
    >
      <ViewRenderer input={input} view={view} accuracy={accuracy} />
    </TimePLShell>
  );
}

// ── Internal ──

function ViewRenderer({
  input,
  view,
  accuracy,
}: {
  input: TimePLInput;
  view: TimePLViewType;
  accuracy: ReturnType<typeof deriveAccuracy>;
}) {
  switch (view) {
    case 'statement': {
      const data = deriveStatement(input);
      return <StatementView data={data} accuracy={accuracy} />;
    }
    case 'waterfall': {
      const steps = deriveWaterfall(input);
      return <WaterfallView steps={steps} />;
    }
    case 'barComparison': {
      const rows = deriveBarComparison(input);
      return <BarComparisonView rows={rows} />;
    }
    case 'stacked': {
      const data = deriveStatement(input);
      return (
        <StackedView
          budgetRows={data.budgetRows}
          budgetTotal={data.budgetTotal}
          actualRows={data.actualRows}
          actualTotal={data.actualTotal}
        />
      );
    }
    case 'breakEven': {
      const curve = deriveBreakEven(input);
      if (!curve) return <p className="text-muted-foreground text-sm">日次データがありません</p>;
      return <BreakEvenView curve={curve} />;
    }
    case 'balanceSheet': {
      const data = deriveBalanceSheet(input);
      return <BalanceSheetView data={data} />;
    }
  }
}

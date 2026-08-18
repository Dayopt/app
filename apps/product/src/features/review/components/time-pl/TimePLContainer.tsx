'use client';

import { deriveAccuracy, deriveBarComparison } from '@/features/review/domain/timePL/derivers';
import { TimePLShell } from './shell/TimePLShell';
import { BarComparisonView } from './views/BarComparisonView';

import type { TimePLInput } from '@/features/review/domain/timePL/types';

interface TimePLContainerProps {
  input: TimePLInput | null;
  isLoading?: boolean;
  className?: string;
}

const VIEW_TITLE = '予実比較';

/**
 * Time P/L Container — 予実比較ビューのオーケストレーター
 *
 * 1つの TimePLInput から予実比較データを導出し、Shell でラップして描画する。
 */
export function TimePLContainer({ input, isLoading, className }: TimePLContainerProps) {
  const isEmpty = !input || input.activities.length === 0;

  if (isLoading || isEmpty) {
    return (
      <TimePLShell
        title={VIEW_TITLE}
        isLoading={isLoading}
        isEmpty={!isLoading && isEmpty}
        className={className}
      >
        {null}
      </TimePLShell>
    );
  }

  const accuracy = deriveAccuracy(input);
  const rows = deriveBarComparison(input);

  return (
    <TimePLShell
      title={VIEW_TITLE}
      subtitle={input.period.label}
      accuracy={accuracy}
      className={className}
    >
      <BarComparisonView rows={rows} />
    </TimePLShell>
  );
}

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { BarComparisonRow } from '../../domain/timePL/types';
import { WeeklyReflectionPanel, type WeeklyReflectionEstimationRow } from './WeeklyReflectionPanel';

const timePLRows: BarComparisonRow[] = [
  {
    activityId: 'activity-1',
    activityName: 'Deep Work',
    categoryColor: 'blue',
    categoryIcon: null,
    budgetMinutes: 120,
    actualMinutes: 150,
    varianceMinutes: 30,
    variancePercent: 25,
    isNoActivity: false,
  },
];

const estimationRows: WeeklyReflectionEstimationRow[] = [
  {
    activityId: 'activity-1',
    activityName: 'Deep Work',
    activityColor: 'blue',
    isUncategorized: false,
    avgPlannedMinutes: 120,
    avgActualMinutes: 150,
    avgDeviationMinutes: 30,
    recordCount: 3,
  },
];

describe('WeeklyReflectionPanel', () => {
  it('週次 Reflection の主要セクションを表示する', () => {
    render(
      <WeeklyReflectionPanel
        trackedMinutes={180}
        planAccuracyRate={0.83}
        confirmedRate={0.6}
        plannedMinutes={120}
        diffMinutes={-60}
        timePLRows={timePLRows}
        estimationRows={estimationRows}
        skipSummary={{ skippedCount: 2, skippedMinutes: 45, topActivityName: 'Admin' }}
        blankSummary={{ availableMinutes: 600, scheduledMinutes: 360, blankRate: 0.4 }}
      />,
    );

    expect(screen.getByText('review.timePLTitle')).toBeInTheDocument();
    expect(screen.getByText('review.estimationBiasTitle')).toBeInTheDocument();
    expect(screen.getByText('review.skipTitle')).toBeInTheDocument();
    expect(screen.getByText('review.blankTitle')).toBeInTheDocument();
    expect(screen.getAllByText('Deep Work').length).toBeGreaterThan(0);
  });

  it('スキップ集約が未接続のときはスキップカードを出さない', () => {
    render(
      <WeeklyReflectionPanel
        trackedMinutes={180}
        planAccuracyRate={0.83}
        plannedMinutes={120}
        diffMinutes={-60}
        timePLRows={timePLRows}
        estimationRows={estimationRows}
        blankSummary={{ availableMinutes: 600, scheduledMinutes: 360, blankRate: 0.4 }}
      />,
    );

    expect(screen.queryByText('review.skipTitle')).not.toBeInTheDocument();
    expect(screen.getByText('review.blankTitle')).toBeInTheDocument();
  });

  it('Time P/L row click で activityId を渡す', async () => {
    const user = userEvent.setup();
    const onActivityClick = vi.fn();

    render(
      <WeeklyReflectionPanel
        trackedMinutes={180}
        planAccuracyRate={0.83}
        plannedMinutes={120}
        diffMinutes={-60}
        timePLRows={timePLRows}
        estimationRows={estimationRows}
        onActivityClick={onActivityClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Deep Work/ }));

    expect(onActivityClick).toHaveBeenCalledWith('activity-1');
  });

  it('未分類を neutral marker で表示し、実体タグの選択操作にはしない', () => {
    const onActivityClick = vi.fn();
    const uncategorizedRow: BarComparisonRow = {
      activityId: null,
      activityName: null,
      categoryColor: null,
      categoryIcon: null,
      budgetMinutes: 60,
      actualMinutes: 45,
      varianceMinutes: 15,
      variancePercent: 25,
      isNoActivity: true,
    };

    const { container } = render(
      <WeeklyReflectionPanel
        trackedMinutes={45}
        planAccuracyRate={0.75}
        plannedMinutes={60}
        diffMinutes={15}
        timePLRows={[uncategorizedRow]}
        onActivityClick={onActivityClick}
      />,
    );

    expect(screen.getByText('uncategorized')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="uncategorized-marker"]')).toHaveClass(
      'bg-muted',
      'text-muted-foreground',
    );
    expect(screen.queryByRole('button', { name: /uncategorized/ })).not.toBeInTheDocument();
    expect(onActivityClick).not.toHaveBeenCalled();
  });

  // #2386: avgDeviationMinutes は符号付き（実績 − 予定）を前提にした消費側
  // ロジックが既に入っていたが、集計側（estimation-accuracy.ts）が
  // Math.abs で符号を潰していたため insightEstimationUnder（早期完了）へ
  // 実運用でほぼ到達しなかった。ここでは消費側単体で、符号付き値を渡せば
  // 正しく分岐することを固定する（next-intl は setup-node.ts のモックにより
  // 補間せず key をそのまま返すため、insightEstimationOver/Under の
  // 文字列一致でどちらが選ばれたかを判別できる）。
  it('avgDeviationMinutesが負（早期完了）なら insightEstimationUnder を表示する', () => {
    const earlyFinishRow: WeeklyReflectionEstimationRow = {
      ...estimationRows[0]!,
      avgDeviationMinutes: -20,
    };

    render(
      <WeeklyReflectionPanel
        trackedMinutes={180}
        planAccuracyRate={0.83}
        plannedMinutes={120}
        diffMinutes={-60}
        timePLRows={timePLRows}
        estimationRows={[earlyFinishRow]}
      />,
    );

    expect(screen.getByText('review.insightEstimationUnder')).toBeInTheDocument();
    expect(screen.queryByText('review.insightEstimationOver')).not.toBeInTheDocument();
  });

  it('avgDeviationMinutesが正（超過）なら insightEstimationOver を表示する', () => {
    const overRunRow: WeeklyReflectionEstimationRow = {
      ...estimationRows[0]!,
      avgDeviationMinutes: 20,
    };

    render(
      <WeeklyReflectionPanel
        trackedMinutes={180}
        planAccuracyRate={0.83}
        plannedMinutes={120}
        diffMinutes={-60}
        timePLRows={timePLRows}
        estimationRows={[overRunRow]}
      />,
    );

    expect(screen.getByText('review.insightEstimationOver')).toBeInTheDocument();
    expect(screen.queryByText('review.insightEstimationUnder')).not.toBeInTheDocument();
  });

  it('見積もり精度の未分類を neutral marker と翻訳ラベルで表示する（#1576）', () => {
    const uncategorizedEstimationRow: WeeklyReflectionEstimationRow = {
      activityId: null,
      activityName: null,
      activityColor: null,
      isUncategorized: true,
      avgPlannedMinutes: 60,
      avgActualMinutes: 65,
      avgDeviationMinutes: 5,
      recordCount: 3,
    };

    const { container } = render(
      <WeeklyReflectionPanel
        trackedMinutes={180}
        planAccuracyRate={0.83}
        plannedMinutes={120}
        diffMinutes={-60}
        timePLRows={timePLRows}
        estimationRows={[uncategorizedEstimationRow]}
      />,
    );

    expect(screen.getByText('uncategorized')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="activity-icon-neutral"]')).toHaveClass(
      'bg-muted',
      'text-muted-foreground',
    );
  });
});

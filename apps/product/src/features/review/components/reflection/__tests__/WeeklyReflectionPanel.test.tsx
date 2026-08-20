import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { BarComparisonRow } from '../../../domain/timePL/types';
import {
  WeeklyReflectionPanel,
  type WeeklyReflectionEstimationRow,
} from '../WeeklyReflectionPanel';

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
        skipSummary={{ skippedCount: 2, skippedMinutes: 45, topTagName: 'Admin' }}
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
    const onTagClick = vi.fn();

    render(
      <WeeklyReflectionPanel
        trackedMinutes={180}
        planAccuracyRate={0.83}
        plannedMinutes={120}
        diffMinutes={-60}
        timePLRows={timePLRows}
        estimationRows={estimationRows}
        onTagClick={onTagClick}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Deep Work/ }));

    expect(onTagClick).toHaveBeenCalledWith('activity-1');
  });

  it('未分類を neutral marker で表示し、実体タグの選択操作にはしない', () => {
    const onTagClick = vi.fn();
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
        onTagClick={onTagClick}
      />,
    );

    expect(screen.getByText('uncategorized')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="uncategorized-tag-marker"]')).toHaveClass(
      'bg-muted',
      'text-muted-foreground',
    );
    expect(screen.queryByRole('button', { name: /uncategorized/ })).not.toBeInTheDocument();
    expect(onTagClick).not.toHaveBeenCalled();
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

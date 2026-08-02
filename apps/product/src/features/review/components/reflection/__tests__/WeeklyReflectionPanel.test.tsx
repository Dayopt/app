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
    tagId: 'tag-1',
    tagName: 'Deep Work',
    tagColor: 'blue',
    tagIcon: null,
    budgetMinutes: 120,
    actualMinutes: 150,
    varianceMinutes: 30,
    variancePercent: 25,
    isUncategorized: false,
  },
];

const estimationRows: WeeklyReflectionEstimationRow[] = [
  {
    tagId: 'tag-1',
    tagName: 'Deep Work',
    tagColor: 'blue',
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

  it('Time P/L row click で tagId を渡す', async () => {
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

    expect(onTagClick).toHaveBeenCalledWith('tag-1');
  });

  it('未分類を neutral marker で表示し、実体タグの選択操作にはしない', () => {
    const onTagClick = vi.fn();
    const uncategorizedRow: BarComparisonRow = {
      tagId: null,
      tagName: null,
      tagColor: null,
      tagIcon: null,
      budgetMinutes: 60,
      actualMinutes: 45,
      varianceMinutes: 15,
      variancePercent: 25,
      isUncategorized: true,
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
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReviewDiffResult } from './ReviewDiffPanel';
import { ReviewDiffPanel } from './ReviewDiffPanel';

vi.mock('@/features/activities', () => ({
  useActivitiesMap: () => ({
    getActivityById: () => ({
      id: 'activity-1',
      name: 'Work',
      categoryId: 'cat-1',
      categoryName: 'Work',
      color: 'blue',
      icon: null,
    }),
  }),
}));

let mockTimeFormat: '12h' | '24h' = '24h';

vi.mock('@/lib/hooks/useUserPreferences', () => ({
  useUserPreferences: <T,>(
    selector?: (preferences: { timezone: string; timeFormat: '12h' | '24h' }) => T,
  ) => {
    const preferences = { timezone: 'UTC', timeFormat: mockTimeFormat } as const;
    return selector ? selector(preferences) : preferences;
  },
}));

const start = new Date('2026-06-18T09:00:00.000Z');
const end = new Date('2026-06-18T10:00:00.000Z');
const actualStart = new Date('2026-06-18T09:30:00.000Z');
const actualEnd = new Date('2026-06-18T10:30:00.000Z');

function item(
  overrides: Partial<ReviewDiffResult['items'][number]> = {},
): ReviewDiffResult['items'][number] {
  return {
    id: 'shifted:entry-1',
    timeblockId: 'entry-1',
    kind: 'shifted',
    title: 'Focus',
    activityId: 'activity-1',
    color: 'var(--category-blue)',
    plannedStart: start,
    plannedEnd: end,
    actualStart,
    actualEnd,
    plannedMinutes: 60,
    actualMinutes: 60,
    diffMinutes: 0,
    startDiffMinutes: 30,
    endDiffMinutes: 30,
    sortTime: actualStart.getTime(),
    ...overrides,
  };
}

function diff(overrides: Partial<ReviewDiffResult> = {}): ReviewDiffResult {
  return {
    summary: {
      plannedMinutes: 60,
      actualMinutes: 90,
      diffMinutes: 30,
      unplannedMinutes: 0,
      missedMinutes: 0,
    },
    items: [item()],
    ...overrides,
  };
}

describe('ReviewDiffPanel', () => {
  beforeEach(() => {
    mockTimeFormat = '24h';
  });

  it('12時間表記では項目の開始時刻をAM/PMで表示する', () => {
    mockTimeFormat = '12h';

    render(<ReviewDiffPanel diff={diff()} />);

    expect(screen.getByText(/9:30 AM/i)).toBeInTheDocument();
  });

  it('diff がないとき empty state を表示する', () => {
    render(
      <ReviewDiffPanel
        diff={diff({
          summary: {
            plannedMinutes: 60,
            actualMinutes: 60,
            diffMinutes: 0,
            unplannedMinutes: 0,
            missedMinutes: 0,
          },
          items: [],
        })}
      />,
    );

    expect(screen.getByText('calendar.compare.rail.emptyTitle')).toBeInTheDocument();
  });

  it('summary と chronological list を表示する', () => {
    const { container } = render(<ReviewDiffPanel diff={diff()} />);

    expect(screen.getByText('calendar.compare.rail.summary.planned')).toBeInTheDocument();
    expect(screen.getByText('Focus')).toBeInTheDocument();
    expect(container.querySelector('[data-review-diff-badge]')).toHaveClass(
      'text-muted-foreground',
    );
  });

  it.each([30, -30])('summary の増減 %i 分を評価色にしない', (diffMinutes) => {
    render(
      <ReviewDiffPanel
        diff={diff({
          summary: {
            plannedMinutes: 60,
            actualMinutes: 60 + diffMinutes,
            diffMinutes,
            unplannedMinutes: 0,
            missedMinutes: 0,
          },
        })}
      />,
    );

    const summaryLabel = screen.getByText('calendar.compare.rail.summary.diff');
    const summaryValue = summaryLabel.parentElement?.querySelector('dd');
    expect(summaryValue).not.toHaveClass('text-success', 'text-destructive');
  });

  it('summary の差分は正負や0にかかわらず中立色で表示する', () => {
    const { rerender } = render(<ReviewDiffPanel diff={diff()} />);
    const positiveValue = screen.getByText('calendar.compare.rail.summary.diff').nextElementSibling;

    expect(positiveValue).toHaveClass('text-foreground');
    expect(positiveValue).not.toHaveClass('text-success', 'text-destructive');

    rerender(
      <ReviewDiffPanel
        diff={diff({
          summary: {
            plannedMinutes: 60,
            actualMinutes: 30,
            diffMinutes: -30,
            unplannedMinutes: 0,
            missedMinutes: 0,
          },
        })}
      />,
    );
    const negativeValue = screen.getByText('calendar.compare.rail.summary.diff').nextElementSibling;

    expect(negativeValue).toHaveClass('text-foreground');
    expect(negativeValue).not.toHaveClass('text-success', 'text-destructive');

    rerender(
      <ReviewDiffPanel
        diff={diff({
          summary: {
            plannedMinutes: 60,
            actualMinutes: 60,
            diffMinutes: 0,
            unplannedMinutes: 0,
            missedMinutes: 0,
          },
          items: [],
        })}
      />,
    );
    const zeroValue = screen.getByText('calendar.compare.rail.summary.diff').nextElementSibling;

    expect(zeroValue).toHaveClass('text-foreground');
    expect(zeroValue).not.toHaveClass('text-success', 'text-destructive');
  });

  it('正負の差分 badge を評価色にせず、符号と方向を維持する', () => {
    const { container } = render(
      <ReviewDiffPanel
        diff={diff({
          items: [
            item({
              id: 'recorded:over',
              timeblockId: 'over',
              kind: 'recorded',
              title: 'Over',
              diffMinutes: 30,
              startDiffMinutes: 0,
              endDiffMinutes: 30,
            }),
            item({
              id: 'recorded:under',
              timeblockId: 'under',
              kind: 'recorded',
              title: 'Under',
              diffMinutes: -30,
              startDiffMinutes: 0,
              endDiffMinutes: -30,
            }),
          ],
        })}
      />,
    );
    const badges = [...container.querySelectorAll('[data-review-diff-badge]')];

    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveClass('text-muted-foreground');
    expect(badges[0]).not.toHaveClass('text-success', 'text-destructive');
    expect(badges[0]).toHaveTextContent(/^\+/);
    expect(badges[0]?.querySelector('.lucide-arrow-up')).toBeInTheDocument();
    expect(badges[1]).toHaveClass('text-muted-foreground');
    expect(badges[1]).not.toHaveClass('text-success', 'text-destructive');
    expect(badges[1]).toHaveTextContent(/^-/);
    expect(badges[1]?.querySelector('.lucide-arrow-down')).toBeInTheDocument();
  });

  it('すべての差分が0の item は badge を表示しない', () => {
    const { container } = render(
      <ReviewDiffPanel
        diff={diff({
          items: [
            item({
              id: 'recorded:exact',
              timeblockId: 'exact',
              kind: 'recorded',
              diffMinutes: 0,
              startDiffMinutes: 0,
              endDiffMinutes: 0,
            }),
          ],
        })}
      />,
    );

    expect(container.querySelector('[data-review-diff-badge]')).not.toBeInTheDocument();
    expect(container.querySelector('.lucide-arrow-down')).not.toBeInTheDocument();
  });

  it('時間帯がずれた item は合計時間の差分が0でも badge を表示する', () => {
    const { container } = render(<ReviewDiffPanel diff={diff()} />);

    expect(container.querySelector('[data-review-diff-badge]')).toBeInTheDocument();
  });

  it('item click で timeblockId を渡す', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();

    render(<ReviewDiffPanel diff={diff()} onItemClick={onItemClick} />);

    await user.click(screen.getByRole('button', { name: /Focus/ }));

    expect(onItemClick).toHaveBeenCalledWith('entry-1');
  });
});

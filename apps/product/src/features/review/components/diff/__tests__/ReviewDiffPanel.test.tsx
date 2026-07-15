import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReviewDiffResult } from '../ReviewDiffPanel';
import { ReviewDiffPanel } from '../ReviewDiffPanel';

vi.mock('@/features/tags', () => ({
  useTagsMap: () => ({
    getTagById: () => ({ id: 'tag-1', name: 'Work', color: 'blue', icon: null }),
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

function diff(overrides: Partial<ReviewDiffResult> = {}): ReviewDiffResult {
  return {
    summary: {
      plannedMinutes: 60,
      actualMinutes: 90,
      diffMinutes: 30,
      unplannedMinutes: 0,
      missedMinutes: 0,
    },
    items: [
      {
        id: 'shifted:entry-1',
        timeblockId: 'entry-1',
        kind: 'shifted',
        title: 'Focus',
        tagId: 'tag-1',
        color: 'var(--tag-blue)',
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
      },
    ],
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

  it('item click で timeblockId を渡す', async () => {
    const user = userEvent.setup();
    const onItemClick = vi.fn();

    render(<ReviewDiffPanel diff={diff()} onItemClick={onItemClick} />);

    await user.click(screen.getByRole('button', { name: /Focus/ }));

    expect(onItemClick).toHaveBeenCalledWith('entry-1');
  });

  it('close button click で onClose を呼ぶ', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<ReviewDiffPanel diff={diff()} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'actions.close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

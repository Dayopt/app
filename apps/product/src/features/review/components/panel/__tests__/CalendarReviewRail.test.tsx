import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../CalendarReviewPanel', () => ({
  CalendarReviewPanel: () => <div data-testid="review-panel-mock" />,
}));

vi.mock('../../diff/ReviewDiffPanel', () => ({
  ReviewDiffPanel: () => <div data-testid="diff-panel-mock" />,
}));

import { CalendarReviewRail } from '../CalendarReviewRail';

const displayRange = {
  start: new Date('2026-08-18T00:00:00.000Z'),
  end: new Date('2026-08-18T23:59:59.999Z'),
  days: [new Date('2026-08-18T00:00:00.000Z')],
  showWeekends: true,
};

const diff = {
  summary: {
    plannedMinutes: 0,
    actualMinutes: 0,
    diffMinutes: 0,
    unplannedMinutes: 0,
    missedMinutes: 0,
  },
  items: [],
};

describe('CalendarReviewRail', () => {
  it('activeTab=review の時は統計パネルを描画する', () => {
    render(
      <CalendarReviewRail
        activeTab="review"
        onTabChange={vi.fn()}
        diffTabDisabled={false}
        currentDate={new Date('2026-08-18')}
        displayRange={displayRange}
        selectedTagId={null}
        onSelectedTagIdChange={vi.fn()}
        diff={diff}
        onDiffItemClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('review-panel-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('diff-panel-mock')).not.toBeInTheDocument();
  });

  it('activeTab=diff かつ diff データありの時は差分パネルを描画する', () => {
    render(
      <CalendarReviewRail
        activeTab="diff"
        onTabChange={vi.fn()}
        diffTabDisabled={false}
        currentDate={new Date('2026-08-18')}
        displayRange={displayRange}
        selectedTagId={null}
        onSelectedTagIdChange={vi.fn()}
        diff={diff}
        onDiffItemClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId('diff-panel-mock')).toBeInTheDocument();
  });

  it('activeTab=diff だが diff===null（週末のみ表示等でデータが計算されない縁ケース）の時は統計パネルへ無言でfallbackせず、この状態自体をtestで固定する', () => {
    render(
      <CalendarReviewRail
        activeTab="diff"
        onTabChange={vi.fn()}
        diffTabDisabled={false}
        currentDate={new Date('2026-08-18')}
        displayRange={displayRange}
        selectedTagId={null}
        onSelectedTagIdChange={vi.fn()}
        diff={null}
        onDiffItemClick={vi.fn()}
      />,
    );

    // diff===null の間は review パネルへフォールバックする（呼び出し側は diffTabDisabled で
    // このタブに遷移させない設計だが、コンポーネント自体の安全側フォールバックとして固定する）
    expect(screen.getByTestId('review-panel-mock')).toBeInTheDocument();
    expect(screen.queryByTestId('diff-panel-mock')).not.toBeInTheDocument();
  });

  it('diffTabDisabled=true の時、差分タブボタンが disabled になる', () => {
    render(
      <CalendarReviewRail
        activeTab="review"
        onTabChange={vi.fn()}
        diffTabDisabled={true}
        currentDate={new Date('2026-08-18')}
        displayRange={displayRange}
        selectedTagId={null}
        onSelectedTagIdChange={vi.fn()}
        diff={null}
        onDiffItemClick={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toBeDisabled();
  });

  it('タブボタンをクリックすると onTabChange が呼ばれる', async () => {
    const onTabChange = vi.fn();
    const user = userEvent.setup();
    render(
      <CalendarReviewRail
        activeTab="review"
        onTabChange={onTabChange}
        diffTabDisabled={false}
        currentDate={new Date('2026-08-18')}
        displayRange={displayRange}
        selectedTagId={null}
        onSelectedTagIdChange={vi.fn()}
        diff={diff}
        onDiffItemClick={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[1]!);

    expect(onTabChange).toHaveBeenCalledWith('diff');
  });
});

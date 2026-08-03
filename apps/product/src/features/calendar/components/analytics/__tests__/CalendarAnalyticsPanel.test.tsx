import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CalendarAnalyticsPanel } from '../CalendarAnalyticsPanel';

const tags = [
  {
    id: 'tag-work',
    name: 'Work',
    color: 'blue',
    icon: 'briefcase',
  },
  {
    id: 'tag-admin',
    name: 'Admin',
    color: 'amber',
    icon: null,
  },
];

vi.mock('@/features/tags', () => ({
  TagIcon: () => <span data-testid="tag-icon" />,
  useTags: () => ({ data: tags }),
}));

describe('CalendarAnalyticsPanel', () => {
  it('全体スコープを表示する', () => {
    render(
      <CalendarAnalyticsPanel
        selectedTagId={null}
        onSelectedTagIdChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox')).toHaveTextContent('calendar.analysis.panel.all');
  });

  it('scope selector でタグを選べる', async () => {
    const user = userEvent.setup();
    const onSelectedTagIdChange = vi.fn();

    render(
      <CalendarAnalyticsPanel
        selectedTagId={null}
        onSelectedTagIdChange={onSelectedTagIdChange}
        onClose={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: /Work/ }));

    expect(onSelectedTagIdChange).toHaveBeenCalledWith('tag-work');
  });

  it('close button click で onClose を呼ぶ', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <CalendarAnalyticsPanel
        selectedTagId={null}
        onSelectedTagIdChange={vi.fn()}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'common.actions.close' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

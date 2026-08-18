import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CalendarPanelToggle } from '../CalendarPanelToggle';

describe('CalendarPanelToggle', () => {
  it('activeTab に応じて aria-pressed を切り替える', () => {
    render(<CalendarPanelToggle activeTab="review" onSelect={vi.fn()} diffDisabled={false} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
  });

  it('セグメントをクリックすると onSelect が該当タブで呼ばれる', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<CalendarPanelToggle activeTab="review" onSelect={onSelect} diffDisabled={false} />);

    const buttons = screen.getAllByRole('button');
    await user.click(buttons[1]!);

    expect(onSelect).toHaveBeenCalledWith('diff');
  });

  it('diffDisabled=true の時、差分セグメントが disabled になる', () => {
    render(<CalendarPanelToggle activeTab="review" onSelect={vi.fn()} diffDisabled={true} />);

    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toBeDisabled();
  });
});

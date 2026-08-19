import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mutateAsyncMock = vi.hoisted(() => vi.fn().mockResolvedValue({ id: 'cat-1' }));

vi.mock('@/features/activities', () => ({
  useCreateCategory: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
  }),
}));

import { CategoryCreatePopover } from '../CategoryCreatePopover';

describe('CategoryCreatePopover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('submit button is disabled until a name is entered', async () => {
    render(<CategoryCreatePopover />);

    fireEvent.click(screen.getByRole('button', { name: 'calendar.filter.createCategory' }));

    const submitButtons = await screen.findAllByRole('button', {
      name: 'calendar.filter.createCategory',
    });
    const submitButton = submitButtons[submitButtons.length - 1]!;
    expect(submitButton).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '仕事' } });
    expect(submitButton).toBeEnabled();
  });

  it('calls useCreateCategory with the trimmed name and closes on success', async () => {
    render(<CategoryCreatePopover />);

    fireEvent.click(screen.getByRole('button', { name: 'calendar.filter.createCategory' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  仕事  ' } });

    const submitButtons = screen.getAllByRole('button', {
      name: 'calendar.filter.createCategory',
    });
    fireEvent.click(submitButtons[submitButtons.length - 1]!);

    await waitFor(() => {
      expect(mutateAsyncMock).toHaveBeenCalledWith({ name: '仕事' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });

  it('notifies the parent via onOpenChange when the popover opens/closes', async () => {
    const onOpenChange = vi.fn();
    render(<CategoryCreatePopover onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'calendar.filter.createCategory' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(true));
  });
});

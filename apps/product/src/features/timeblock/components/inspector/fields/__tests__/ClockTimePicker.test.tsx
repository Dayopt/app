import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ClockTimePicker } from '../ClockTimePicker';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('ClockTimePicker', () => {
  it('キャンセルではdraftを反映せずに閉じる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClose = vi.fn();

    render(<ClockTimePicker value="09:00" onChange={onChange} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'actions.cancel' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('保存では選択中の時刻を反映して閉じる', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClose = vi.fn();

    render(<ClockTimePicker value="09:15" onChange={onChange} onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: 'actions.save' }));

    expect(onChange).toHaveBeenCalledWith('09:15');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

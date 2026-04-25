import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateTagPopover, type CreateTagPopoverProps } from '../CreateTagPopover';

import type { Tag } from '../../types';

const TAG_A: Tag = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: 'user-1',
  name: '仕事',
  color: 'blue',
  icon: 'briefcase',
  parent_id: null,
  sort_order: 0,
  is_active: true,
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
};

const TAG_B: Tag = {
  id: '22222222-2222-2222-2222-222222222222',
  user_id: 'user-1',
  name: '勉強',
  color: 'green',
  icon: 'book-open',
  parent_id: null,
  sort_order: 1,
  is_active: true,
  created_at: '2026-04-01T00:00:00.000Z',
  updated_at: '2026-04-01T00:00:00.000Z',
};

// next-intl mock は `(key) => key` を返す
const LABELS = {
  name: 'name',
  create: 'actions.create',
  cancel: 'actions.cancel',
  duplicateName: 'duplicateName',
};

function renderPopover(
  overrides: {
    existingTags?: Tag[];
    onSubmit?: ReturnType<typeof vi.fn>;
    onOpenChange?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  render(
    <CreateTagPopover
      open
      onOpenChange={onOpenChange as unknown as (open: boolean) => void}
      existingTags={overrides.existingTags ?? [TAG_A, TAG_B]}
      onSubmit={onSubmit as unknown as CreateTagPopoverProps['onSubmit']}
    >
      <button type="button">trigger</button>
    </CreateTagPopover>,
  );
  return { onSubmit, onOpenChange };
}

describe('CreateTagPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('有効なタグ名で Enter 送信 → onSubmit が呼ばれる', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSubmit } = renderPopover();

    const input = screen.getByRole('textbox', { name: LABELS.name });
    await user.type(input, '新規タグ');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: '新規タグ',
        color: 'blue',
        icon: null,
        parentId: null,
      });
    });
  });

  it('空文字のとき「作成」ボタンが disabled', () => {
    renderPopover();
    const button = screen.getByRole('button', { name: LABELS.create });
    expect(button).toBeDisabled();
  });

  it('既存タグと重複する名前 → エラー表示 + disabled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSubmit } = renderPopover();

    const input = screen.getByRole('textbox', { name: LABELS.name });
    await user.type(input, '仕事');

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(screen.getByText(new RegExp(LABELS.duplicateName))).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: LABELS.create })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: LABELS.create }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('「キャンセル」ボタンで onOpenChange(false) が呼ばれる', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onOpenChange } = renderPopover();

    await user.click(screen.getByRole('button', { name: LABELS.cancel }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

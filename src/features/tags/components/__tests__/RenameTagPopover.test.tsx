import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RenameTagPopover, type RenameTagPopoverProps } from '../RenameTagPopover';

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

const LABELS = {
  name: 'name',
  save: 'actions.save',
  cancel: 'actions.cancel',
  duplicateName: 'duplicateName',
};

function renderPopover(
  overrides: {
    tag?: Tag;
    existingTags?: Tag[];
    onSubmit?: ReturnType<typeof vi.fn>;
    onOpenChange?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onSubmit = overrides.onSubmit ?? vi.fn().mockResolvedValue(undefined);
  const onOpenChange = overrides.onOpenChange ?? vi.fn();
  render(
    <RenameTagPopover
      open
      onOpenChange={onOpenChange as unknown as (open: boolean) => void}
      tag={overrides.tag ?? TAG_A}
      existingTags={overrides.existingTags ?? [TAG_A, TAG_B]}
      onSubmit={onSubmit as unknown as RenameTagPopoverProps['onSubmit']}
    >
      <button type="button">trigger</button>
    </RenameTagPopover>,
  );
  return { onSubmit, onOpenChange };
}

describe('RenameTagPopover', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  it('初期値は tag.name が入力欄に入る', () => {
    renderPopover();
    const input = screen.getByRole('textbox', { name: LABELS.name }) as HTMLInputElement;
    expect(input.value).toBe('仕事');
  });

  it('名前を変更して Enter → onSubmit(newName) が呼ばれる', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSubmit } = renderPopover();

    const input = screen.getByRole('textbox', { name: LABELS.name });
    await user.clear(input);
    await user.type(input, '仕事2');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('仕事2');
    });
  });

  it('変更がないとき「保存」ボタンが disabled', () => {
    renderPopover();
    expect(screen.getByRole('button', { name: LABELS.save })).toBeDisabled();
  });

  it('同一親内で他タグと重複 → エラー表示 + disabled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onSubmit } = renderPopover();

    const input = screen.getByRole('textbox', { name: LABELS.name });
    await user.clear(input);
    await user.type(input, '勉強'); // TAG_B と重複

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    await waitFor(() => {
      expect(screen.getByText(new RegExp(LABELS.duplicateName))).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: LABELS.save })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: LABELS.save }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('自分自身の名前と一致してもエラーにならない（ただし変更なしで disabled）', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPopover();

    const input = screen.getByRole('textbox', { name: LABELS.name });
    await user.clear(input);
    await user.type(input, '仕事'); // 自分自身

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.queryByText(new RegExp(LABELS.duplicateName))).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: LABELS.save })).toBeDisabled();
  });

  it('「キャンセル」で onOpenChange(false) が呼ばれる', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onOpenChange } = renderPopover();

    await user.click(screen.getByRole('button', { name: LABELS.cancel }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

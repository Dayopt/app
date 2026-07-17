import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TagRenameModal } from '../TagRenameModal';

import type { TagRenameTarget } from '@/lib/stores/useShellStore';
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

// useTags / useUpdateTag を mock — tRPC Provider 不要
const mockMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock('../../hooks/useTagsQuery', () => ({
  useTags: () => ({ data: [TAG_A, TAG_B] }),
}));
vi.mock('../../hooks/useTagCrudMutations', () => ({
  useUpdateTag: () => ({ mutateAsync: mockMutateAsync }),
}));

const LABELS = {
  name: 'name',
  save: 'actions.save',
  cancel: 'actions.cancel',
  duplicateName: 'duplicateName',
};

const TARGET: TagRenameTarget = { id: TAG_A.id, name: TAG_A.name, parent_id: null };

function renderModal(overrides: { onClose?: ReturnType<typeof vi.fn>; open?: boolean } = {}) {
  const onClose = overrides.onClose ?? vi.fn();
  render(
    <TagRenameModal
      open={overrides.open ?? true}
      onClose={onClose as unknown as () => void}
      tag={TARGET}
    />,
  );
  return { onClose };
}

describe('TagRenameModal', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockMutateAsync.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初期値として tag.name が Input に入る', () => {
    renderModal();
    const input = screen.getByRole('textbox', { name: LABELS.name }) as HTMLInputElement;
    expect(input.value).toBe('仕事');
  });

  it('名前を変更して Enter → updateTag が呼ばれ onClose される', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onClose } = renderModal();

    const input = screen.getByRole('textbox', { name: LABELS.name });
    await user.clear(input);
    await user.type(input, '仕事2');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({ id: TAG_A.id, name: '仕事2' });
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('変更なしで「保存」ボタンが disabled', () => {
    renderModal();
    expect(screen.getByRole('button', { name: LABELS.save })).toBeDisabled();
  });

  it('同一親内の他タグと重複 → エラー + disabled', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderModal();

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
  });

  it('「キャンセル」で onClose が呼ばれる', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { onClose } = renderModal();

    await user.click(screen.getByRole('button', { name: LABELS.cancel }));
    expect(onClose).toHaveBeenCalled();
  });
});

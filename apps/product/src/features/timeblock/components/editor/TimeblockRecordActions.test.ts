import { createElement } from 'react';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmDayButton, RecordPlanButton } from './TimeblockRecordActions';

const mocks = vi.hoisted(() => ({
  isRecordPending: false,
  recordPlan: vi.fn(),
}));

vi.mock('../../hooks/useTimeblockRecordMutations', () => ({
  useTimeblockRecordMutations: () => ({
    confirmDay: { isPending: false, mutate: vi.fn() },
    recordPlan: { isPending: mocks.isRecordPending, mutate: mocks.recordPlan },
  }),
}));

function createDeferred() {
  let resolve!: (value: string) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<string>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

describe('TimeblockRecordActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isRecordPending = false;
  });

  it('日次確定とワンタップ記録の UI を提供する', () => {
    expect(RecordPlanButton).toBeTypeOf('function');
    expect(ConfirmDayButton).toBeTypeOf('function');
  });

  it('最新編集の保存完了後にだけPlanを記録する', async () => {
    const user = userEvent.setup();
    const preparation = createDeferred();
    const beforeRecord = vi.fn(() => preparation.promise);
    const onRecorded = vi.fn();
    render(
      createElement(RecordPlanButton, {
        planId: '00000000-0000-4000-8000-000000000001',
        beforeRecord,
        onRecorded,
      }),
    );

    const button = screen.getByRole('button', { name: 'recordAsIs' });
    await user.click(button);

    expect(beforeRecord).toHaveBeenCalledOnce();
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(mocks.recordPlan).not.toHaveBeenCalled();

    preparation.resolve('2026-07-01T00:00:00.000001Z');

    await waitFor(() =>
      expect(mocks.recordPlan).toHaveBeenCalledWith(
        {
          id: '00000000-0000-4000-8000-000000000001',
          expectedUpdatedAt: '2026-07-01T00:00:00.000001Z',
        },
        expect.objectContaining({ onSettled: expect.any(Function) }),
      ),
    );

    const mutationOptions = mocks.recordPlan.mock.calls[0]?.[1] as
      { onSuccess?: (record: { id: string }) => void; onSettled?: () => void } | undefined;
    act(() => mutationOptions?.onSuccess?.({ id: 'record-1' }));
    expect(onRecorded).toHaveBeenCalledWith('record-1');

    act(() => mutationOptions?.onSettled?.());

    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-busy', 'false');
  });

  it('最新編集を保存できなければPlanを記録しない', async () => {
    const user = userEvent.setup();
    const beforeRecord = vi.fn().mockRejectedValue(new Error('save failed'));
    render(
      createElement(RecordPlanButton, {
        planId: '00000000-0000-4000-8000-000000000001',
        beforeRecord,
      }),
    );

    const button = screen.getByRole('button', { name: 'recordAsIs' });
    await user.click(button);

    await waitFor(() => expect(button).toBeEnabled());
    expect(mocks.recordPlan).not.toHaveBeenCalled();
  });

  it('Record作成中は二重実行を無効化する', () => {
    mocks.isRecordPending = true;
    render(
      createElement(RecordPlanButton, {
        planId: '00000000-0000-4000-8000-000000000001',
        beforeRecord: vi.fn().mockResolvedValue('2026-07-01T00:00:00.000001Z'),
      }),
    );

    const button = screen.getByRole('button', { name: 'recordAsIs' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});

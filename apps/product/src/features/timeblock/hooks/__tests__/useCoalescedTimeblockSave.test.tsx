import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type TimeblockSavePatch, useCoalescedTimeblockSave } from '../useCoalescedTimeblockSave';

function createDeferred() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useCoalescedTimeblockSave', () => {
  it('保存中の変更を最新の差分へまとめ、直列に保存する', async () => {
    const firstSave = createDeferred();
    const onSave = vi
      .fn<(patch: TimeblockSavePatch) => Promise<unknown>>()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useCoalescedTimeblockSave(onSave));

    act(() => result.current({ note: '調査メモ' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => {
      result.current({ tagId: 'tag-2' });
      result.current({ start_at: '2026-07-14T01:00:00.000Z', end_at: '2026-07-14T02:00:00.000Z' });
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    firstSave.resolve();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith({
      tagId: 'tag-2',
      start_at: '2026-07-14T01:00:00.000Z',
      end_at: '2026-07-14T02:00:00.000Z',
    });
  });

  it('保存が失敗しても次の変更を保存する', async () => {
    const firstSave = createDeferred();
    const onSave = vi
      .fn<(patch: TimeblockSavePatch) => Promise<unknown>>()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useCoalescedTimeblockSave(onSave));

    act(() => {
      result.current({ note: '最初' });
      result.current({ note: '次の入力' });
    });

    firstSave.reject();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith({ note: '次の入力' });
  });
});

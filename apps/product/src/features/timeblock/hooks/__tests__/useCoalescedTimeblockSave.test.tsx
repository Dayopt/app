import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type TimeblockSavePatch, useCoalescedTimeblockSave } from '../useCoalescedTimeblockSave';

function createDeferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
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

    act(() => result.current.enqueue({ note: '調査メモ' }));
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.enqueue({ tagId: 'tag-2' });
      result.current.enqueue({
        start_at: '2026-07-14T01:00:00.000Z',
        end_at: '2026-07-14T02:00:00.000Z',
      });
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
      result.current.enqueue({ note: '最初' });
      result.current.enqueue({ note: '次の入力' });
    });

    firstSave.reject();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith({ note: '次の入力' });
  });

  it('競合時は古いversionを前提にした待機中patchを破棄する', async () => {
    const firstSave = createDeferred();
    const conflict = Object.assign(new Error('conflict'), { kind: 'conflict' });
    const onSave = vi
      .fn<(patch: TimeblockSavePatch) => Promise<unknown>>()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCoalescedTimeblockSave(onSave, {
        shouldDiscardPending: (error) =>
          error instanceof Error && 'kind' in error && error.kind === 'conflict',
      }),
    );

    act(() => result.current.enqueue({ note: 'version 0 の保存' }));
    let pendingFlush!: Promise<void>;
    act(() => {
      pendingFlush = result.current.flush({ tagId: 'version 0 の待機patch' });
    });

    const rejection = expect(pendingFlush).rejects.toBe(conflict);
    firstSave.reject(conflict);
    await rejection;
    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => result.current.enqueue({ note: '最新versionでの次の編集' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith({ note: '最新versionでの次の編集' });
  });

  it('結果不明時は待機中patchを自動送信せずqueueを停止する', async () => {
    const firstSave = createDeferred();
    const uncertain = Object.assign(new Error('timeout'), { kind: 'uncertain' });
    const onSave = vi
      .fn<(patch: TimeblockSavePatch) => Promise<unknown>>()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useCoalescedTimeblockSave(onSave, {
        shouldPausePending: (error) =>
          error instanceof Error && 'kind' in error && error.kind === 'uncertain',
      }),
    );

    act(() => result.current.enqueue({ note: '送信中' }));
    let pendingFlush!: Promise<void>;
    act(() => {
      pendingFlush = result.current.flush({ tagId: '待機中' });
    });

    const rejection = expect(pendingFlush).rejects.toBe(uncertain);
    firstSave.reject(uncertain);
    await rejection;

    act(() => result.current.enqueue({ note: '画面に残す入力' }));
    await act(async () => Promise.resolve());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('進行中の保存後に最新snapshotを保存し、そのbatch完了までflushを待つ', async () => {
    const firstSave = createDeferred();
    const barrierSave = createDeferred();
    const onSave = vi
      .fn<(patch: TimeblockSavePatch) => Promise<unknown>>()
      .mockReturnValueOnce(firstSave.promise)
      .mockReturnValueOnce(barrierSave.promise);
    const { result } = renderHook(() => useCoalescedTimeblockSave(onSave));

    act(() => result.current.enqueue({ note: '保存中' }));

    let flushPromise!: Promise<void>;
    act(() => {
      result.current.enqueue({ note: '入力途中' });
      flushPromise = result.current.flush({ note: '最新メモ', tagId: 'tag-2' });
    });

    expect(onSave).toHaveBeenCalledTimes(1);

    firstSave.resolve();

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect(onSave).toHaveBeenLastCalledWith({ note: '最新メモ', tagId: 'tag-2' });

    let settled = false;
    void flushPromise.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    barrierSave.resolve();

    await expect(flushPromise).resolves.toBeUndefined();
  });

  it('先行batchが失敗しても、最新snapshotのbatchが成功すればflushを完了する', async () => {
    const firstSave = createDeferred();
    const onSave = vi
      .fn<(patch: TimeblockSavePatch) => Promise<unknown>>()
      .mockReturnValueOnce(firstSave.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useCoalescedTimeblockSave(onSave));

    act(() => result.current.enqueue({ tagId: '古いタグ' }));

    let flushPromise!: Promise<void>;
    act(() => {
      flushPromise = result.current.flush({ note: '最新メモ', tagId: 'tag-2' });
    });

    firstSave.reject(new Error('一時的な保存失敗'));

    await expect(flushPromise).resolves.toBeUndefined();
    expect(onSave).toHaveBeenLastCalledWith({ note: '最新メモ', tagId: 'tag-2' });
  });

  it('snapshotの保存失敗時はflushをrejectし、同じsnapshotを再試行できる', async () => {
    const failedSave = createDeferred();
    const onSave = vi
      .fn<(patch: TimeblockSavePatch) => Promise<unknown>>()
      .mockReturnValueOnce(failedSave.promise)
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useCoalescedTimeblockSave(onSave));

    let failedFlush!: Promise<void>;
    act(() => {
      failedFlush = result.current.flush({ note: '最新メモ', tagId: 'tag-2' });
    });
    const rejection = expect(failedFlush).rejects.toThrow('snapshot save failed');

    failedSave.reject(new Error('snapshot save failed'));

    await rejection;
    await expect(
      result.current.flush({ note: '最新メモ', tagId: 'tag-2' }),
    ).resolves.toBeUndefined();
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});

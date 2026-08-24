'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TimeblockSavePatch {
  note?: string | null;
  tagId?: string | null;
  activityId?: string | null;
  start_at?: string;
  end_at?: string;
  /** Record 専用。Plan には存在しないため plan kind では送らない。 */
  fulfillment?: 'low' | 'medium' | 'high' | null;
}

interface SaveWaiter {
  resolve: () => void;
  reject: (reason: unknown) => void;
}

interface CoalescedTimeblockSaveControls {
  enqueue: (patch: TimeblockSavePatch) => void;
  /** patch を含む保存 batch の完了を待ち、失敗時は reject する。 */
  flush: (patch: TimeblockSavePatch) => Promise<void>;
}

interface CoalescedTimeblockSaveOptions {
  /** true のエラーでは、古い版を前提にした待機中patchをすべて破棄する。 */
  shouldDiscardPending?: ((error: unknown) => boolean) | undefined;
  /** 結果不明のエラーでは入力を保持したままqueueを止め、自動再送しない。 */
  shouldPausePending?: ((error: unknown) => boolean) | undefined;
}

class CoalescedTimeblockSaveQueue {
  private pending: TimeblockSavePatch | null = null;
  private pendingWaiters: SaveWaiter[] = [];
  private isSaving = false;
  private isPaused = false;

  constructor(
    private save: (patch: TimeblockSavePatch) => Promise<unknown>,
    private shouldDiscardPending: (error: unknown) => boolean,
    private shouldPausePending: (error: unknown) => boolean,
  ) {}

  setSave(save: (patch: TimeblockSavePatch) => Promise<unknown>): void {
    this.save = save;
  }

  setShouldDiscardPending(shouldDiscardPending: (error: unknown) => boolean): void {
    this.shouldDiscardPending = shouldDiscardPending;
  }

  setShouldPausePending(shouldPausePending: (error: unknown) => boolean): void {
    this.shouldPausePending = shouldPausePending;
  }

  enqueue(patch: TimeblockSavePatch): void {
    this.mergePending(patch);
    this.runNext();
  }

  flush(patch: TimeblockSavePatch): Promise<void> {
    return new Promise((resolve, reject) => {
      this.mergePending(patch);
      this.pendingWaiters.push({ resolve, reject });
      this.runNext();
    });
  }

  private mergePending(patch: TimeblockSavePatch): void {
    this.pending = { ...this.pending, ...patch };
  }

  private runNext(): void {
    if (this.isPaused || this.isSaving || this.pending === null) return;

    const next = this.pending;
    const waiters = this.pendingWaiters;
    this.pending = null;
    this.pendingWaiters = [];
    this.isSaving = true;

    const continueQueue = () => {
      this.isSaving = false;
      this.runNext();
    };

    void this.save(next).then(
      () => {
        for (const waiter of waiters) waiter.resolve();
        continueQueue();
      },
      (error: unknown) => {
        for (const waiter of waiters) waiter.reject(error);
        if (this.shouldDiscardPending(error)) {
          const discardedWaiters = this.pendingWaiters;
          this.pending = null;
          this.pendingWaiters = [];
          for (const waiter of discardedWaiters) waiter.reject(error);
        } else if (this.shouldPausePending(error)) {
          this.isPaused = true;
          const pausedWaiters = this.pendingWaiters;
          this.pendingWaiters = [];
          for (const waiter of pausedWaiters) waiter.reject(error);
        }
        continueQueue();
      },
    );
  }
}

/**
 * Timeblock の連続変更を直列化し、保存待ちの差分は最新値へまとめる。
 * mutation 側がエラー表示を担うため、失敗後も次の保存を継続する。
 */
export function useCoalescedTimeblockSave(
  onSave: (patch: TimeblockSavePatch) => Promise<unknown>,
  options: CoalescedTimeblockSaveOptions = {},
): CoalescedTimeblockSaveControls {
  const [queue] = useState(
    () =>
      new CoalescedTimeblockSaveQueue(
        onSave,
        options.shouldDiscardPending ?? (() => false),
        options.shouldPausePending ?? (() => false),
      ),
  );

  useEffect(() => {
    queue.setSave(onSave);
  }, [onSave, queue]);

  useEffect(() => {
    queue.setShouldDiscardPending(options.shouldDiscardPending ?? (() => false));
  }, [options.shouldDiscardPending, queue]);

  useEffect(() => {
    queue.setShouldPausePending(options.shouldPausePending ?? (() => false));
  }, [options.shouldPausePending, queue]);

  const enqueue = useCallback((patch: TimeblockSavePatch) => queue.enqueue(patch), [queue]);
  const flush = useCallback((patch: TimeblockSavePatch) => queue.flush(patch), [queue]);

  return { enqueue, flush };
}

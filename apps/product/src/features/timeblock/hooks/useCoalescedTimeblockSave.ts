'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TimeblockSavePatch {
  note?: string | null;
  tagId?: string | null;
  start_at?: string;
  end_at?: string;
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

class CoalescedTimeblockSaveQueue {
  private pending: TimeblockSavePatch | null = null;
  private pendingWaiters: SaveWaiter[] = [];
  private isSaving = false;

  constructor(private save: (patch: TimeblockSavePatch) => Promise<unknown>) {}

  setSave(save: (patch: TimeblockSavePatch) => Promise<unknown>): void {
    this.save = save;
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
    if (this.isSaving || this.pending === null) return;

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
): CoalescedTimeblockSaveControls {
  const [queue] = useState(() => new CoalescedTimeblockSaveQueue(onSave));

  useEffect(() => {
    queue.setSave(onSave);
  }, [onSave, queue]);

  const enqueue = useCallback((patch: TimeblockSavePatch) => queue.enqueue(patch), [queue]);
  const flush = useCallback((patch: TimeblockSavePatch) => queue.flush(patch), [queue]);

  return { enqueue, flush };
}

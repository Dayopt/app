'use client';

import { useCallback, useEffect, useState } from 'react';

export interface TimeblockSavePatch {
  note?: string | null;
  tagId?: string | null;
  start_at?: string;
  end_at?: string;
}

class CoalescedTimeblockSaveQueue {
  private pending: TimeblockSavePatch | null = null;
  private isSaving = false;

  constructor(private save: (patch: TimeblockSavePatch) => Promise<unknown>) {}

  setSave(save: (patch: TimeblockSavePatch) => Promise<unknown>): void {
    this.save = save;
  }

  enqueue(patch: TimeblockSavePatch): void {
    this.pending = { ...this.pending, ...patch };
    this.runNext();
  }

  private runNext(): void {
    if (this.isSaving || this.pending === null) return;

    const next = this.pending;
    this.pending = null;
    this.isSaving = true;

    const continueQueue = () => {
      this.isSaving = false;
      this.runNext();
    };

    void this.save(next).then(continueQueue, continueQueue);
  }
}

/**
 * Timeblock の連続変更を直列化し、保存待ちの差分は最新値へまとめる。
 * mutation 側がエラー表示を担うため、失敗後も次の保存を継続する。
 */
export function useCoalescedTimeblockSave(
  onSave: (patch: TimeblockSavePatch) => Promise<unknown>,
): (patch: TimeblockSavePatch) => void {
  const [queue] = useState(() => new CoalescedTimeblockSaveQueue(onSave));

  useEffect(() => {
    queue.setSave(onSave);
  }, [onSave, queue]);

  return useCallback((patch: TimeblockSavePatch) => queue.enqueue(patch), [queue]);
}

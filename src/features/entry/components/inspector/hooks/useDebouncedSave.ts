'use client';

/**
 * 統一保存パイプライン
 *
 * 全 Inspector フィールドの保存を一元管理:
 * - save(): 500ms debounce（テキスト・時間フィールド）
 * - saveImmediate(): 即時（fulfillment, reminder, recurrence）
 * - saveTag(): 即時（別 API）
 * - flush(): 強制送信（unmount / entry 切替時）
 */

import { useCallback, useEffect, useRef } from 'react';

import { useEntryMutations } from '../../../hooks/useEntryMutations';
import { useEntryTags } from '../../../hooks/useEntryTags';
import { useUpdateEntityTagsInCache } from '../../../hooks/useUpdateEntityTagsInCache';

type SaveFields = Record<string, string | number | null | undefined>;

interface UseDebouncedSaveOptions {
  entryId: string | null;
}

export function useDebouncedSave({ entryId }: UseDebouncedSaveOptions) {
  const { updateEntry, deleteEntry } = useEntryMutations();
  const { setEntryTags } = useEntryTags();
  const updateTagsInCache = useUpdateEntityTagsInCache('entries');

  // 単一タイマー + pending フィールドのマージ
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SaveFields>({});
  // flush 用に最新の entryId を ref で保持（クリーンアップ時のstale closure対策）
  const entryIdRef = useRef(entryId);
  // eslint-disable-next-line react-hooks/refs -- flush() で最新の entryId を参照するための ref 同期
  entryIdRef.current = entryId;

  /**
   * デバウンス保存（500ms）
   *
   * 複数フィールドが短時間に変更された場合はマージして1回のmutationにまとめる。
   * title, description, start_time, end_time 等のテキスト・時間フィールド用。
   */
  const save = useCallback(
    (fields: SaveFields) => {
      if (!entryId) return;

      pendingRef.current = { ...pendingRef.current, ...fields };

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const data = pendingRef.current;
        pendingRef.current = {};
        timerRef.current = null;
        updateEntry.mutate({ id: entryId, data });
      }, 500);
    },
    [entryId, updateEntry],
  );

  /**
   * 即時保存（fulfillment, reminder, recurrence 等の選択式 UI 用）
   */
  const saveImmediate = useCallback(
    (fields: SaveFields) => {
      if (!entryId) return;
      updateEntry.mutate({ id: entryId, data: fields });
    },
    [entryId, updateEntry],
  );

  /**
   * タグ保存（別 API エンドポイント、即時）
   */
  const saveTag = useCallback(
    (tagId: string | null) => {
      if (!entryId) return;
      updateTagsInCache(entryId, tagId ? [tagId] : []);
      setEntryTags(entryId, tagId);
    },
    [entryId, updateTagsInCache, setEntryTags],
  );

  /**
   * 未送信の変更を即座にフラッシュ
   */
  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const data = pendingRef.current;
    const id = entryIdRef.current;
    if (id && Object.keys(data).length > 0) {
      pendingRef.current = {};
      updateEntry.mutate({ id, data });
    }
  }, [updateEntry]);

  // entryId 変更時 or unmount 時に flush
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const data = pendingRef.current;
      if (entryId && Object.keys(data).length > 0) {
        pendingRef.current = {};
        updateEntry.mutate({ id: entryId, data });
      }
    };
  }, [entryId, updateEntry]);

  return {
    save,
    saveImmediate,
    saveTag,
    flush,
    updateEntry,
    deleteEntry,
    updateTagsInCache,
  };
}

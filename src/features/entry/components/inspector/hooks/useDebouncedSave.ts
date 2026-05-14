'use client';

/**
 * 統一保存パイプライン
 *
 * 全 Inspector フィールドの保存を一元管理:
 * - save(): 500ms debounce（テキスト・時間フィールド）
 * - saveImmediate(): 即時（fulfillment, reminder）
 * - saveTag(): 即時（別 API）
 * - flush(): 強制送信（unmount / entry 切替時）
 * - flushAsync(): 変換など順序保証が必要な操作前に保存完了まで待つ
 */

import { useCallback, useEffect, useRef } from 'react';

import { logger } from '@/lib/logger';
import { api } from '@/lib/trpc';

import { useEntryMutations } from '../../../hooks/useEntryMutations';
import { useEntryTags } from '../../../hooks/useEntryTags';
import { useUpdateEntityTagsInCache } from '../../../hooks/useUpdateEntityTagsInCache';

type SaveFields = Record<string, string | number | boolean | null | undefined>;

interface UseDebouncedSaveOptions {
  entryId: string | null;
}

/** Inspectorフィールドの統一保存パイプラインフック（デバウンス・即時・タグ保存を提供）
 * @param options - entryId: 保存対象のエントリID
 * @returns save, saveImmediate, saveTag, flush, updateEntry, deleteEntry, updateTagsInCache
 */
export function useDebouncedSave({ entryId }: UseDebouncedSaveOptions) {
  const { updateEntry, convertPlannedToUnplanned, convertUnplannedToPlanned, deleteEntry } =
    useEntryMutations();
  const { setEntryTags } = useEntryTags();
  const updateTagsInCache = useUpdateEntityTagsInCache('entries');
  const utils = api.useUtils();

  // 単一タイマー + pending フィールドのマージ
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SaveFields>({});
  // flush 用に最新の entryId を ref で保持（クリーンアップ時のstale closure対策）
  const entryIdRef = useRef(entryId);
  const lastSavePromiseRef = useRef<Promise<unknown> | null>(null);
  // eslint-disable-next-line react-hooks/refs -- flush() で最新の entryId を参照するための ref 同期
  entryIdRef.current = entryId;

  /** キャッシュからエントリの updated_at を取得（楽観的ロック用） */
  const getExpectedUpdatedAt = useCallback(
    (id: string): string | undefined => {
      // include なし / include: { tags: true } の両キャッシュを確認
      const cached =
        utils.entries.getById.getData({ id, include: { tags: true } }) ??
        utils.entries.getById.getData({ id });
      return cached?.updated_at ?? undefined;
    },
    [utils],
  );

  const runSave = useCallback(
    (id: string, data: SaveFields) => {
      const promise = updateEntry.mutateAsync({
        id,
        data,
        expectedUpdatedAt: getExpectedUpdatedAt(id),
      });
      lastSavePromiseRef.current = promise;
      void promise
        .catch(() => undefined)
        .finally(() => {
          if (lastSavePromiseRef.current === promise) {
            lastSavePromiseRef.current = null;
          }
        });
      return promise;
    },
    [updateEntry, getExpectedUpdatedAt],
  );

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
        void runSave(entryId, data);
      }, 500);
    },
    [entryId, runSave],
  );

  /**
   * 即時保存（fulfillment, reminder 等の選択式 UI 用）
   */
  const saveImmediate = useCallback(
    (fields: SaveFields) => {
      if (!entryId) return;
      void runSave(entryId, fields);
    },
    [entryId, runSave],
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
   * 未送信の変更を破棄（タイマーキャンセル + pending クリア）
   */
  const cancelPending = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = {};
  }, []);

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
      void runSave(id, data);
    }
  }, [runSave]);

  /**
   * 未送信・送信中の保存を完了させる。
   *
   * planned/unplanned 変換の直前に呼び、古い expectedUpdatedAt を持つ
   * 通常 update と変換 mutation が競争しないようにする。
   */
  const flushAsync = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const data = pendingRef.current;
    const id = entryIdRef.current;
    if (id && Object.keys(data).length > 0) {
      pendingRef.current = {};
      await runSave(id, data);
      return;
    }

    if (lastSavePromiseRef.current) {
      await lastSavePromiseRef.current;
    }
  }, [runSave]);

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
        void runSave(entryId, data);
      }
    };
  }, [entryId, runSave]);

  // ブラウザ閉じ・タブ切替時のデータ保護
  // visibilitychange: タブ非表示時に通常の flush（tRPC mutation）
  // beforeunload: ブラウザ閉じ時に sendBeacon で最終手段の保存
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        flush();
      }
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const data = pendingRef.current;
      const id = entryIdRef.current;
      if (id && Object.keys(data).length > 0) {
        const payload = JSON.stringify({ id, data });
        navigator.sendBeacon('/api/beacon/entry-save', payload);
        pendingRef.current = {};
        logger.debug('[useDebouncedSave] sendBeacon fired for entry', id);
        e.preventDefault();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [flush]);

  return {
    save,
    saveImmediate,
    saveTag,
    cancelPending,
    flush,
    flushAsync,
    updateEntry,
    convertPlannedToUnplanned,
    convertUnplannedToPlanned,
    deleteEntry,
    updateTagsInCache,
  };
}

'use client';

/**
 * タグフィールドの状態管理
 *
 * 単一タグの選択・変更を管理し、変更時に即時保存する。
 * close 時保存は廃止 — 変更は as-you-go で即時反映。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type { EntryWithTags } from '../../../types/entry';

interface UseTagFieldOptions {
  entryId: string | null;
  entry: EntryWithTags | undefined;
  /** useDebouncedSave.saveTag */
  saveTag: (tagId: string | null) => void;
}

/** Inspectorのタグフィールド状態管理フック（単一タグの選択・即時保存）
 * @param options - entryId, entry, saveTag
 * @returns selectedTagId, handleTagChange
 */
export function useTagField({ entryId, entry, saveTag }: UseTagFieldOptions) {
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const selectedTagIdRef = useRef<string | null>(selectedTagId);

  // entryId が変わったらタグ選択をリセット（React推奨: レンダー中のstate調整）
  const [prevEntryId, setPrevEntryId] = useState(entryId);
  if (entryId !== prevEntryId) {
    setPrevEntryId(entryId);
    setSelectedTagId(null);
    // eslint-disable-next-line react-hooks/refs -- React推奨のrender中state調整に伴うref同期
    selectedTagIdRef.current = null;
  }

  // entry データからタグを同期（React推奨: レンダー中のstate調整）
  // id + updated_at + tagId の値比較で差分を検出（オブジェクト参照変更による無限ループ回避）
  const [prevEntryKey, setPrevEntryKey] = useState<string | null>(null);
  const entryKey = entry ? `${entry.id}:${entry.updated_at ?? ''}:${entry.tagId ?? ''}` : null;
  if (entryKey !== prevEntryKey) {
    setPrevEntryKey(entryKey);
    if (entry !== undefined) {
      const tagId = entry.tagId ?? null;
      setSelectedTagId(tagId);
      // eslint-disable-next-line react-hooks/refs -- React推奨のrender中state調整に伴うref同期
      selectedTagIdRef.current = tagId;
    }
  }

  // ref を同期
  useEffect(() => {
    selectedTagIdRef.current = selectedTagId;
  }, [selectedTagId]);

  // タグ変更ハンドラー（即時保存）
  const handleTagChange = useCallback(
    (newTagId: string | null) => {
      if (newTagId === selectedTagIdRef.current) return;

      setSelectedTagId(newTagId);
      selectedTagIdRef.current = newTagId;

      // 即時保存（useDebouncedSave.saveTag 経由）
      saveTag(newTagId);
    },
    [saveTag],
  );

  return {
    selectedTagId,
    handleTagChange,
  };
}

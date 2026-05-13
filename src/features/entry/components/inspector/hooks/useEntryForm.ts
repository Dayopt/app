'use client';

/**
 * Inspector フォームの唯一の公開 hook
 *
 * 内部で useDebouncedSave / useTimeFields / useTagField を合成。
 * EntryInspectorForm はこの hook の返り値だけで全フィールドを描画できる。
 */

import { useCallback } from 'react';

import { useEntry } from '../../../hooks/useEntry';
import { useEntryInspectorStore } from '../../../stores/useEntryInspectorStore';
import type { EntryWithTags } from '../../../types/entry';

import { useDebouncedSave } from './useDebouncedSave';
import { useTagField } from './useTagField';
import { useTimeFields } from './useTimeFields';

/** InspectorフォームのメインフックーDebouncedSave/TimeFields/TagFieldを統合）
 * @returns entryId, entry, fields, handlers, state, actions
 */
export function useEntryForm() {
  const entryId = useEntryInspectorStore((state) => state.entryId);

  // データ取得
  const { data: entryData } = useEntry(entryId!, {
    includeTags: true,
    enabled: !!entryId,
  });

  const entry: EntryWithTags | null = (entryData ?? null) as EntryWithTags | null;

  // --- 内部 hook 合成 ---

  // 1. 統一保存パイプライン
  const {
    save,
    saveImmediate,
    saveTag,
    cancelPending,
    updateEntry,
    convertPlannedToUnplanned,
    deleteEntry,
  } = useDebouncedSave({
    entryId,
  });

  // 2. タグフィールド
  const { selectedTagId, handleTagChange } = useTagField({
    entryId,
    entry: entryData as EntryWithTags | undefined,
    saveTag,
  });

  // 3. 時間フィールド
  const {
    timezone,
    timeConflictError,
    scheduleDate,
    startTime,
    endTime,
    actualStartTime,
    actualEndTime,
    handleScheduleDateChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleActualStartChange,
    handleActualEndChange,
    setStartTimeLocal,
    setEndTimeLocal,
    resetActualTimesLocal,
    suppressSaveRef,
  } = useTimeFields({
    entry,
    entryId,
    save,
    saveImmediate,
  });

  // --- autoSave（title/description 用） ---
  const autoSave = useCallback(
    (field: string, value: string | undefined) => {
      if (!entryId) return;
      save({ [field]: value });
    },
    [entryId, save],
  );

  // --- 削除（soft-delete → undo toast で即実行） ---
  const handleDelete = useCallback(() => {
    if (!entryId) return;
    deleteEntry.mutate({ id: entryId });
  }, [entryId, deleteEntry]);

  return {
    entryId,
    entry,

    fields: {
      selectedTagId,
      scheduleDate,
      startTime,
      endTime,
      actualStartTime,
      actualEndTime,
    },

    handlers: {
      handleTagChange,
      handleScheduleDateChange,
      handleStartTimeChange,
      handleEndTimeChange,
      handleActualStartChange,
      handleActualEndChange,
      setStartTimeLocal,
      setEndTimeLocal,
      resetActualTimesLocal,
      suppressSaveRef,
      autoSave,
    },

    state: {
      timeConflictError,
      timezone,
    },

    actions: {
      updateEntry,
      convertPlannedToUnplanned,
      handleDelete,
      save,
      saveImmediate,
      cancelPending,
    },
  };
}

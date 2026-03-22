'use client';

/**
 * Inspector フォームの唯一の公開 hook
 *
 * 内部で useDebouncedSave / useTimeFields / useTagField を合成。
 * EntryInspectorForm はこの hook の返り値だけで全フィールドを描画できる。
 */

import { useCallback } from 'react';

import { openDeleteConfirm } from '@/stores/useModalStore';
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
  const closeInspector = useEntryInspectorStore((state) => state.closeInspector);

  // データ取得
  const { data: entryData } = useEntry(entryId!, {
    includeTags: true,
    enabled: !!entryId,
  });

  const entry: EntryWithTags | null = (entryData ?? null) as EntryWithTags | null;

  // --- 内部 hook 合成 ---

  // 1. 統一保存パイプライン
  const { save, saveImmediate, saveTag, updateEntry, deleteEntry } = useDebouncedSave({
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
    timeConflictError,
    scheduleDate,
    startTime,
    endTime,
    reminderMinutes,
    actualStartTime,
    actualEndTime,
    handleScheduleDateChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleReminderChange,
    handleActualStartChange,
    handleActualEndChange,
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

  // --- 削除 ---
  const handleDelete = useCallback(() => {
    if (!entryId) return;

    openDeleteConfirm(entryId, entry?.title ?? null, async () => {
      await deleteEntry.mutateAsync({ id: entryId });
      closeInspector();
    });
  }, [entryId, entry?.title, deleteEntry, closeInspector]);

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
      reminderMinutes,
    },

    handlers: {
      handleTagChange,
      handleScheduleDateChange,
      handleStartTimeChange,
      handleEndTimeChange,
      handleActualStartChange,
      handleActualEndChange,
      handleReminderChange,
      autoSave,
    },

    state: {
      timeConflictError,
    },

    actions: {
      updateEntry,
      handleDelete,
    },
  };
}

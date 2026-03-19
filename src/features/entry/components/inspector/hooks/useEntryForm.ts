'use client';

/**
 * Inspector フォームの唯一の公開 hook
 *
 * 内部で useDebouncedSave / useTimeFields / useTagField / useRecurringGuard を合成。
 * EntryInspectorForm はこの hook の返り値だけで全フィールドを描画できる。
 */

import { useCallback, useEffect } from 'react';

import { logger } from '@/lib/logger';
import {
  closeModal,
  openDeleteConfirm,
  openRecurringEditConfirm,
  useModalStore,
  type RecurringEditScope,
} from '@/stores/useModalStore';
import { useEntry } from '../../../hooks/useEntry';
import { useRecurringScopeMutations } from '../../../hooks/useRecurringScopeMutations';
import { useEntryInspectorStore } from '../../../stores/useEntryInspectorStore';
import type { EntryWithTags } from '../../../types/entry';

import { useDebouncedSave } from './useDebouncedSave';
import { useRecurringGuard } from './useRecurringGuard';
import { useTagField } from './useTagField';
import { useTimeFields } from './useTimeFields';

// 繰り返しインスタンスでスコープダイアログを表示するフィールド
const SCOPE_DIALOG_FIELDS = ['start_time', 'end_time'] as const;

export function useEntryForm() {
  const entryId = useEntryInspectorStore((state) => state.entryId);
  const instanceDate = useEntryInspectorStore((state) => state.instanceDate);
  const closeInspector = useEntryInspectorStore((state) => state.closeInspector);

  const { applyDelete } = useRecurringScopeMutations();

  // Inspector マウント時・entryId 変更時にグローバルダイアログをリセット
  useEffect(() => {
    const modal = useModalStore.getState().modal;
    if (modal?.type === 'recurringEdit') closeModal();
    const timer = setTimeout(() => {
      const m = useModalStore.getState().modal;
      if (m?.type === 'recurringEdit') closeModal();
    }, 50);
    return () => clearTimeout(timer);
  }, [entryId]);

  // データ取得
  const { data: entryData } = useEntry(entryId!, {
    includeTags: true,
    enabled: !!entryId,
  });

  const entry: EntryWithTags | null = (entryData ?? null) as EntryWithTags | null;

  // --- 内部 hook 合成 ---

  // 1. 繰り返しガード
  const recurringGuard = useRecurringGuard({
    entry,
    entryId,
    instanceDate,
  });

  // 2. 統一保存パイプライン
  const { save, saveImmediate, saveTag, updateEntry, deleteEntry } = useDebouncedSave({
    entryId,
  });

  // 3. タグフィールド
  const { selectedTagId, handleTagChange } = useTagField({
    entryId,
    entry: entryData as EntryWithTags | undefined,
    saveTag,
  });

  // 4. 時間フィールド
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
    recurringGuard,
  });

  // --- autoSave（title/description 用） ---
  // 繰り返しインスタンスの時間フィールドはスコープダイアログにルーティング
  const autoSave = useCallback(
    (field: string, value: string | undefined) => {
      if (!entryId) return;

      if (
        recurringGuard.isRecurringInstance &&
        SCOPE_DIALOG_FIELDS.includes(field as (typeof SCOPE_DIALOG_FIELDS)[number])
      ) {
        recurringGuard.openScopeDialog(
          field as 'title' | 'description' | 'start_time' | 'end_time',
          value,
        );
        return;
      }

      save({ [field]: value });
    },
    [entryId, recurringGuard, save],
  );

  // --- 削除 ---
  const handleRecurringDeleteConfirm = useCallback(
    async (scope: RecurringEditScope) => {
      if (!entryId || !instanceDate) return;

      try {
        await applyDelete({ scope, entryId, instanceDate });
        closeInspector();
      } catch (err) {
        logger.error('Failed to delete recurring entry:', err);
      }
    },
    [entryId, instanceDate, applyDelete, closeInspector],
  );

  const handleDelete = useCallback(() => {
    if (!entryId) return;

    if (recurringGuard.isRecurringInstance) {
      openRecurringEditConfirm(entry?.title ?? '', 'delete', handleRecurringDeleteConfirm);
      return;
    }

    openDeleteConfirm(entryId, entry?.title ?? null, async () => {
      await deleteEntry.mutateAsync({ id: entryId });
      closeInspector();
    });
  }, [
    entryId,
    entry?.title,
    recurringGuard.isRecurringInstance,
    handleRecurringDeleteConfirm,
    deleteEntry,
    closeInspector,
  ]);

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

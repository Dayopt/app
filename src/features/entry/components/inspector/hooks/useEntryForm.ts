'use client';

/**
 * Inspector フォームの唯一の公開 hook
 *
 * 内部で useDebouncedSave / useTimeFields / useTagField / useRecurringGuard を合成。
 * EntryInspectorContent はこの hook の返り値だけで全フィールドを描画できる。
 *
 * Phase 2: useEntryInspectorContentLogic の内部実装をこの hook に移行。
 * 返り値は既存と互換性を保つ（Phase 3 でコンポーネント側を変更してから型を整理）。
 */

import { useCallback, useEffect } from 'react';

import { logger } from '@/lib/logger';
import {
  closeModal,
  openDeleteConfirm,
  openRecurringEditConfirm,
  useModalStore,
  type RecurringEditScope,
} from '@/shell/stores/useModalStore';
import { useEntry } from '../../../hooks/useEntry';
import { useRecurringScopeMutations } from '../../../hooks/useRecurringScopeMutations';
import { useEntryCacheStore } from '../../../stores/useEntryCacheStore';
import { useEntryInspectorStore } from '../../../stores/useEntryInspectorStore';
import type { EntryWithTags } from '../../../types/entry';
import { useInspectorNavigation } from './useInspectorNavigation';

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

  const getCache = useEntryCacheStore((state) => state.getCache);
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
  const { data: planData } = useEntry(entryId!, {
    includeTags: true,
    enabled: !!entryId,
  });

  const entry: EntryWithTags | null = (planData ?? null) as EntryWithTags | null;

  // --- 内部 hook 合成 ---

  // 1. 繰り返しガード
  const recurringGuard = useRecurringGuard({
    entry,
    entryId,
    instanceDate,
  });

  // 2. 統一保存パイプライン
  const { save, saveImmediate, saveTag, flush, updateEntry, deleteEntry } = useDebouncedSave({
    entryId,
  });

  // 3. ナビゲーション
  const { hasPrevious, hasNext, goToPrevious, goToNext } = useInspectorNavigation(entryId);

  // 4. タグフィールド
  const { selectedTagId, handleTagChange } = useTagField({
    entryId,
    entry: planData as EntryWithTags | undefined,
    saveTag,
  });

  // 5. 時間フィールド
  const {
    timeConflictError,
    titleRef,
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
        await applyDelete({ scope, planId: entryId, instanceDate });
        closeInspector();
      } catch (err) {
        logger.error('Failed to delete recurring plan:', err);
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

  // --- 閉じる ---
  const saveAndClose = useCallback(() => {
    if (timeConflictError) return;
    flush();
    closeInspector();
  }, [timeConflictError, flush, closeInspector]);

  const cancelAndClose = useCallback(() => {
    // デバウンス中の未送信変更は破棄（flush しない）
    closeInspector();
  }, [closeInspector]);

  return {
    // Store state
    planId: entryId,
    plan: entry,
    closeInspector,
    saveAndClose,
    cancelAndClose,
    hasPendingChanges: false, // 全フィールドが as-you-go 保存のため常に false

    // Navigation
    hasPrevious,
    hasNext,
    goToPrevious,
    goToNext,

    // Tags state
    selectedTagId,
    handleTagChange,

    // Form state
    titleRef,
    scheduleDate,
    startTime,
    endTime,
    reminderMinutes,
    actualStartTime,
    actualEndTime,
    handleReminderChange,
    timeConflictError,

    // Form handlers
    handleScheduleDateChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleActualStartChange,
    handleActualEndChange,
    autoSave,
    updatePlan: updateEntry,

    // Menu handlers
    handleDelete,
    // Cache
    getCache,
  };
}

'use client';

/**
 * 繰り返しエントリ編集ガード
 *
 * 繰り返しインスタンスの編集時にスコープ選択ダイアログを表示し、
 * 選択されたスコープに応じて適切な更新処理を行う。
 *
 * useRecurringEntryEdit のリネーム + 整理版。
 */

import { useCallback, useMemo, useRef, useState } from 'react';

import { logger } from '@/lib/logger';
import { openRecurringEditConfirm, type RecurringEditScope } from '@/stores/useModalStore';
import { useRecurringScopeMutations } from '../../../hooks/useRecurringScopeMutations';
import { isRecurringEntry } from '../../../lib/entry-recurrence';

import type { EntryWithTags } from '../../../types/entry';

type OverrideableField = 'title' | 'description' | 'start_time' | 'end_time';

interface PendingChanges {
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
}

interface UseRecurringGuardOptions {
  entry: EntryWithTags | null;
  entryId: string | null;
  instanceDate: string | null;
}

export function useRecurringGuard({ entry, entryId, instanceDate }: UseRecurringGuardOptions) {
  const { applyEdit } = useRecurringScopeMutations();

  const isRecurringInstance = useMemo(() => {
    if (!entry || !instanceDate) return false;
    return isRecurringEntry(entry);
  }, [entry, instanceDate]);

  const [pendingChanges, setPendingChanges] = useState<PendingChanges>({});
  const pendingChangesRef = useRef<PendingChanges>({});
  const pendingFieldRef = useRef<{ field: OverrideableField; value: string | undefined } | null>(
    null,
  );

  // entryId 変更時にリセット（React推奨: レンダー中のstate調整）
  const [prevEntryId, setPrevEntryId] = useState(entryId);
  if (entryId !== prevEntryId) {
    setPrevEntryId(entryId);
    setPendingChanges({});
    // eslint-disable-next-line react-hooks/refs -- React推奨のrender中state調整に伴うref同期
    pendingChangesRef.current = {};
    // eslint-disable-next-line react-hooks/refs
    pendingFieldRef.current = null;
  }

  const hasPendingChanges = useMemo(() => {
    return Object.keys(pendingChanges).length > 0;
  }, [pendingChanges]);

  const accumulateChange = useCallback((field: OverrideableField, value: string | undefined) => {
    setPendingChanges((prev) => {
      const next = { ...prev };
      if (value === undefined) {
        delete next[field];
      } else {
        next[field] = value;
      }
      pendingChangesRef.current = next;
      return next;
    });
  }, []);

  const handleScopeConfirm = useCallback(
    async (scope: RecurringEditScope) => {
      if (!entryId || !instanceDate) return;

      const singleChange = pendingFieldRef.current;
      const changesToApply: PendingChanges = singleChange
        ? ({ [singleChange.field]: singleChange.value } as PendingChanges)
        : pendingChangesRef.current;

      if (Object.keys(changesToApply).length === 0) {
        pendingFieldRef.current = null;
        return;
      }

      try {
        await applyEdit({
          scope,
          entryId,
          instanceDate,
          changes: changesToApply,
        });

        setPendingChanges({});
        pendingChangesRef.current = {};
        pendingFieldRef.current = null;
      } catch (error) {
        logger.error('Failed to apply recurring edit:', error);
      }
    },
    [entryId, instanceDate, applyEdit],
  );

  const openScopeDialog = useCallback(
    (field?: OverrideableField, value?: string | undefined) => {
      if (field !== undefined) {
        pendingFieldRef.current = { field, value };
      }
      openRecurringEditConfirm(entry?.title ?? '', 'edit', handleScopeConfirm);
    },
    [entry?.title, handleScopeConfirm],
  );

  const clearPendingChanges = useCallback(() => {
    setPendingChanges({});
    pendingChangesRef.current = {};
  }, []);

  return {
    isRecurringInstance,
    hasPendingChanges,
    pendingChanges,
    accumulateChange,
    openScopeDialog,
    clearPendingChanges,
  };
}

'use client';

/**
 * TimeblockInspector のフォーム（Level 2）
 *
 * plan / record の 1 行を受け取り、TagRow ヘッダー + TimeblockEditor を描画する。
 * タグと確定済み日時は即時保存、note はデバウンスして自動保存する。
 * auto_migrated の record は RLS で不変のため読み取り専用として扱う。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { getTagColorClasses, resolveTagColor, useCreateTag, useTagsMap } from '@/features/tags';
import type { PublicRecordRow, Row } from '@/lib/database';
import { useDebouncedCallback } from '@/lib/hooks/useDebounce';
import { toast } from '@/lib/toast';
import { Button } from '@dayopt/components';

import { isPlanTimeEditable, type TimeblockDestination } from '../../domain/timeblock-destination';
import {
  useCoalescedTimeblockSave,
  type TimeblockSavePatch,
} from '../../hooks/useCoalescedTimeblockSave';
import {
  isTimeblockConflictError,
  isTimeblockNotFoundError,
  removeMissingTimeblockFromCache,
  useTimeblockWriteMutations,
  type TimeblockOverlapUpdateInput,
} from '../../hooks/useTimeblockWriteMutations';
import type { ClipboardTimeblock } from '../../lib/timeblock-clipboard';
import { createClipboardTimeblock } from '../../lib/timeblock-clipboard';
import {
  buildTimeblockDuplicateCreateInput,
  createTimeblockDuplicateDraft,
  getTimeblockDuplicateValidationReason,
  type TimeblockDuplicateDraft,
  type TimeblockDuplicateValidationReason,
} from '../../lib/timeblock-duplicate';
import {
  collectTimeblockLaneItems,
  hasTimeblockLaneConflict,
} from '../../lib/timeblock-lane-conflict';
import { getTimeblockMenuItems } from '../../lib/timeblock-menu-items';
import { TagRow } from '../inspector/fields';
import {
  isValidTimeModelRange,
  TimeblockEditor,
  type TimeModelEditorValue,
} from './TimeblockEditor';
import { RecordPlanButton } from './TimeblockRecordActions';
import {
  TimeblockRelationshipSection,
  type TimeblockRelationshipItem,
} from './TimeblockRelationshipSection';

type PlanRow = Row<'plans'>;
type RecordRow = PublicRecordRow;

export type TimeblockRelationships =
  | {
      kind: 'plan';
      status: 'loading' | 'error' | 'success';
      records: readonly RecordRow[];
      onRetry: () => void;
    }
  | {
      kind: 'record';
      status: 'loading' | 'error' | 'success' | 'unavailable';
      plan: PlanRow | null;
      onRetry: () => void;
    };

type TimeblockInspectorAvailability = 'available' | 'unavailable';

interface TimeModelInspectorFormProps {
  kind: TimeblockDestination;
  plan?: PlanRow | undefined;
  record?: RecordRow | undefined;
  /** active queryで対象が削除済みと確定した場合はunavailableへ遷移する。 */
  availability?: TimeblockInspectorAvailability | undefined;
  /** Plan / Record の関係取得状態と表示対象。 */
  relationships?: TimeblockRelationships | undefined;
  /** 関係行または記録直後の対象を同じ Inspector で開く。 */
  onOpenRelationship?: ((id: string, kind: TimeblockDestination) => void) | undefined;
  onViewStats?: ((tagId: string) => void) | undefined;
  onCopy?: ((timeblock: ClipboardTimeblock) => void) | undefined;
  /** 現在の入力内容から独立複製の下書きを開く。 */
  onStartDuplicate?: ((draft: TimeblockDuplicateDraft) => void) | undefined;
  /** 複製用の未保存下書き。指定時は既存行を自動保存しない。 */
  duplicateDraft?: TimeblockDuplicateDraft | undefined;
  /** 複製を取り消して元ブロックの詳細へ戻る。 */
  onCancelDuplicate?: (() => void) | undefined;
  /** 複製作成後に新しいブロックをInspectorで開く。 */
  onDuplicateCreated?: ((id: string, kind: TimeblockDestination) => void) | undefined;
  /** Inspector を閉じるコールバック（Mobile Drawer のみ渡す） */
  onCloseInspector?: (() => void) | undefined;
  /** 削除成功後に Inspector を閉じる */
  onDeleted: () => void;
}

const NOTE_SAVE_DELAY_MS = 600;

function normalizeNote(note: string): string | null {
  return note.trim() === '' ? null : note;
}

function getDuplicateValidationMessageKey(
  reason: TimeblockDuplicateValidationReason,
):
  | 'timeblock.editor.duplicate.validation.invalidRange'
  | 'timeblock.editor.duplicate.validation.planRequiresFuture'
  | 'timeblock.editor.duplicate.validation.recordRequiresPast' {
  switch (reason) {
    case 'invalidRange':
      return 'timeblock.editor.duplicate.validation.invalidRange';
    case 'planRequiresFuture':
      return 'timeblock.editor.duplicate.validation.planRequiresFuture';
    case 'recordRequiresPast':
      return 'timeblock.editor.duplicate.validation.recordRequiresPast';
  }
}

function getTimeOverlapMessageKey(
  kind: TimeblockDestination,
): 'timeblock.errors.planTimeOverlap' | 'timeblock.errors.recordTimeOverlap' {
  return kind === 'plan'
    ? 'timeblock.errors.planTimeOverlap'
    : 'timeblock.errors.recordTimeOverlap';
}

/** plan / record 共通の Inspector フォーム。タグ・日時・メモをフィールド別に自動保存する。 */
export function TimeblockInspectorForm({
  kind,
  plan,
  record,
  availability = 'available',
  relationships,
  onOpenRelationship,
  onViewStats,
  onCopy,
  onStartDuplicate,
  duplicateDraft,
  onCancelDuplicate,
  onDuplicateCreated,
  onCloseInspector,
  onDeleted,
}: TimeModelInspectorFormProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { getTagById } = useTagsMap();
  const createTagMutation = useCreateTag({ showToast: false });
  const isDuplicateMode = duplicateDraft != null;
  const [hasTimeConflict, setHasTimeConflict] = useState(false);
  const hasUnsavedTimeDraftRef = useRef(false);
  const latestTimeValueRef = useRef({ startAt: '', endAt: '' });
  const handleCreateTimeOverlap = useCallback(() => setHasTimeConflict(true), []);
  const handleUpdateTimeOverlap = useCallback((input: TimeblockOverlapUpdateInput) => {
    const { start_at: startAt, end_at: endAt } = input.data;
    if (
      startAt === latestTimeValueRef.current.startAt &&
      endAt === latestTimeValueRef.current.endAt
    ) {
      hasUnsavedTimeDraftRef.current = true;
      setHasTimeConflict(true);
    }
  }, []);
  const {
    createRecord,
    createPlan,
    deleteRecord,
    deletePlan,
    restoreRecord,
    restorePlan,
    skipPlan,
    unskipPlan,
    updateRecord,
    updatePlan,
  } = useTimeblockWriteMutations(
    isDuplicateMode
      ? { onCreateTimeOverlap: handleCreateTimeOverlap }
      : { onUpdateTimeOverlap: handleUpdateTimeOverlap },
  );

  const target: PlanRow | RecordRow | undefined = kind === 'plan' ? plan : record;
  const targetId = isDuplicateMode ? null : (target?.id ?? null);
  const targetUpdatedAt = target?.updated_at ?? null;
  const startsUnavailable = availability === 'unavailable';
  const latestUpdatedAtRef = useRef(startsUnavailable ? null : targetUpdatedAt);
  const observedServerUpdatedAtRef = useRef(targetUpdatedAt);

  const [value, setValue] = useState<TimeModelEditorValue>(() => ({
    note: duplicateDraft?.note ?? target?.note ?? '',
    tagId: duplicateDraft?.tagId ?? target?.tag_id ?? null,
    startAt: duplicateDraft
      ? new Date(duplicateDraft.startAt)
      : target
        ? new Date(target.start_at)
        : new Date(),
    endAt: duplicateDraft
      ? new Date(duplicateDraft.endAt)
      : target
        ? new Date(target.end_at)
        : new Date(),
    ...(isDuplicateMode ? {} : { source: kind }),
  }));
  const [duplicateValidationNow] = useState(() => new Date());
  const [isPreparingAction, setIsPreparingAction] = useState(false);
  const [hasUnresolvedConflict, setHasUnresolvedConflict] = useState(false);
  const [isUnavailable, setIsUnavailable] = useState(startsUnavailable);
  const actionPreparingRef = useRef(false);
  const pendingNoteRef = useRef(value.note);
  const noteDirtyRef = useRef(false);
  const noteGenerationRef = useRef(0);
  const saveInFlightRef = useRef(false);
  const transitionEpochRef = useRef(0);
  const lifecycleStateRef = useRef<'available' | 'conflicted' | 'unavailable'>(
    startsUnavailable ? 'unavailable' : 'available',
  );

  useEffect(() => {
    latestTimeValueRef.current = {
      startAt: value.startAt.toISOString(),
      endAt: value.endAt.toISOString(),
    };
  }, [value.startAt, value.endAt]);

  // auto_migrated record は RLS で update / delete とも拒否されるため UI 側も読み取り専用にする
  const isMigrated = !isDuplicateMode && kind === 'record' && record?.source === 'auto_migrated';
  const isPast = kind === 'record' || (target != null && new Date(target.end_at) <= new Date());
  const isSkipped = kind === 'plan' && plan?.skipped_at != null;
  const planRelationships = relationships?.kind === 'plan' ? relationships : undefined;
  const isRecordStateResolved = kind !== 'plan' || planRelationships?.status === 'success';
  const hasRelatedRecords =
    planRelationships?.status === 'success' && planRelationships.records.length > 0;

  const markConflicted = useCallback(() => {
    if (lifecycleStateRef.current === 'unavailable') return;
    transitionEpochRef.current += 1;
    lifecycleStateRef.current = 'conflicted';
    latestUpdatedAtRef.current = null;
    noteGenerationRef.current += 1;
    setHasUnresolvedConflict(true);
  }, []);

  const markUnavailable = useCallback(() => {
    if (lifecycleStateRef.current === 'unavailable') return;
    transitionEpochRef.current += 1;
    lifecycleStateRef.current = 'unavailable';
    latestUpdatedAtRef.current = null;
    noteGenerationRef.current += 1;
    setHasUnresolvedConflict(false);
    setIsUnavailable(true);
  }, []);

  const savePatch = useCallback(
    async (patch: TimeblockSavePatch) => {
      if (!targetId || isMigrated || lifecycleStateRef.current !== 'available') return;
      const saveEpoch = transitionEpochRef.current;
      const expectedUpdatedAt = latestUpdatedAtRef.current;
      if (!expectedUpdatedAt) throw new Error('Missing timeblock version');
      const input = {
        id: targetId,
        data: patch,
        expectedUpdatedAt,
      };
      saveInFlightRef.current = true;
      try {
        const updated =
          kind === 'plan'
            ? await updatePlan.mutateAsync(input)
            : await updateRecord.mutateAsync(input);
        if (saveEpoch !== transitionEpochRef.current || lifecycleStateRef.current !== 'available') {
          return;
        }
        latestUpdatedAtRef.current = updated.updated_at;
      } catch (error) {
        if (isTimeblockNotFoundError(error)) {
          markUnavailable();
          throw error;
        }
        if (isTimeblockConflictError(error)) {
          if (
            saveEpoch === transitionEpochRef.current &&
            lifecycleStateRef.current === 'available'
          ) {
            markConflicted();
          }
        }
        throw error;
      } finally {
        saveInFlightRef.current = false;
      }
    },
    [kind, targetId, isMigrated, updatePlan, updateRecord, markConflicted, markUnavailable],
  );
  const {
    discardPending,
    enqueue: enqueueSave,
    flush: flushSave,
    hasPendingChanges,
  } = useCoalescedTimeblockSave(savePatch, {
    shouldDiscardPending: (error) =>
      isTimeblockConflictError(error) || isTimeblockNotFoundError(error),
  });

  const [scheduleNoteSave, cancelScheduledNoteSave] = useDebouncedCallback(
    ({ generation, note }: { generation: number; note: string }) => {
      if (generation !== noteGenerationRef.current || lifecycleStateRef.current !== 'available') {
        return;
      }
      noteDirtyRef.current = false;
      enqueueSave({ note: normalizeNote(note) });
    },
    NOTE_SAVE_DELAY_MS,
  );

  const isWriteFrozen =
    availability === 'unavailable' || isUnavailable || isPreparingAction || hasUnresolvedConflict;

  useEffect(() => {
    if (availability !== 'unavailable' || lifecycleStateRef.current === 'unavailable') return;

    markUnavailable();
  }, [availability, markUnavailable]);

  useEffect(() => {
    if (!isUnavailable) return;

    cancelScheduledNoteSave();
    discardPending(new Error('Timeblock is no longer available'));
    if (targetId) {
      removeMissingTimeblockFromCache(queryClient, kind === 'plan' ? 'plans' : 'records', targetId);
    }
  }, [cancelScheduledNoteSave, discardPending, isUnavailable, kind, queryClient, targetId]);

  useEffect(() => {
    if (
      isDuplicateMode ||
      availability === 'unavailable' ||
      !target ||
      !targetUpdatedAt ||
      observedServerUpdatedAtRef.current === targetUpdatedAt
    ) {
      return;
    }

    observedServerUpdatedAtRef.current = targetUpdatedAt;
    if (lifecycleStateRef.current !== 'available') return;

    const hasLocalChanges =
      noteDirtyRef.current ||
      hasPendingChanges() ||
      saveInFlightRef.current ||
      hasUnsavedTimeDraftRef.current;
    const isLocallyAcceptedSnapshot = latestUpdatedAtRef.current === targetUpdatedAt;

    if (hasLocalChanges) {
      if (!isLocallyAcceptedSnapshot) {
        markConflicted();
        cancelScheduledNoteSave();
        discardPending(new Error('Timeblock changed outside this Inspector'));
      }
      return;
    }

    if (!isLocallyAcceptedSnapshot) {
      transitionEpochRef.current += 1;
    }
    latestUpdatedAtRef.current = targetUpdatedAt;
    pendingNoteRef.current = target.note ?? '';
    noteDirtyRef.current = false;
    hasUnsavedTimeDraftRef.current = false;
    setHasTimeConflict(false);
    setValue((previous) => ({
      ...previous,
      note: target.note ?? '',
      tagId: target.tag_id,
      startAt: new Date(target.start_at),
      endAt: new Date(target.end_at),
    }));
  }, [
    availability,
    cancelScheduledNoteSave,
    discardPending,
    hasPendingChanges,
    isDuplicateMode,
    markConflicted,
    target,
    targetUpdatedAt,
  ]);

  const setActionPreparing = useCallback((preparing: boolean) => {
    actionPreparingRef.current = preparing;
    setIsPreparingAction(preparing);
  }, []);

  const flushNoteSave = useCallback(() => {
    cancelScheduledNoteSave();
    if (lifecycleStateRef.current !== 'available' || !noteDirtyRef.current) return;
    noteDirtyRef.current = false;
    enqueueSave({ note: normalizeNote(pendingNoteRef.current) });
  }, [cancelScheduledNoteSave, enqueueSave]);

  useEffect(
    () => () => {
      if (lifecycleStateRef.current === 'available') {
        flushNoteSave();
      }
    },
    [flushNoteSave],
  );

  // --- タグ（即時保存） ---
  const selectedTag = value.tagId ? getTagById(value.tagId) : undefined;
  const selectedTagColorClasses = selectedTag ? getTagColorClasses(selectedTag.color) : undefined;

  const handleTagChange = useCallback(
    (tagId: string | null) => {
      if (isMigrated || actionPreparingRef.current || lifecycleStateRef.current !== 'available') {
        return;
      }
      setValue((prev) => ({ ...prev, tagId }));
      if (isDuplicateMode || !targetId) return;
      enqueueSave({ tagId });
    },
    [targetId, isMigrated, isDuplicateMode, enqueueSave],
  );

  const handleCreateAndSelectTag = useCallback(
    async (name: string, color?: string | null, icon?: string | null, parentId?: string | null) => {
      try {
        const newTag = await createTagMutation.mutateAsync({
          name,
          color: resolveTagColor(color),
          icon: icon ?? undefined,
          parentId: parentId ?? undefined,
        });
        handleTagChange(newTag.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('duplicate') || message.includes('already exists')) {
          toast.error(t('tags.errors.duplicateName'));
        } else {
          toast.error(t('tags.errors.createFailed'));
        }
      }
    },
    [createTagMutation, handleTagChange, t],
  );

  // --- 日時・メモ（自動保存） ---
  const handleDateTimeChange = useCallback(
    (next: TimeModelEditorValue) => {
      if (actionPreparingRef.current || lifecycleStateRef.current !== 'available') {
        return;
      }
      if (!isDuplicateMode && kind === 'plan' && !isPlanTimeEditable(next.endAt)) {
        toast.error(t('timeblock.editor.timeLocked'));
        return;
      }
      setHasTimeConflict(false);
      setValue(next);
      if (isDuplicateMode) return;
      if (!isValidTimeModelRange(next)) {
        hasUnsavedTimeDraftRef.current = true;
        return;
      }
      const laneItems = collectTimeblockLaneItems(
        queryClient,
        kind === 'plan' ? 'plans' : 'records',
      );
      if (hasTimeblockLaneConflict(laneItems, next.startAt, next.endAt, targetId ?? undefined)) {
        hasUnsavedTimeDraftRef.current = true;
        setHasTimeConflict(true);
        return;
      }
      hasUnsavedTimeDraftRef.current = false;
      enqueueSave({
        start_at: next.startAt.toISOString(),
        end_at: next.endAt.toISOString(),
      });
    },
    [kind, isDuplicateMode, queryClient, targetId, enqueueSave, t],
  );

  const handleNoteChange = useCallback(
    (note: string) => {
      if (actionPreparingRef.current || lifecycleStateRef.current !== 'available') {
        return;
      }
      setValue((prev) => ({ ...prev, note }));
      if (isDuplicateMode) return;
      pendingNoteRef.current = note;
      noteDirtyRef.current = true;
      noteGenerationRef.current += 1;
      scheduleNoteSave({ generation: noteGenerationRef.current, note });
    },
    [isDuplicateMode, scheduleNoteSave],
  );

  const flushPendingEdits = useCallback(async (): Promise<string> => {
    if (lifecycleStateRef.current !== 'available') {
      throw new Error('Timeblock write is frozen');
    }
    const flushEpoch = transitionEpochRef.current;
    cancelScheduledNoteSave();
    noteDirtyRef.current = false;
    await flushSave({
      note: normalizeNote(pendingNoteRef.current),
      tagId: value.tagId,
    });
    if (flushEpoch !== transitionEpochRef.current || lifecycleStateRef.current !== 'available') {
      throw new Error('Timeblock changed while preparing the action');
    }
    const updatedAt = latestUpdatedAtRef.current;
    if (!updatedAt) throw new Error('Missing timeblock version');
    return updatedAt;
  }, [cancelScheduledNoteSave, flushSave, value.tagId]);

  const handleCopy = useCallback(() => {
    if (!target || !onCopy) return;
    onCopy(
      createClipboardTimeblock({
        kind,
        title: target.title,
        description: normalizeNote(value.note),
        startAt: value.startAt,
        endAt: value.endAt,
        tagId: value.tagId,
      }),
    );
  }, [kind, onCopy, target, value]);

  const handleStartDuplicate = useCallback(() => {
    if (!target || !onStartDuplicate) return;
    onStartDuplicate(
      createTimeblockDuplicateDraft({
        sourceId: target.id,
        kind,
        title: target.title,
        note: normalizeNote(value.note),
        tagId: value.tagId,
        startAt: value.startAt,
        endAt: value.endAt,
      }),
    );
  }, [kind, onStartDuplicate, target, value]);

  const duplicateValidationReason = duplicateDraft
    ? getTimeblockDuplicateValidationReason(duplicateDraft, value, duplicateValidationNow)
    : null;
  const dateTimeError = hasTimeConflict
    ? t(getTimeOverlapMessageKey(duplicateDraft?.kind ?? kind))
    : duplicateValidationReason
      ? t(getDuplicateValidationMessageKey(duplicateValidationReason))
      : undefined;

  const handleCreateDuplicate = useCallback(() => {
    if (!duplicateDraft || duplicateValidationReason !== null || hasTimeConflict) return;
    const input = buildTimeblockDuplicateCreateInput(duplicateDraft, value);
    const onSuccess = (created: { id: string } | null | undefined) => {
      if (!created) return;
      toast.success(t('timeblock.editor.duplicate.created'));
      onDuplicateCreated?.(created.id, duplicateDraft.kind);
    };

    if (duplicateDraft.kind === 'plan') {
      createPlan.mutate(input, { onSuccess });
    } else {
      createRecord.mutate(input, { onSuccess });
    }
  }, [
    createPlan,
    createRecord,
    duplicateDraft,
    hasTimeConflict,
    duplicateValidationReason,
    onDuplicateCreated,
    t,
    value,
  ]);

  const handleActionError = useCallback(
    (error: unknown) => {
      if (isTimeblockNotFoundError(error)) markUnavailable();
    },
    [markUnavailable],
  );

  // --- スキップ / 削除 ---
  const handleSkip = useCallback(() => {
    if (!targetId || isWriteFrozen) return;
    setActionPreparing(true);
    void flushPendingEdits()
      .then((expectedUpdatedAt) => skipPlan.mutateAsync({ id: targetId, expectedUpdatedAt }))
      .then(() => toast.success(t('timeblock.editor.toast.skipped')))
      .catch(handleActionError)
      .finally(() => setActionPreparing(false));
  }, [
    targetId,
    isWriteFrozen,
    flushPendingEdits,
    skipPlan,
    handleActionError,
    setActionPreparing,
    t,
  ]);

  const handleUnskip = useCallback(() => {
    if (!targetId || isWriteFrozen) return;
    setActionPreparing(true);
    void flushPendingEdits()
      .then((expectedUpdatedAt) => unskipPlan.mutateAsync({ id: targetId, expectedUpdatedAt }))
      .then(() => toast.success(t('timeblock.editor.toast.unskipped')))
      .catch(handleActionError)
      .finally(() => setActionPreparing(false));
  }, [
    targetId,
    isWriteFrozen,
    flushPendingEdits,
    unskipPlan,
    handleActionError,
    setActionPreparing,
    t,
  ]);

  const handleDelete = useCallback(() => {
    if (!targetId || isWriteFrozen) return;
    setActionPreparing(true);
    void flushPendingEdits()
      .then(async (expectedUpdatedAt) => {
        const deleted =
          kind === 'plan'
            ? await deletePlan.mutateAsync({ id: targetId, expectedUpdatedAt })
            : await deleteRecord.mutateAsync({ id: targetId, expectedUpdatedAt });
        onDeleted();
        toast.success(t('timeblock.editor.toast.deleted'), {
          action: {
            label: t('common.undo'),
            onClick: () => {
              const input = { id: targetId, expectedUpdatedAt: deleted.updated_at };
              const restore =
                kind === 'plan' ? restorePlan.mutateAsync(input) : restoreRecord.mutateAsync(input);
              void restore
                .then(() => toast.success(t('timeblock.editor.toast.restored')))
                .catch(() => undefined);
            },
          },
        });
      })
      .catch(handleActionError)
      .finally(() => setActionPreparing(false));
  }, [
    kind,
    targetId,
    isWriteFrozen,
    flushPendingEdits,
    deletePlan,
    deleteRecord,
    restorePlan,
    restoreRecord,
    handleActionError,
    setActionPreparing,
    onDeleted,
    t,
  ]);

  if (isUnavailable) {
    return (
      <div className="flex h-full flex-1 items-center justify-center">
        <p className="text-muted-foreground">{t('timeblock.inspector.notFound')}</p>
      </div>
    );
  }

  const menuItems = isDuplicateMode
    ? []
    : // eslint-disable-next-line react-hooks/refs -- 純粋helperはcallbackを実行せずmenu itemへ格納するだけ。ref参照はユーザー選択時に限られる。
      getTimeblockMenuItems({
        // time model では変換系（markUnplanned / restorePlanned）を出さないため
        // plan → planned / record → unplanned の対応で表示条件だけ流用する
        origin: kind === 'plan' ? 'planned' : 'unplanned',
        tagId: value.tagId,
        isPast,
        isSkipped,
        onViewStats: onViewStats && value.tagId ? () => onViewStats(value.tagId ?? '') : undefined,
        onCopy: onCopy ? handleCopy : undefined,
        onDuplicate: onStartDuplicate ? handleStartDuplicate : undefined,
        onSkip:
          kind === 'plan' && isRecordStateResolved && !hasRelatedRecords ? handleSkip : undefined,
        onUnskip: kind === 'plan' ? handleUnskip : undefined,
        onDelete: isMigrated ? undefined : handleDelete,
      });

  if (!target && !duplicateDraft) return null;

  const toRelationshipItem = (row: PlanRow | RecordRow): TimeblockRelationshipItem => {
    const tag = row.tag_id ? getTagById(row.tag_id) : undefined;
    return {
      id: row.id,
      tagName: tag?.name ?? t('common.tags.noTag'),
      tagColor: tag?.color ?? null,
      tagIcon: tag?.icon ?? null,
      startAt: new Date(row.start_at),
      endAt: new Date(row.end_at),
    };
  };

  return (
    <div className="space-y-3 p-4">
      <TagRow
        tagId={value.tagId}
        tagName={selectedTag?.name ?? t('common.tags.noTag')}
        tagColorClasses={selectedTagColorClasses}
        tagIcon={selectedTag?.icon}
        tagColor={selectedTag?.color}
        onTagChange={handleTagChange}
        onCreateAndSelect={handleCreateAndSelectTag}
        menuItems={menuItems}
        onCloseInspector={onCloseInspector}
        disabled={isWriteFrozen}
      />

      {isMigrated ? (
        <p className="text-muted-foreground text-sm">{t('timeblock.editor.migratedLocked')}</p>
      ) : null}

      {hasUnresolvedConflict ? (
        <p className="text-destructive text-sm" role="status">
          {t('timeblock.editor.toast.conflict')}
        </p>
      ) : null}

      <TimeblockEditor
        value={value}
        onDateTimeChange={handleDateTimeChange}
        onNoteChange={handleNoteChange}
        onNoteBlur={isDuplicateMode ? undefined : flushNoteSave}
        dateTimeError={dateTimeError}
        disabled={
          deletePlan.isPending ||
          deleteRecord.isPending ||
          createPlan.isPending ||
          createRecord.isPending ||
          isWriteFrozen ||
          isMigrated
        }
      />

      {duplicateDraft ? (
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onCancelDuplicate}>
            {t('common.actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleCreateDuplicate}
            loading={createPlan.isPending || createRecord.isPending}
            disabled={duplicateValidationReason !== null || hasTimeConflict}
          >
            {t('timeblock.editor.duplicate.create')}
          </Button>
        </div>
      ) : null}

      {!isDuplicateMode && relationships && onOpenRelationship ? (
        relationships.kind === 'plan' ? (
          <TimeblockRelationshipSection
            kind="plan"
            status={relationships.status}
            records={relationships.records.map(toRelationshipItem)}
            onOpen={onOpenRelationship}
            onRetry={relationships.onRetry}
          />
        ) : (
          <TimeblockRelationshipSection
            kind="record"
            status={relationships.status}
            plan={relationships.plan ? toRelationshipItem(relationships.plan) : null}
            onOpen={onOpenRelationship}
            onRetry={relationships.onRetry}
          />
        )
      ) : null}

      {!isDuplicateMode &&
      kind === 'plan' &&
      isPast &&
      !isSkipped &&
      isRecordStateResolved &&
      !hasRelatedRecords &&
      targetId ? (
        <div className="flex justify-start">
          <RecordPlanButton
            planId={targetId}
            beforeRecord={flushPendingEdits}
            onPreparingChange={setActionPreparing}
            disabled={isWriteFrozen}
            onError={handleActionError}
            onRecorded={
              onOpenRelationship ? (recordId) => onOpenRelationship(recordId, 'record') : undefined
            }
          />
        </div>
      ) : null}
    </div>
  );
}

'use client';

/**
 * TimeblockInspector のフォーム（Level 2）
 *
 * plan / record の 1 行を受け取り、TagRow ヘッダー + TimeblockEditor を描画する。
 * タグと確定済み日時は即時保存、note はデバウンスして自動保存する。
 * auto_migrated の record は RLS で不変のため読み取り専用として扱う。
 */

import { useCallback, useEffect, useRef, useState } from 'react';

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
import { useTimeblockWriteMutations } from '../../hooks/useTimeblockWriteMutations';
import type { ClipboardTimeblock } from '../../lib/timeblock-clipboard';
import { createClipboardTimeblock } from '../../lib/timeblock-clipboard';
import {
  buildTimeblockDuplicateCreateInput,
  createTimeblockDuplicateDraft,
  getTimeblockDuplicateValidationReason,
  type TimeblockDuplicateDraft,
  type TimeblockDuplicateValidationReason,
} from '../../lib/timeblock-duplicate';
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

interface TimeModelInspectorFormProps {
  kind: TimeblockDestination;
  plan?: PlanRow | undefined;
  record?: RecordRow | undefined;
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

/** plan / record 共通の Inspector フォーム。タグ・日時・メモをフィールド別に自動保存する。 */
export function TimeblockInspectorForm({
  kind,
  plan,
  record,
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
  const { getTagById } = useTagsMap();
  const createTagMutation = useCreateTag({ showToast: false });
  const isDuplicateMode = duplicateDraft != null;
  const [duplicateHasTimeConflict, setDuplicateHasTimeConflict] = useState(false);
  const handleDuplicateTimeOverlap = useCallback(() => setDuplicateHasTimeConflict(true), []);
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
    isDuplicateMode ? { onCreateTimeOverlap: handleDuplicateTimeOverlap } : undefined,
  );

  const target: PlanRow | RecordRow | undefined = kind === 'plan' ? plan : record;
  const targetId = isDuplicateMode ? null : (target?.id ?? null);
  const targetUpdatedAt = target?.updated_at ?? null;
  const latestUpdatedAtRef = useRef(targetUpdatedAt);

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

  // auto_migrated record は RLS で update / delete とも拒否されるため UI 側も読み取り専用にする
  const isMigrated = !isDuplicateMode && kind === 'record' && record?.source === 'auto_migrated';
  const isPast = kind === 'record' || (target != null && new Date(target.end_at) <= new Date());
  const isSkipped = kind === 'plan' && plan?.skipped_at != null;
  const planRelationships = relationships?.kind === 'plan' ? relationships : undefined;
  const isRecordStateResolved = kind !== 'plan' || planRelationships?.status === 'success';
  const hasRelatedRecords =
    planRelationships?.status === 'success' && planRelationships.records.length > 0;

  useEffect(() => {
    latestUpdatedAtRef.current = targetUpdatedAt;
  }, [targetUpdatedAt]);

  const savePatch = useCallback(
    async (patch: TimeblockSavePatch) => {
      if (!targetId || isMigrated) return;
      const input = {
        id: targetId,
        data: patch,
        ...(latestUpdatedAtRef.current ? { expectedUpdatedAt: latestUpdatedAtRef.current } : {}),
      };
      const updated =
        kind === 'plan'
          ? await updatePlan.mutateAsync(input)
          : await updateRecord.mutateAsync(input);
      if (updated) latestUpdatedAtRef.current = updated.updated_at;
    },
    [kind, targetId, isMigrated, updatePlan, updateRecord],
  );
  const { enqueue: enqueueSave, flush: flushSave } = useCoalescedTimeblockSave(savePatch);

  const pendingNoteRef = useRef(value.note);
  const noteDirtyRef = useRef(false);
  const [scheduleNoteSave, cancelScheduledNoteSave] = useDebouncedCallback((note: string) => {
    noteDirtyRef.current = false;
    enqueueSave({ note: normalizeNote(note) });
  }, NOTE_SAVE_DELAY_MS);

  const flushNoteSave = useCallback(() => {
    cancelScheduledNoteSave();
    if (!noteDirtyRef.current) return;
    noteDirtyRef.current = false;
    enqueueSave({ note: normalizeNote(pendingNoteRef.current) });
  }, [cancelScheduledNoteSave, enqueueSave]);

  useEffect(() => () => flushNoteSave(), [flushNoteSave]);

  // --- タグ（即時保存） ---
  const selectedTag = value.tagId ? getTagById(value.tagId) : undefined;
  const selectedTagColorClasses = selectedTag ? getTagColorClasses(selectedTag.color) : undefined;

  const handleTagChange = useCallback(
    (tagId: string | null) => {
      if (isMigrated) return;
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
      if (!isDuplicateMode && kind === 'plan' && !isPlanTimeEditable(next.endAt)) {
        toast.error(t('timeblock.editor.timeLocked'));
        return;
      }
      if (isDuplicateMode) setDuplicateHasTimeConflict(false);
      setValue(next);
      if (isDuplicateMode || !isValidTimeModelRange(next)) return;
      enqueueSave({
        start_at: next.startAt.toISOString(),
        end_at: next.endAt.toISOString(),
      });
    },
    [kind, isDuplicateMode, enqueueSave, t],
  );

  const handleNoteChange = useCallback(
    (note: string) => {
      setValue((prev) => ({ ...prev, note }));
      if (isDuplicateMode) return;
      pendingNoteRef.current = note;
      noteDirtyRef.current = true;
      scheduleNoteSave(note);
    },
    [isDuplicateMode, scheduleNoteSave],
  );

  const flushBeforeRecord = useCallback(() => {
    cancelScheduledNoteSave();
    noteDirtyRef.current = false;
    return flushSave({
      note: normalizeNote(pendingNoteRef.current),
      tagId: value.tagId,
    });
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
  const duplicateValidationMessage = duplicateHasTimeConflict
    ? t('timeblock.errors.timeOverlap')
    : duplicateValidationReason
      ? t(getDuplicateValidationMessageKey(duplicateValidationReason))
      : undefined;

  const handleCreateDuplicate = useCallback(() => {
    if (!duplicateDraft || duplicateValidationReason !== null || duplicateHasTimeConflict) return;
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
    duplicateHasTimeConflict,
    duplicateValidationReason,
    onDuplicateCreated,
    t,
    value,
  ]);

  // --- スキップ / 削除 ---
  const handleSkip = useCallback(() => {
    if (!targetId) return;
    skipPlan.mutate(
      { id: targetId },
      { onSuccess: () => toast.success(t('timeblock.editor.toast.skipped')) },
    );
  }, [targetId, skipPlan, t]);

  const handleUnskip = useCallback(() => {
    if (!targetId) return;
    unskipPlan.mutate(
      { id: targetId },
      { onSuccess: () => toast.success(t('timeblock.editor.toast.unskipped')) },
    );
  }, [targetId, unskipPlan, t]);

  const handleDelete = useCallback(() => {
    if (!targetId) return;
    const deleteMutation = kind === 'plan' ? deletePlan : deleteRecord;
    const restoreMutation = kind === 'plan' ? restorePlan : restoreRecord;
    deleteMutation.mutate(
      { id: targetId },
      {
        onSuccess: () => {
          onDeleted();
          toast.success(t('timeblock.editor.toast.deleted'), {
            action: {
              label: t('common.undo'),
              onClick: () =>
                restoreMutation.mutate(
                  { id: targetId },
                  { onSuccess: () => toast.success(t('timeblock.editor.toast.restored')) },
                ),
            },
          });
        },
      },
    );
  }, [kind, targetId, deletePlan, deleteRecord, restorePlan, restoreRecord, onDeleted, t]);

  const menuItems = isDuplicateMode
    ? []
    : getTimeblockMenuItems({
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
      />

      {isMigrated ? (
        <p className="text-muted-foreground text-sm">{t('timeblock.editor.migratedLocked')}</p>
      ) : null}

      <TimeblockEditor
        value={value}
        onDateTimeChange={handleDateTimeChange}
        onNoteChange={handleNoteChange}
        onNoteBlur={isDuplicateMode ? undefined : flushNoteSave}
        dateTimeError={duplicateValidationMessage}
        disabled={
          deletePlan.isPending ||
          deleteRecord.isPending ||
          createPlan.isPending ||
          createRecord.isPending ||
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
            disabled={duplicateValidationReason !== null || duplicateHasTimeConflict}
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
            beforeRecord={flushBeforeRecord}
            onRecorded={
              onOpenRelationship ? (recordId) => onOpenRelationship(recordId, 'record') : undefined
            }
          />
        </div>
      ) : null}
    </div>
  );
}

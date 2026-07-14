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
import type { Row } from '@/lib/database';
import { databaseTables } from '@/lib/database';
import { useDebouncedCallback } from '@/lib/hooks/useDebounce';
import { toast } from '@/lib/toast';

import { isPlanTimeEditable, type TimeblockDestination } from '../../domain/timeblock-destination';
import {
  type TimeblockSavePatch,
  useCoalescedTimeblockSave,
} from '../../hooks/useCoalescedTimeblockSave';
import { useTimeblockWriteMutations } from '../../hooks/useTimeblockWriteMutations';
import type { ClipboardTimeblock } from '../../lib/timeblock-clipboard';
import { createClipboardTimeblock } from '../../lib/timeblock-clipboard';
import { getTimeblockMenuItems } from '../../lib/timeblock-menu-items';
import { TagRow } from '../inspector/fields';
import {
  isValidTimeModelRange,
  TimeblockEditor,
  type TimeModelEditorValue,
} from './TimeblockEditor';
import { RecordPlanButton } from './TimeblockRecordActions';

type PlanRow = Row<'plans'>;
type RecordRow = Row<typeof databaseTables.records>;

interface TimeModelInspectorFormProps {
  kind: TimeblockDestination;
  plan?: PlanRow | undefined;
  record?: RecordRow | undefined;
  /** plan に紐づく record が存在するか（記録済み判定。record では常に false） */
  isRecorded: boolean;
  onViewStats?: ((tagId: string) => void) | undefined;
  onCopy?: ((timeblock: ClipboardTimeblock) => void) | undefined;
  /** Inspector を閉じるコールバック（Mobile Drawer のみ渡す） */
  onCloseInspector?: (() => void) | undefined;
  /** 削除成功後に Inspector を閉じる */
  onDeleted: () => void;
}

const NOTE_SAVE_DELAY_MS = 600;

function normalizeNote(note: string): string | null {
  return note.trim() === '' ? null : note;
}

/** plan / record 共通の Inspector フォーム。タグ・日時・メモをフィールド別に自動保存する。 */
export function TimeblockInspectorForm({
  kind,
  plan,
  record,
  isRecorded,
  onViewStats,
  onCopy,
  onCloseInspector,
  onDeleted,
}: TimeModelInspectorFormProps) {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const createTagMutation = useCreateTag({ showToast: false });
  const {
    deleteRecord,
    deletePlan,
    restoreRecord,
    restorePlan,
    skipPlan,
    unskipPlan,
    updateRecord,
    updatePlan,
  } = useTimeblockWriteMutations();

  const target: PlanRow | RecordRow | undefined = kind === 'plan' ? plan : record;
  const targetId = target?.id ?? null;
  const targetUpdatedAt = target?.updated_at ?? null;
  const latestUpdatedAtRef = useRef(targetUpdatedAt);

  const [value, setValue] = useState<TimeModelEditorValue>(() => ({
    note: target?.note ?? '',
    tagId: target?.tag_id ?? null,
    startAt: target ? new Date(target.start_at) : new Date(),
    endAt: target ? new Date(target.end_at) : new Date(),
    source: kind,
  }));

  // auto_migrated record は RLS で update / delete とも拒否されるため UI 側も読み取り専用にする
  const isMigrated = kind === 'record' && record?.source === 'auto_migrated';
  const isPast = kind === 'record' || (target != null && new Date(target.end_at) <= new Date());
  const isSkipped = kind === 'plan' && plan?.skipped_at != null;

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
  const enqueueSave = useCoalescedTimeblockSave(savePatch);

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
      if (!targetId || isMigrated) return;
      setValue((prev) => ({ ...prev, tagId }));
      enqueueSave({ tagId });
    },
    [targetId, isMigrated, enqueueSave],
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
      if (kind === 'plan' && !isPlanTimeEditable(next.endAt)) {
        toast.error(t('timeblock.editor.timeLocked'));
        return;
      }
      setValue(next);
      if (!isValidTimeModelRange(next)) return;
      enqueueSave({
        start_at: next.startAt.toISOString(),
        end_at: next.endAt.toISOString(),
      });
    },
    [kind, enqueueSave, t],
  );

  const handleNoteChange = useCallback(
    (note: string) => {
      setValue((prev) => ({ ...prev, note }));
      pendingNoteRef.current = note;
      noteDirtyRef.current = true;
      scheduleNoteSave(note);
    },
    [scheduleNoteSave],
  );

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

  const menuItems = getTimeblockMenuItems({
    // time model では変換系（markUnplanned / restorePlanned）を出さないため
    // plan → planned / record → unplanned の対応で表示条件だけ流用する
    origin: kind === 'plan' ? 'planned' : 'unplanned',
    tagId: value.tagId,
    isPast,
    isSkipped,
    onViewStats: onViewStats && value.tagId ? () => onViewStats(value.tagId ?? '') : undefined,
    onCopy: onCopy ? handleCopy : undefined,
    onSkip: kind === 'plan' && !isRecorded ? handleSkip : undefined,
    onUnskip: kind === 'plan' ? handleUnskip : undefined,
    onDelete: isMigrated ? undefined : handleDelete,
  });

  if (!target) return null;

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
        onNoteBlur={flushNoteSave}
        disabled={deletePlan.isPending || deleteRecord.isPending || isMigrated}
      />

      {kind === 'plan' && isPast && !isSkipped && !isRecorded && targetId ? (
        <div className="flex justify-start">
          <RecordPlanButton planId={targetId} />
        </div>
      ) : null}
    </div>
  );
}

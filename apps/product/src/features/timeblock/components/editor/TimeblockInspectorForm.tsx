'use client';

/**
 * TimeblockInspector のフォーム（Level 2）
 *
 * plan / record の 1 行を受け取り、TagRow ヘッダー + TimeblockEditor を描画する。
 * タグ変更は即時保存、title / note / 時間は保存ボタンで確定する。
 * auto_migrated の record は RLS で不変のため読み取り専用として扱う。
 */

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { getTagColorClasses, resolveTagColor, useCreateTag, useTagsMap } from '@/features/tags';
import type { Row } from '@/lib/database';
import { databaseTables } from '@/lib/database';
import { toast } from '@/lib/toast';

import type { TimeblockDestination } from '../../domain/timeblock-destination';
import { isPlanTimeEditable } from '../../domain/timeblock-destination';
import { useTimeblockWriteMutations } from '../../hooks/useTimeblockWriteMutations';
import { getTimeblockMenuItems } from '../../lib/timeblock-menu-items';
import { TagRow } from '../inspector/fields';
import { TimeblockEditor, type TimeModelEditorValue } from './TimeblockEditor';
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
  /** Inspector を閉じるコールバック（Mobile Drawer のみ渡す） */
  onCloseInspector?: (() => void) | undefined;
  /** 削除成功後に Inspector を閉じる */
  onDeleted: () => void;
}

/** plan / record 共通の Inspector フォーム。タグ即時保存 + エディタ submit 保存。 */
export function TimeblockInspectorForm({
  kind,
  plan,
  record,
  isRecorded,
  onViewStats,
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

  const [value, setValue] = useState<TimeModelEditorValue>(() => ({
    title: target?.title ?? '',
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
  const timeLocked = kind === 'plan' && target != null && !isPlanTimeEditable(target.end_at);

  // --- タグ（即時保存） ---
  const selectedTag = value.tagId ? getTagById(value.tagId) : undefined;
  const selectedTagColorClasses = selectedTag ? getTagColorClasses(selectedTag.color) : undefined;

  const handleTagChange = useCallback(
    (tagId: string | null) => {
      if (!targetId || isMigrated) return;
      setValue((prev) => ({ ...prev, tagId }));
      if (kind === 'plan') {
        updatePlan.mutate({ id: targetId, data: { tagId } });
      } else {
        updateRecord.mutate({ id: targetId, data: { tagId } });
      }
    },
    [kind, targetId, isMigrated, updatePlan, updateRecord],
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

  // --- 保存（title / note / 時間） ---
  const handleSubmit = useCallback(() => {
    if (!targetId || !targetUpdatedAt || isMigrated) return;
    const data = {
      title: value.title.trim(),
      note: value.note.trim() === '' ? null : value.note,
      tagId: value.tagId,
      // 過去 plan の時間はサーバーが PLAN_TIME_LOCKED で拒否するため送らない
      ...(timeLocked
        ? {}
        : { start_at: value.startAt.toISOString(), end_at: value.endAt.toISOString() }),
    };
    const options = {
      onSuccess: () => toast.success(t('timeblock.editor.toast.saved')),
    };
    if (kind === 'plan') {
      updatePlan.mutate({ id: targetId, data, expectedUpdatedAt: targetUpdatedAt }, options);
    } else {
      updateRecord.mutate({ id: targetId, data, expectedUpdatedAt: targetUpdatedAt }, options);
    }
  }, [kind, targetId, targetUpdatedAt, isMigrated, timeLocked, value, updatePlan, updateRecord, t]);

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
    onSkip: kind === 'plan' && !isRecorded ? handleSkip : undefined,
    onUnskip: kind === 'plan' ? handleUnskip : undefined,
    onDelete: isMigrated ? undefined : handleDelete,
  });

  if (!target) return null;

  const isSubmitting =
    updatePlan.isPending ||
    updateRecord.isPending ||
    deletePlan.isPending ||
    deleteRecord.isPending;

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
        onChange={setValue}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting || isMigrated}
      />

      {kind === 'plan' && isPast && !isSkipped && !isRecorded && targetId ? (
        <div className="flex justify-start">
          <RecordPlanButton planId={targetId} />
        </div>
      ) : null}
    </div>
  );
}

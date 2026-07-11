'use client';

/**
 * TimeModelInspector のフォーム（Level 2）
 *
 * plan / log の 1 行を受け取り、TagRow ヘッダー + TimeModelEditor を描画する。
 * タグ変更は即時保存、title / note / 時間は保存ボタンで確定する。
 * auto_migrated の log は RLS で不変のため読み取り専用として扱う。
 */

import { useCallback, useState } from 'react';

import { useTranslations } from 'next-intl';

import { getTagColorClasses, resolveTagColor, useCreateTag, useTagsMap } from '@/features/tags';
import type { Row } from '@/lib/database';
import { toast } from '@/lib/toast';

import type { TimeModelDestination } from '../../domain/time-model-destination';
import { isPlanTimeEditable } from '../../domain/time-model-destination';
import { useTimeModelWriteMutations } from '../../hooks/useTimeModelWriteMutations';
import { getEntryMenuItems } from '../../lib/entry-menu-items';
import { TagRow } from '../inspector/fields';
import { TimeModelEditor, type TimeModelEditorValue } from './TimeModelEditor';
import { RecordPlanButton } from './TimeModelRecordActions';

type PlanRow = Row<'plans'>;
type LogRow = Row<'logs'>;

interface TimeModelInspectorFormProps {
  kind: TimeModelDestination;
  plan?: PlanRow | undefined;
  log?: LogRow | undefined;
  /** plan に紐づく log が存在するか（記録済み判定。log では常に false） */
  isRecorded: boolean;
  onViewStats?: ((tagId: string) => void) | undefined;
  /** Inspector を閉じるコールバック（Mobile Drawer のみ渡す） */
  onCloseInspector?: (() => void) | undefined;
  /** 削除成功後に Inspector を閉じる */
  onDeleted: () => void;
}

/** plan / log 共通の Inspector フォーム。タグ即時保存 + エディタ submit 保存。 */
export function TimeModelInspectorForm({
  kind,
  plan,
  log,
  isRecorded,
  onViewStats,
  onCloseInspector,
  onDeleted,
}: TimeModelInspectorFormProps) {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const createTagMutation = useCreateTag({ showToast: false });
  const {
    deleteLog,
    deletePlan,
    restoreLog,
    restorePlan,
    skipPlan,
    unskipPlan,
    updateLog,
    updatePlan,
  } = useTimeModelWriteMutations();

  const target: PlanRow | LogRow | undefined = kind === 'plan' ? plan : log;
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

  // auto_migrated log は RLS で update / delete とも拒否されるため UI 側も読み取り専用にする
  const isMigrated = kind === 'log' && log?.source === 'auto_migrated';
  const isPast = kind === 'log' || (target != null && new Date(target.end_at) <= new Date());
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
        updateLog.mutate({ id: targetId, data: { tagId } });
      }
    },
    [kind, targetId, isMigrated, updatePlan, updateLog],
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
      onSuccess: () => toast.success(t('entry.timeModel.toast.saved')),
    };
    if (kind === 'plan') {
      updatePlan.mutate({ id: targetId, data, expectedUpdatedAt: targetUpdatedAt }, options);
    } else {
      updateLog.mutate({ id: targetId, data, expectedUpdatedAt: targetUpdatedAt }, options);
    }
  }, [kind, targetId, targetUpdatedAt, isMigrated, timeLocked, value, updatePlan, updateLog, t]);

  // --- スキップ / 削除 ---
  const handleSkip = useCallback(() => {
    if (!targetId) return;
    skipPlan.mutate(
      { id: targetId },
      { onSuccess: () => toast.success(t('entry.timeModel.toast.skipped')) },
    );
  }, [targetId, skipPlan, t]);

  const handleUnskip = useCallback(() => {
    if (!targetId) return;
    unskipPlan.mutate(
      { id: targetId },
      { onSuccess: () => toast.success(t('entry.timeModel.toast.unskipped')) },
    );
  }, [targetId, unskipPlan, t]);

  const handleDelete = useCallback(() => {
    if (!targetId) return;
    const deleteMutation = kind === 'plan' ? deletePlan : deleteLog;
    const restoreMutation = kind === 'plan' ? restorePlan : restoreLog;
    deleteMutation.mutate(
      { id: targetId },
      {
        onSuccess: () => {
          onDeleted();
          toast.success(t('entry.timeModel.toast.deleted'), {
            action: {
              label: t('common.undo'),
              onClick: () =>
                restoreMutation.mutate(
                  { id: targetId },
                  { onSuccess: () => toast.success(t('entry.timeModel.toast.restored')) },
                ),
            },
          });
        },
      },
    );
  }, [kind, targetId, deletePlan, deleteLog, restorePlan, restoreLog, onDeleted, t]);

  const menuItems = getEntryMenuItems({
    // time model では変換系（markUnplanned / restorePlanned）を出さないため
    // plan → planned / log → unplanned の対応で表示条件だけ流用する
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
    updatePlan.isPending || updateLog.isPending || deletePlan.isPending || deleteLog.isPending;

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
        <p className="text-muted-foreground text-sm">{t('entry.timeModel.migratedLocked')}</p>
      ) : null}

      <TimeModelEditor
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

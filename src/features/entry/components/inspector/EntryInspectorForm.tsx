'use client';

/**
 * Inspector フォーム（Level 2）
 *
 * useEntryForm() で全状態を取得し、フラットにフィールドを描画する。
 * onViewStats は Composition Layer（GlobalOverlays）から注入される。
 */

import { useCallback } from 'react';

import { toast } from '@/lib/toast';
import { Calendar, Clock, Play, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCreateTag, useTagsMap } from '@/features/tags';
import { getTagColorClasses, resolveTagColor } from '@/lib/tag-colors';
import { useAutoAdjustEndTime } from '../../hooks/useAutoAdjustEndTime';
import { getEntryMenuItems } from '../../lib/entry-menu-items';
import type { FulfillmentScore } from '../../types/entry';

import {
  DateRow,
  FulfillmentRow,
  NoteSection,
  TagRow,
  TimeConflictAlert,
  TimeDiffBlock,
  TimeRow,
} from './fields';
import { useEntryForm } from './hooks/useEntryForm';

interface EntryInspectorFormProps {
  /** 統計を見るコールバック（Composition Layer から注入） */
  onViewStats?: ((tagId: string) => void) | undefined;
  /** Inspector を閉じるコールバック（Mobile Drawer のみ渡す。set されたら TagRow 右端に × を出す） */
  onCloseInspector?: (() => void) | undefined;
}

/** InspectorのフォームコンポーネントーuseEntryFormから全状態を取得し全フィールドをフラットに描画） */
export function EntryInspectorForm({ onViewStats, onCloseInspector }: EntryInspectorFormProps) {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const createTagMutation = useCreateTag({ showToast: false });
  const { entryId, entry, fields, handlers, state, actions } = useEntryForm();
  const { selectedTagId, scheduleDate, startTime, endTime, actualStartTime, actualEndTime } =
    fields;
  const {
    handleTagChange,
    handleScheduleDateChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleActualStartChange,
    handleActualEndChange,
    autoSave,
  } = handlers;
  const { timeConflictError } = state;
  const {
    handleDelete,
    updateEntry,
    convertPlannedToUnplanned,
    convertUnplannedToPlanned,
    prepareForStructuralMutation,
    finishStructuralMutation,
  } = actions;

  // --- タグデータ解決（TagRow に pure props で渡す） ---
  const selectedTag = selectedTagId ? getTagById(selectedTagId) : undefined;
  const selectedTagName = selectedTag?.name;
  const selectedTagColorClasses = selectedTag ? getTagColorClasses(selectedTag.color) : undefined;

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

  // --- 派生値 ---

  // 充実度（TanStack Query の楽観的更新で即座に反映）
  const fulfillmentScore: FulfillmentScore | null = entry?.fulfillment_score ?? null;
  const isUnplanned = entry?.origin === 'unplanned';
  const isPlanned = entry?.origin === 'planned';

  const handleMarkUnplanned = useCallback(() => {
    if (!entryId || !isPlanned) return;
    void prepareForStructuralMutation()
      .then(() => {
        return convertPlannedToUnplanned.mutateAsync({ id: entryId });
      })
      .catch(() => {
        // 保存側で toast 済み。古いデータのまま変換しない。
      })
      .finally(() => {
        finishStructuralMutation();
      });
  }, [
    entryId,
    isPlanned,
    prepareForStructuralMutation,
    finishStructuralMutation,
    convertPlannedToUnplanned,
  ]);

  const handleRestorePlanned = useCallback(() => {
    if (!entryId || !isUnplanned) return;
    void prepareForStructuralMutation()
      .then(() => {
        return convertUnplannedToPlanned.mutateAsync({ id: entryId });
      })
      .catch(() => {
        // 保存側で toast 済み。古いデータのまま変換しない。
      })
      .finally(() => {
        finishStructuralMutation();
      });
  }, [
    entryId,
    isUnplanned,
    prepareForStructuralMutation,
    finishStructuralMutation,
    convertUnplannedToPlanned,
  ]);

  const handleFulfillmentChange = useCallback(
    (score: FulfillmentScore | null) => {
      if (!entryId) return;
      updateEntry.mutate({ id: entryId, data: { fulfillment_score: score } });
    },
    [entryId, updateEntry],
  );

  // 予定行の自動調整
  const {
    handleStartTimeChange: autoPlannedStartChange,
    handleEndTimeChange: autoPlannedEndChange,
  } = useAutoAdjustEndTime(startTime, endTime, handleEndTimeChange);

  const applyPlannedTimeChange = useCallback(
    (type: 'start' | 'end', time: string) => {
      if (type === 'start') {
        autoPlannedStartChange(time);
        handleStartTimeChange(time);
      } else {
        autoPlannedEndChange(time);
        handleEndTimeChange(time);
      }
    },
    [autoPlannedStartChange, autoPlannedEndChange, handleStartTimeChange, handleEndTimeChange],
  );

  const onPlannedStartChange = (time: string) => {
    applyPlannedTimeChange('start', time);
  };

  const onPlannedEndChange = (time: string) => {
    applyPlannedTimeChange('end', time);
  };

  // 記録行の実効値（null → 予定の値を使用）
  const effectiveActualStart = actualStartTime ?? startTime;
  const effectiveActualEnd = actualEndTime ?? endTime;

  const handleViewStats = useCallback(() => {
    if (!selectedTagId || !onViewStats) return;
    onViewStats(selectedTagId);
  }, [selectedTagId, onViewStats]);

  if (!entry) return null;

  const menuItems = getEntryMenuItems({
    origin: entry.origin,
    tagId: selectedTagId,
    onViewStats: onViewStats && selectedTagId ? handleViewStats : undefined,
    onMarkUnplanned: isPlanned ? handleMarkUnplanned : undefined,
    onRestorePlanned: isUnplanned ? handleRestorePlanned : undefined,
    onDelete: handleDelete,
  });

  return (
    <div className="px-4 pt-2 pb-4 md:px-6 md:pt-4 md:pb-6">
      {/* Row 0: タグ + 削除ボタン */}
      <TagRow
        tagId={selectedTagId}
        tagName={selectedTagName ?? ''}
        tagColorClasses={selectedTagColorClasses}
        tagIcon={selectedTag?.icon}
        tagColor={selectedTag?.color}
        onTagChange={handleTagChange}
        onCreateAndSelect={handleCreateAndSelectTag}
        menuItems={menuItems}
        onCloseInspector={onCloseInspector}
      />

      {/* アラート（時間重複エラー） — CLS 防止のため常に DOM に存在させる */}
      <div
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- grid expand/collapse animation
        className={`grid transition-[grid-template-rows] duration-200 ${timeConflictError ? 'grid-rows-expanded mt-2' : 'grid-rows-collapsed'}`}
        aria-hidden={!timeConflictError}
      >
        <div className="overflow-hidden">
          <TimeConflictAlert message={t('calendar.toast.conflictDescription')} />
        </div>
      </div>

      {/* スケジュールカード */}
      <div className="bg-muted mt-2 rounded-2xl">
        <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
          {/* 日付 */}
          <DateRow
            label={t('entry.inspector.time.date')}
            icon={Calendar}
            selectedDate={scheduleDate}
            onDateChange={handleScheduleDateChange}
          />

          {/* 予定行 */}
          <TimeRow
            label={t('entry.inspector.time.planned')}
            icon={Clock}
            startTime={startTime}
            endTime={endTime}
            onStartChange={onPlannedStartChange}
            onEndChange={onPlannedEndChange}
            hasError={timeConflictError}
            disabled={isUnplanned}
            testId="entry-inspector-planned-time"
          />

          {/* 記録行 */}
          <TimeRow
            label={t('entry.inspector.time.actual')}
            icon={Play}
            startTime={effectiveActualStart}
            endTime={effectiveActualEnd}
            onStartChange={(time) => {
              handleActualStartChange(time);
            }}
            onEndChange={(time) => {
              handleActualEndChange(time);
            }}
            testId="entry-inspector-actual-time"
          />

          {/* 予定 vs 記録 差分バー */}
          <TimeDiffBlock
            plannedStart={startTime}
            plannedEnd={endTime}
            actualStart={actualStartTime}
            actualEnd={actualEndTime}
            tagColor={selectedTag?.color}
            isUnplanned={isUnplanned}
          />

          {/* 充実度 */}
          <FulfillmentRow
            label={t('entry.inspector.time.fulfillment')}
            score={fulfillmentScore ?? null}
            onScoreChange={handleFulfillmentChange}
            scoreLabels={{
              low: t('entry.inspector.time.fulfillmentLow'),
              medium: t('entry.inspector.time.fulfillmentMedium'),
              high: t('entry.inspector.time.fulfillmentHigh'),
            }}
            tooltipLabels={{
              low: t('entry.inspector.time.fulfillmentTooltipLow'),
              medium: t('entry.inspector.time.fulfillmentTooltipMedium'),
              high: t('entry.inspector.time.fulfillmentTooltipHigh'),
            }}
          />

          {/* メモ */}
          <NoteSection
            label={t('entry.inspector.note.label')}
            icon={StickyNote}
            note={entry.description || ''}
            onNoteChange={(text) => autoSave('description', text)}
            placeholder={t('entry.inspector.note.placeholder')}
          />
        </div>
      </div>
    </div>
  );
}

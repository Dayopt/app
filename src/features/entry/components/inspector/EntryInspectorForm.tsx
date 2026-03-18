'use client';

/**
 * Inspector フォーム（Level 2）
 *
 * useEntryForm() で全状態を取得し、フラットにフィールドを描画する。
 * props は entry + onDelete のみ。
 *
 * 旧 EntryInspectorContent + EntryInspectorDetailsTab + InspectorDetailsLayout +
 * InspectorTimeSection を統合。
 */

import { useCallback, useMemo } from 'react';

import { Calendar, Clock, Play, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useCreateTag, useTagsMap } from '@/features/tags';
import { getTagColorClasses, resolveTagColor } from '@/lib/tag-colors';
import { computeDuration } from '@/lib/time-utils';
import { useAutoAdjustEndTime } from '../../hooks/useAutoAdjustEndTime';
import { useEntryMutations } from '../../hooks/useEntryMutations';
import type { FulfillmentScore, RecurrenceType } from '../../types/entry';

import {
  DateRow,
  FulfillmentRow,
  NoteSection,
  RecurrenceRow,
  ReminderRow,
  TagRow,
  TimeConflictAlert,
  TimeDiffBar,
  TimeRow,
} from './fields';
import { useEntryForm } from './hooks/useEntryForm';

export function EntryInspectorForm() {
  const t = useTranslations();
  const { getTagById } = useTagsMap();
  const createTagMutation = useCreateTag({ showToast: false });
  const { entryId, entry, fields, handlers, state, actions } = useEntryForm();
  const {
    selectedTagId,
    scheduleDate,
    startTime,
    endTime,
    actualStartTime,
    actualEndTime,
    reminderMinutes,
  } = fields;
  const {
    handleTagChange,
    handleScheduleDateChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleActualStartChange,
    handleActualEndChange,
    handleReminderChange,
    autoSave,
  } = handlers;
  const { timeConflictError } = state;
  const { updateEntry: updateEntryMutation, handleDelete } = actions;

  // --- タグデータ解決（TagRow に pure props で渡す） ---
  const selectedTag = selectedTagId ? getTagById(selectedTagId) : undefined;
  const selectedTagName = selectedTag?.name;
  const selectedTagColorClasses = selectedTag ? getTagColorClasses(selectedTag.color) : undefined;

  const handleCreateAndSelectTag = useCallback(
    async (name: string, color?: string | null) => {
      try {
        const newTag = await createTagMutation.mutateAsync({
          name,
          color: resolveTagColor(color),
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

  const { updateEntry } = useEntryMutations();
  const handleFulfillmentChange = useCallback(
    (score: FulfillmentScore | null) => {
      if (!entryId) return;
      updateEntry.mutate({ id: entryId, data: { fulfillment_score: score } });
    },
    [entryId, updateEntry],
  );

  // 繰り返し（TanStack Query の楽観的更新で即座に反映）
  const recurrenceRule = entry?.recurrence_rule ?? null;
  const recurrenceType: RecurrenceType | null =
    (entry?.recurrence_type as RecurrenceType | null) ?? null;

  const handleRepeatTypeChange = useCallback(
    (type: string) => {
      if (!entryId) return;
      updateEntryMutation.mutate({
        id: entryId,
        data: {
          recurrence_type: (type || 'none') as RecurrenceType,
          recurrence_rule: null,
        },
      });
    },
    [entryId, updateEntryMutation],
  );

  const handleRecurrenceRuleChange = useCallback(
    (rrule: string | null) => {
      if (!entryId) return;
      updateEntryMutation.mutate({ id: entryId, data: { recurrence_rule: rrule } });
    },
    [entryId, updateEntryMutation],
  );

  // 予定行の自動調整
  const {
    handleStartTimeChange: autoPlannedStartChange,
    handleEndTimeChange: autoPlannedEndChange,
  } = useAutoAdjustEndTime(startTime, endTime, handleEndTimeChange);

  const onPlannedStartChange = (time: string) => {
    autoPlannedStartChange(time);
    handleStartTimeChange(time);
  };

  const onPlannedEndChange = (time: string) => {
    autoPlannedEndChange(time);
    handleEndTimeChange(time);
  };

  // 記録行の実効値（null → 予定の値を使用）
  const effectiveActualStart = actualStartTime ?? startTime;
  const effectiveActualEnd = actualEndTime ?? endTime;

  // Duration / diff
  const plannedDuration = useMemo(() => computeDuration(startTime, endTime), [startTime, endTime]);
  const actualDuration = useMemo(
    () => computeDuration(effectiveActualStart, effectiveActualEnd),
    [effectiveActualStart, effectiveActualEnd],
  );

  if (!entry) return null;

  return (
    <div className="px-4 pt-3 pb-4 md:px-6 md:pt-5 md:pb-6">
      {/* Row 0: タグ + 削除ボタン */}
      <TagRow
        tagId={selectedTagId}
        tagName={selectedTagName}
        tagColorClasses={selectedTagColorClasses}
        onTagChange={handleTagChange}
        onCreateAndSelect={handleCreateAndSelectTag}
        onDelete={handleDelete}
      />

      {/* アラート（時間重複エラー） */}
      {timeConflictError && (
        <div className="mt-2">
          <TimeConflictAlert message={t('calendar.toast.conflictDescription')} />
        </div>
      )}

      {/* スケジュールカード */}
      <div className="bg-surface-inset mt-3 rounded-xl">
        <div className="flex flex-col gap-2 px-4 pt-2.5 pb-4">
          {/* 日付 */}
          <DateRow
            label={t('plan.inspector.time.date')}
            icon={Calendar}
            selectedDate={scheduleDate}
            onDateChange={handleScheduleDateChange}
          />

          {/* 予定行 */}
          <TimeRow
            label={t('plan.inspector.time.planned')}
            icon={Clock}
            startTime={startTime}
            endTime={endTime}
            onStartChange={onPlannedStartChange}
            onEndChange={onPlannedEndChange}
            hasError={timeConflictError}
          />

          {/* 記録行 */}
          <TimeRow
            label={t('plan.inspector.time.actual')}
            icon={Play}
            startTime={effectiveActualStart}
            endTime={effectiveActualEnd}
            onStartChange={(time) => handleActualStartChange(time)}
            onEndChange={(time) => handleActualEndChange(time)}
          />

          {/* プログレスバー + 差分バッジ */}
          {plannedDuration > 0 && (
            <TimeDiffBar plannedMinutes={plannedDuration} actualMinutes={actualDuration} />
          )}

          {/* 充実度（endTimeが過去のエントリのみ表示） */}
          {entry.end_time && new Date(entry.end_time) < new Date() && (
            <FulfillmentRow
              label={t('plan.inspector.time.fulfillment')}
              score={fulfillmentScore ?? null}
              onScoreChange={handleFulfillmentChange}
              scoreLabels={{
                low: t('plan.inspector.time.fulfillmentLow'),
                medium: t('plan.inspector.time.fulfillmentMedium'),
                high: t('plan.inspector.time.fulfillmentHigh'),
              }}
            />
          )}

          {/* 繰り返し */}
          <RecurrenceRow
            recurrenceRule={recurrenceRule}
            recurrenceType={recurrenceType}
            onRepeatTypeChange={handleRepeatTypeChange}
            onRecurrenceRuleChange={handleRecurrenceRuleChange}
          />

          {/* リマインダー */}
          <ReminderRow value={reminderMinutes} onChange={handleReminderChange} />

          {/* メモ */}
          <NoteSection
            label={t('plan.inspector.note.label')}
            icon={StickyNote}
            note={entry.description || ''}
            onNoteChange={(text) => autoSave('description', text)}
            placeholder={t('plan.inspector.note.placeholder')}
          />
        </div>
      </div>
    </div>
  );
}

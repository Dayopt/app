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

import { computeDuration } from '@/lib/time-utils';
import { useAutoAdjustEndTime } from '../../hooks/useAutoAdjustEndTime';
import { useEntryMutations } from '../../hooks/useEntryMutations';
import { getEntryState } from '../../lib/entry-status';
import type { EntryOrigin, FulfillmentScore, RecurrenceType } from '../../types/entry';

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
  const {
    entryId,
    entry,
    selectedTagId,
    handleTagChange,
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
    autoSave,
    updateEntry: updateEntryMutation,
    handleDelete,
    timeConflictError,
    getCache,
  } = useEntryForm();

  // --- 派生値 ---

  const entryState = useMemo(() => {
    if (!entry) return 'upcoming' as const;
    return getEntryState({
      start_time: entry.start_time ?? null,
      end_time: entry.end_time ?? null,
    });
  }, [entry]);

  const origin = useMemo<EntryOrigin>(() => {
    return entry?.origin ?? 'planned';
  }, [entry]);

  const isUnplanned = origin === 'unplanned';
  const isPast = entryState === 'past';
  const isPlanLocked = isPast && !isUnplanned;

  // 充実度
  const fulfillmentScore = useMemo<FulfillmentScore | null>(() => {
    if (!entryId) return null;
    const cache = getCache(entryId);
    if (cache?.fulfillment_score !== undefined) {
      return cache.fulfillment_score as FulfillmentScore | null;
    }
    return entry?.fulfillment_score ?? null;
  }, [entryId, entry, getCache]);

  const { updateEntry } = useEntryMutations();
  const handleFulfillmentChange = useCallback(
    (score: FulfillmentScore | null) => {
      if (!entryId) return;
      updateEntry.mutate({ id: entryId, data: { fulfillment_score: score } });
    },
    [entryId, updateEntry],
  );

  // 繰り返し
  const recurrenceRule = useMemo(() => {
    if (!entryId) return null;
    const cache = getCache(entryId);
    return cache?.recurrence_rule !== undefined
      ? cache.recurrence_rule
      : (entry?.recurrence_rule ?? null);
  }, [entryId, entry, getCache]);

  const recurrenceType = useMemo<RecurrenceType | null>(() => {
    if (!entryId) return null;
    const cache = getCache(entryId);
    return cache?.recurrence_type !== undefined
      ? (cache.recurrence_type as RecurrenceType | null)
      : (entry?.recurrence_type ?? null);
  }, [entryId, entry, getCache]);

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

  // 表示条件
  const showRecurrence = !isUnplanned;
  const showReminder = showRecurrence && !(isPast && reminderMinutes === null);

  // 日付制限
  const today = useMemo(() => new Date(), []);
  const dateMinDate = isPast ? undefined : today;

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
      <TagRow tagId={selectedTagId} onTagChange={handleTagChange} onDelete={handleDelete} />

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
            disabled={isPlanLocked}
            minDate={dateMinDate}
          />

          {/* 予定行（unplanned は非表示） */}
          {!isUnplanned && (
            <TimeRow
              label={t('plan.inspector.time.planned')}
              icon={Clock}
              startTime={startTime}
              endTime={endTime}
              onStartChange={onPlannedStartChange}
              onEndChange={onPlannedEndChange}
              disabled={isPlanLocked}
              hasError={timeConflictError}
            />
          )}

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
          {plannedDuration > 0 && !isUnplanned && (
            <TimeDiffBar plannedMinutes={plannedDuration} actualMinutes={actualDuration} />
          )}

          {/* 充実度 */}
          <FulfillmentRow
            label={t('plan.inspector.time.fulfillment')}
            score={fulfillmentScore ?? null}
            onScoreChange={handleFulfillmentChange}
          />

          {/* 繰り返し */}
          {showRecurrence && (
            <RecurrenceRow
              recurrenceRule={recurrenceRule}
              recurrenceType={recurrenceType}
              onRepeatTypeChange={handleRepeatTypeChange}
              onRecurrenceRuleChange={handleRecurrenceRuleChange}
            />
          )}

          {/* リマインダー */}
          {showReminder && <ReminderRow value={reminderMinutes} onChange={handleReminderChange} />}

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

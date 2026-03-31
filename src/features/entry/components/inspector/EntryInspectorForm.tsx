'use client';

/**
 * Inspector フォーム（Level 2）
 *
 * useEntryForm() で全状態を取得し、フラットにフィールドを描画する。
 * onPinToPalette は Composition Layer（GlobalOverlays）から注入される。
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
import type { FulfillmentScore } from '../../types/entry';

import {
  DateRow,
  FulfillmentRow,
  NoteSection,
  ReminderRow,
  TagRow,
  TimeConflictAlert,
  TimeDiffBar,
  TimeRow,
} from './fields';
import { useEntryForm } from './hooks/useEntryForm';

/** 15分単位にスナップ（パレット登録用） */
function snapToQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15 || 15;
}

interface EntryInspectorFormProps {
  /** パレットへのピン留めコールバック（Composition Layer から注入） */
  onPinToPalette?: ((tagId: string, durationMinutes: number) => void) | undefined;
  /** パレットから解除コールバック（Composition Layer から注入） */
  onUnpinFromPalette?: ((tagId: string, durationMinutes: number) => void) | undefined;
  /** パレット登録済みチェック関数（Composition Layer から注入） */
  isPinnedInPalette?: ((tagId: string, durationMinutes: number) => boolean) | undefined;
  /** 統計を見るコールバック（Composition Layer から注入） */
  onViewStats?: ((tagId: string) => void) | undefined;
}

/** InspectorのフォームコンポーネントーuseEntryFormから全状態を取得し全フィールドをフラットに描画） */
export function EntryInspectorForm({
  onPinToPalette,
  onUnpinFromPalette,
  isPinnedInPalette,
  onViewStats,
}: EntryInspectorFormProps) {
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
  const { handleDelete } = actions;

  // --- タグデータ解決（TagRow に pure props で渡す） ---
  const selectedTag = selectedTagId ? getTagById(selectedTagId) : undefined;
  const selectedTagName = selectedTag?.name;
  const selectedTagColorClasses = selectedTag ? getTagColorClasses(selectedTag.color) : undefined;

  const handleCreateAndSelectTag = useCallback(
    async (name: string, color?: string | null, icon?: string | null) => {
      try {
        const newTag = await createTagMutation.mutateAsync({
          name,
          color: resolveTagColor(color),
          icon: icon ?? undefined,
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

  // Duration
  const plannedDuration = useMemo(() => computeDuration(startTime, endTime), [startTime, endTime]);

  // パレット登録ハンドラ + 登録済みチェック
  const snappedDuration = plannedDuration > 0 ? snapToQuarter(plannedDuration) : 0;

  const handlePinToPalette = useCallback(() => {
    if (!selectedTagId || snappedDuration <= 0 || !onPinToPalette) return;
    onPinToPalette(selectedTagId, snappedDuration);
  }, [selectedTagId, snappedDuration, onPinToPalette]);

  const isPinned =
    !!isPinnedInPalette && !!selectedTagId && snappedDuration > 0
      ? isPinnedInPalette(selectedTagId, snappedDuration)
      : false;

  const handleUnpinFromPalette = useCallback(() => {
    if (!selectedTagId || snappedDuration <= 0 || !onUnpinFromPalette) return;
    onUnpinFromPalette(selectedTagId, snappedDuration);
  }, [selectedTagId, snappedDuration, onUnpinFromPalette]);

  const handleViewStats = useCallback(() => {
    if (!selectedTagId || !onViewStats) return;
    onViewStats(selectedTagId);
  }, [selectedTagId, onViewStats]);

  // Duration diff
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
        tagIcon={selectedTag?.icon}
        tagColor={selectedTag?.color}
        onTagChange={handleTagChange}
        onCreateAndSelect={handleCreateAndSelectTag}
        onPinToPalette={
          onPinToPalette && selectedTagId && snappedDuration > 0 ? handlePinToPalette : undefined
        }
        onUnpinFromPalette={onUnpinFromPalette && isPinned ? handleUnpinFromPalette : undefined}
        isPinnedInPalette={isPinned}
        onViewStats={onViewStats && selectedTagId ? handleViewStats : undefined}
        onDelete={handleDelete}
      />

      {/* アラート（時間重複エラー） — CLS 防止のため常に DOM に存在させる */}
      <div
        className={`mt-2 grid transition-[grid-template-rows] duration-200 ${timeConflictError ? 'grid-rows-expanded' : 'grid-rows-collapsed'}`}
        aria-hidden={!timeConflictError}
      >
        <div className="overflow-hidden">
          <TimeConflictAlert message={t('calendar.toast.conflictDescription')} />
        </div>
      </div>

      {/* スケジュールカード */}
      <div className="bg-muted mt-3 rounded-2xl">
        <div className="flex flex-col gap-2 px-4 pt-2.5 pb-4">
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
          />

          {/* 記録行 */}
          <TimeRow
            label={t('entry.inspector.time.actual')}
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

          {/* リマインダー */}
          <ReminderRow value={reminderMinutes} onChange={handleReminderChange} />

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

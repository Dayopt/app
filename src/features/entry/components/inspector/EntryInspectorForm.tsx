'use client';

/**
 * Inspector フォーム（Level 2）
 *
 * useEntryForm() で全状態を取得し、フラットにフィールドを描画する。
 * onViewStats は Composition Layer（GlobalOverlays）から注入される。
 */

import { useCallback, useState } from 'react';

import { toast } from '@/lib/toast';
import { Calendar, Clock, Play, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useCreateTag, useTagsMap } from '@/features/tags';
import { ConfirmDialog } from '@/lib/components/ui/confirm-dialog';
import { localTimeToUTCISO } from '@/lib/date-utils';
import { getTagColorClasses, resolveTagColor } from '@/lib/tag-colors';
import { useAutoAdjustEndTime } from '../../hooks/useAutoAdjustEndTime';
import { useEntryMutations } from '../../hooks/useEntryMutations';
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
}

/** InspectorのフォームコンポーネントーuseEntryFormから全状態を取得し全フィールドをフラットに描画） */
export function EntryInspectorForm({ onViewStats }: EntryInspectorFormProps) {
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
    setStartTimeLocal,
    setEndTimeLocal,
    resetActualTimesLocal,
    suppressSaveRef,
    autoSave,
  } = handlers;
  const { timeConflictError, timezone } = state;
  const { handleDelete, save } = actions;

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

  const { updateEntry } = useEntryMutations();

  // 計画外にする / 計画に戻す
  const handleMarkUnplanned = useCallback(() => {
    if (!entryId || !entry) return;
    updateEntry.mutate({
      id: entryId,
      data: {
        origin: 'unplanned',
      },
    });
  }, [entryId, entry, updateEntry]);

  const handleRestorePlanned = useCallback(() => {
    if (!entryId || !entry) return;
    updateEntry.mutate({
      id: entryId,
      data: {
        origin: 'planned',
      },
    });
  }, [entryId, entry, updateEntry]);
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

  // 記録付きエントリの予定時間変更確認
  const hasActualTime = entry?.actual_start_time != null || entry?.actual_end_time != null;
  const [pendingTimeChange, setPendingTimeChange] = useState<{
    type: 'start' | 'end';
    time: string;
  } | null>(null);

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
    if (hasActualTime) {
      setPendingTimeChange({ type: 'start', time });
      return;
    }
    applyPlannedTimeChange('start', time);
  };

  const onPlannedEndChange = (time: string) => {
    if (hasActualTime) {
      setPendingTimeChange({ type: 'end', time });
      return;
    }
    applyPlannedTimeChange('end', time);
  };

  const handleConfirmTimeChange = useCallback(() => {
    if (!pendingTimeChange || !scheduleDate) return;
    const { type, time } = pendingTimeChange;
    const [hours, minutes] = time.split(':').map(Number);
    const isoValue = localTimeToUTCISO(scheduleDate, hours ?? 0, minutes ?? 0, timezone);

    // autoAdjust 経由の追加 save を抑制
    suppressSaveRef.current = true;

    // ローカル状態のみ更新（save を発火しない）
    if (type === 'start') {
      setStartTimeLocal(time);
    } else {
      setEndTimeLocal(time);
    }
    resetActualTimesLocal();

    // debounced save にマージ — 先行 pending があってもそのまま合流して1回の mutation
    save({
      [type === 'start' ? 'start_time' : 'end_time']: isoValue,
      actual_start_time: null,
      actual_end_time: null,
    });
    toast.success(t('entry.toast.updated'));
    setTimeout(() => {
      suppressSaveRef.current = false;
    }, 100);
    setPendingTimeChange(null);
  }, [
    pendingTimeChange,
    scheduleDate,
    timezone,
    setStartTimeLocal,
    setEndTimeLocal,
    resetActualTimesLocal,
    suppressSaveRef,
    save,
    t,
  ]);

  const handleCancelTimeChange = useCallback(() => {
    setPendingTimeChange(null);
  }, []);

  // 記録行の実効値（null → 予定の値を使用）
  const effectiveActualStart = actualStartTime ?? startTime;
  const effectiveActualEnd = actualEndTime ?? endTime;

  const handleViewStats = useCallback(() => {
    if (!selectedTagId || !onViewStats) return;
    onViewStats(selectedTagId);
  }, [selectedTagId, onViewStats]);

  if (!entry) return null;

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
        onViewStats={onViewStats && selectedTagId ? handleViewStats : undefined}
        onDelete={handleDelete}
        isUnplanned={isUnplanned}
        onMarkUnplanned={handleMarkUnplanned}
        onRestorePlanned={handleRestorePlanned}
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
          />

          {/* 記録行 */}
          <TimeRow
            label={t('entry.inspector.time.actual')}
            icon={Play}
            startTime={effectiveActualStart}
            endTime={effectiveActualEnd}
            onStartChange={(time) => {
              if (isUnplanned && scheduleDate) {
                // 予定外: 記録と予定を1回のmutationで同期
                const isoValue = time
                  ? localTimeToUTCISO(
                      scheduleDate,
                      ...(time.split(':').map(Number) as [number, number]),
                      timezone,
                    )
                  : null;
                setStartTimeLocal(time);
                handleActualStartChange(time);
                suppressSaveRef.current = true;
                save({ start_time: isoValue });
                setTimeout(() => {
                  suppressSaveRef.current = false;
                }, 100);
              } else {
                handleActualStartChange(time);
              }
            }}
            onEndChange={(time) => {
              if (isUnplanned && scheduleDate) {
                const isoValue = time
                  ? localTimeToUTCISO(
                      scheduleDate,
                      ...(time.split(':').map(Number) as [number, number]),
                      timezone,
                    )
                  : null;
                setEndTimeLocal(time);
                handleActualEndChange(time);
                suppressSaveRef.current = true;
                save({ end_time: isoValue });
                setTimeout(() => {
                  suppressSaveRef.current = false;
                }, 100);
              } else {
                handleActualEndChange(time);
              }
            }}
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
      {/* 記録リセット確認ダイアログ */}
      <ConfirmDialog
        open={pendingTimeChange !== null}
        onClose={handleCancelTimeChange}
        onConfirm={handleConfirmTimeChange}
        title={t('calendar.event.moveWithRecord.title')}
        description={t('calendar.event.moveWithRecord.description')}
        variant="warning"
        confirmLabel={t('calendar.event.moveWithRecord.confirm')}
      />
    </div>
  );
}

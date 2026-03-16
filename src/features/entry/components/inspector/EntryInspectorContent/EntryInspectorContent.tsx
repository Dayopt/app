'use client';

/**
 * Entry Inspectorのコンテンツ部分
 *
 * 「Time waits for no one」原則:
 * - getEntryState() で時間位置に基づくUI出し分け
 * - status フィールドなし（時間位置から自動判定）
 * - ドラフトモードなし（即DB保存 + edit mode）
 */

import { useCallback, useMemo } from 'react';

import { useEntryMutations } from '../../../hooks/useEntryMutations';
import { getEntryState } from '../../../lib/entry-status';
import type { EntryOrigin, FulfillmentScore } from '../../../types/entry';

import { EntryInspectorDetailsTab } from './EntryInspectorDetailsTab';
import { useEntryInspectorContentLogic } from './useEntryInspectorContentLogic';

export function EntryInspectorContent() {
  const {
    planId,
    plan,
    selectedTagId,
    handleTagChange,
    scheduleDate,
    startTime,
    endTime,
    reminderMinutes,
    actualStartTime,
    actualEndTime,
    handleReminderChange,
    timeConflictError,
    handleScheduleDateChange,
    handleStartTimeChange,
    handleEndTimeChange,
    handleActualStartChange,
    handleActualEndChange,
    autoSave,
    updatePlan,
    handleDelete,
    getCache,
  } = useEntryInspectorContentLogic();

  // エントリの時間位置ベース状態（upcoming/active/past）
  const entryState = useMemo(() => {
    if (!plan) return 'upcoming' as const;
    const st = plan.start_time ?? null;
    const et = plan.end_time ?? null;
    return getEntryState({ start_time: st, end_time: et });
  }, [plan]);

  // origin（planned / unplanned）
  const origin = useMemo<EntryOrigin>(() => {
    return plan?.origin ?? 'planned';
  }, [plan]);

  // 充実度スコアのハンドリング
  const fulfillmentScore = useMemo<FulfillmentScore | null>(() => {
    if (!planId) return null;
    const cache = getCache(planId);
    if (cache?.fulfillment_score !== undefined) {
      return cache.fulfillment_score as FulfillmentScore | null;
    }
    return plan?.fulfillment_score ?? null;
  }, [planId, plan, getCache]);

  // 充実度は entries API 経由で更新
  const { updateEntry } = useEntryMutations();
  const handleFulfillmentChange = useCallback(
    (score: FulfillmentScore | null) => {
      if (!planId) return;
      updateEntry.mutate({ id: planId, data: { fulfillment_score: score } });
    },
    [planId, updateEntry],
  );

  if (!plan) return null;

  return (
    <EntryInspectorDetailsTab
      plan={plan}
      onDelete={handleDelete}
      scheduleDate={scheduleDate}
      startTime={startTime}
      endTime={endTime}
      reminderMinutes={reminderMinutes}
      selectedTagId={selectedTagId}
      onTagChange={handleTagChange}
      recurrenceRule={(() => {
        if (!planId) return null;
        const cache = getCache(planId);
        return cache?.recurrence_rule !== undefined
          ? cache.recurrence_rule
          : (plan?.recurrence_rule ?? null);
      })()}
      recurrenceType={(() => {
        if (!planId) return null;
        const cache = getCache(planId);
        return cache?.recurrence_type !== undefined
          ? cache.recurrence_type
          : (plan?.recurrence_type ?? null);
      })()}
      onAutoSave={autoSave}
      onScheduleDateChange={handleScheduleDateChange}
      onStartTimeChange={handleStartTimeChange}
      onEndTimeChange={handleEndTimeChange}
      onReminderChange={handleReminderChange}
      onRepeatTypeChange={(type) => {
        if (!planId) return;
        updatePlan.mutate({
          id: planId,
          data: {
            recurrence_type: (type || 'none') as
              | 'none'
              | 'daily'
              | 'weekly'
              | 'monthly'
              | 'yearly'
              | 'weekdays',
            recurrence_rule: null,
          },
        });
      }}
      onRecurrenceRuleChange={(rrule) => {
        if (!planId) return;
        updatePlan.mutate({ id: planId, data: { recurrence_rule: rrule } });
      }}
      timeConflictError={timeConflictError}
      entryState={entryState}
      origin={origin}
      fulfillmentScore={fulfillmentScore}
      onFulfillmentChange={handleFulfillmentChange}
      actualStart={actualStartTime}
      actualEnd={actualEndTime}
      onActualStartChange={handleActualStartChange}
      onActualEndChange={handleActualEndChange}
    />
  );
}

'use client';

/**
 * Inspector の詳細タブ — 2パターン対応（planned / unplanned）
 *
 * Row 0: タグ（カラードット + タグ名）+ ⋯ メニュー
 * Row 1: 予定/記録 時間比較セクション
 * Row 2: オプションボタン群
 */

import { memo } from 'react';

import { useTranslations } from 'next-intl';
import { InspectorDetailsLayout } from '../InspectorDetailsLayout';
import { InspectorTagRow } from '../InspectorTagRow';
import { InspectorTimeSection } from '../InspectorTimeSection';
import { TimeConflictAlert } from '../TimeConflictAlert';

import type {
  EntryOrigin,
  EntryState,
  EntryWithTags,
  FulfillmentScore,
  RecurrenceType,
} from '../../../types/entry';

import { Bell, Repeat } from 'lucide-react';

import { ReminderSelect } from '../ReminderSelect';

import { RecurrenceIconButton } from '../../shared/RecurrenceIconButton';

interface EntryInspectorDetailsTabProps {
  plan: EntryWithTags;
  /** 削除ボタンのコールバック */
  onDelete?: () => void;
  scheduleDate: Date | undefined;
  startTime: string;
  endTime: string;
  reminderMinutes: number | null;
  selectedTagId: string | null;
  onTagChange: (tagId: string | null) => void;
  recurrenceRule: string | null;
  recurrenceType: RecurrenceType | null;
  timeConflictError?: boolean;
  onAutoSave: (field: string, value: string | undefined) => void;
  onScheduleDateChange: (date: Date | undefined) => void;
  onStartTimeChange: (time: string) => void;
  onEndTimeChange: (time: string) => void;
  onReminderChange: (minutes: number | null) => void;
  onRepeatTypeChange: (type: string) => void;
  onRecurrenceRuleChange: (rrule: string | null) => void;
  entryState?: EntryState;
  origin?: EntryOrigin;
  fulfillmentScore?: FulfillmentScore | null;
  onFulfillmentChange?: (score: FulfillmentScore | null) => void;
  // 記録時間（actual）
  actualStart?: string | null;
  actualEnd?: string | null;
  onActualStartChange?: (time: string | null) => void;
  onActualEndChange?: (time: string | null) => void;
}

export const EntryInspectorDetailsTab = memo(function EntryInspectorDetailsTab({
  plan,
  onDelete,
  scheduleDate,
  startTime,
  endTime,
  reminderMinutes,
  selectedTagId,
  onTagChange,
  recurrenceRule,
  recurrenceType,
  timeConflictError = false,
  onAutoSave,
  onScheduleDateChange,
  onStartTimeChange,
  onEndTimeChange,
  onReminderChange,
  onRepeatTypeChange,
  onRecurrenceRuleChange,
  entryState = 'upcoming',
  origin = 'planned',
  fulfillmentScore,
  onFulfillmentChange,
  actualStart = null,
  actualEnd = null,
  onActualStartChange,
  onActualEndChange,
}: EntryInspectorDetailsTabProps) {
  const t = useTranslations();

  // 予定エントリでは繰り返し・リマインダーを表示（記録のみは非表示）
  const showRecurrence = origin !== 'unplanned';
  // 過去エントリで未設定のリマインダーは非表示（もう機能しないため）
  const showReminder = showRecurrence && !(entryState === 'past' && reminderMinutes === null);

  return (
    <InspectorDetailsLayout
      tagRow={
        <InspectorTagRow tagId={selectedTagId} onTagChange={onTagChange} onDelete={onDelete} />
      }
      alert={
        timeConflictError ? (
          <TimeConflictAlert message={t('calendar.toast.conflictDescription')} />
        ) : undefined
      }
      schedule={
        <InspectorTimeSection
          selectedDate={scheduleDate}
          onDateChange={onScheduleDateChange}
          plannedStart={startTime}
          plannedEnd={endTime}
          onPlannedStartChange={onStartTimeChange}
          onPlannedEndChange={onEndTimeChange}
          actualStart={actualStart ?? null}
          actualEnd={actualEnd ?? null}
          onActualStartChange={onActualStartChange ?? (() => {})}
          onActualEndChange={onActualEndChange ?? (() => {})}
          entryState={entryState}
          origin={origin}
          timeConflictError={timeConflictError}
          fulfillmentScore={fulfillmentScore}
          onFulfillmentChange={onFulfillmentChange}
          note={plan.description || ''}
          onNoteChange={(text) => onAutoSave('description', text)}
          notePlaceholder={t('plan.inspector.note.placeholder')}
          recurrenceRow={
            showRecurrence ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Repeat className="text-muted-foreground size-4 flex-shrink-0" />
                  <span className="text-muted-foreground text-sm">
                    {t('common.recurrence.label')}
                  </span>
                </div>
                <div className="-mr-2">
                  <RecurrenceIconButton
                    recurrenceRule={recurrenceRule}
                    recurrenceType={recurrenceType}
                    onRepeatTypeChange={onRepeatTypeChange}
                    onRecurrenceRuleChange={onRecurrenceRuleChange}
                  />
                </div>
              </div>
            ) : undefined
          }
          reminderRow={
            showReminder ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="text-muted-foreground size-4 flex-shrink-0" />
                  <span className="text-muted-foreground text-sm">
                    {t('common.reminder.label')}
                  </span>
                </div>
                <div className="-mr-2">
                  <ReminderSelect
                    value={reminderMinutes}
                    onChange={onReminderChange}
                    variant="inspector"
                  />
                </div>
              </div>
            ) : undefined
          }
        />
      }
    />
  );
});

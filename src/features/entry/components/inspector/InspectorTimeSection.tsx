'use client';

/**
 * Inspector 時間セクション（組み立て役）
 *
 * DateNavigatorRow + TimeRow × 2 + 差分バッジを
 * 2パターン（planned, unplanned）に応じて組み立てる。
 */

import type { ReactNode } from 'react';

import { Calendar, Clock, Play, StickyNote } from 'lucide-react';
import { useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { computeDuration } from '@/lib/time-utils';
import { cn } from '@/lib/utils';
import { useAutoAdjustEndTime } from '../../hooks/useAutoAdjustEndTime';
import type { EntryOrigin, EntryState, FulfillmentScore } from '../../types/entry';

import { DateNavigatorRow } from './DateNavigatorRow';
import { FulfillmentRow } from './FulfillmentRow';
import { InlineNoteSection } from './InlineNoteSection';
import { TimeProgressBar } from './TimeProgressBar';
import { TimeRow } from './TimeRow';

/** 差分（分）を "+15m" / "±0" / "-10m" 形式にフォーマット */
function formatDiffDisplay(diffMinutes: number): string {
  if (diffMinutes === 0) return '±0';
  const abs = Math.abs(diffMinutes);
  const sign = diffMinutes > 0 ? '+' : '-';
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h > 0 && m > 0) return `${sign}${h}h ${m}m`;
  if (h > 0) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

interface InspectorTimeSectionProps {
  // 日付
  selectedDate: Date | undefined;
  onDateChange: (date: Date | undefined) => void;
  // 予定
  plannedStart: string;
  plannedEnd: string;
  onPlannedStartChange: (time: string) => void;
  onPlannedEndChange: (time: string) => void;
  // 記録
  actualStart: string | null;
  actualEnd: string | null;
  onActualStartChange: (time: string | null) => void;
  onActualEndChange: (time: string | null) => void;
  // 状態
  entryState: EntryState;
  origin?: EntryOrigin;
  timeConflictError?: boolean;
  disabled?: boolean;
  // 充実度
  fulfillmentScore?: FulfillmentScore | null | undefined;
  onFulfillmentChange?: ((score: FulfillmentScore | null) => void) | undefined;
  // メモ
  note?: string | undefined;
  onNoteChange?: ((text: string) => void) | undefined;
  notePlaceholder?: string | undefined;
  // 繰り返し・通知（ReactNode スロット）
  recurrenceRow?: ReactNode;
  reminderRow?: ReactNode;
}

export function InspectorTimeSection({
  selectedDate,
  onDateChange,
  plannedStart,
  plannedEnd,
  onPlannedStartChange,
  onPlannedEndChange,
  actualStart,
  actualEnd,
  onActualStartChange,
  onActualEndChange,
  entryState,
  origin = 'planned',
  timeConflictError = false,
  disabled = false,
  fulfillmentScore,
  onFulfillmentChange,
  note,
  onNoteChange,
  notePlaceholder,
  recurrenceRow,
  reminderRow,
}: InspectorTimeSectionProps) {
  const t = useTranslations();

  // 2パターンのレンダリング制御（planned / unplanned）
  const isUnplanned = origin === 'unplanned';
  const isPast = entryState === 'past';
  // 過去ブロック: 予定ロック（Time waits for no one）— unplanned は記録のみなのでロックしない
  const isPlanLocked = (isPast && !isUnplanned) || disabled;
  // 未来/進行中ブロック: 過去の日付への移動を防止
  const today = useMemo(() => new Date(), []);
  const dateMinDate = isPast ? undefined : today;

  // 予定行の自動調整
  const {
    handleStartTimeChange: autoPlannedStartChange,
    handleEndTimeChange: autoPlannedEndChange,
  } = useAutoAdjustEndTime(plannedStart, plannedEnd, onPlannedEndChange);

  const handlePlannedStartChange = (time: string) => {
    autoPlannedStartChange(time);
    onPlannedStartChange(time);
  };

  const handlePlannedEndChange = (time: string) => {
    autoPlannedEndChange(time);
    onPlannedEndChange(time);
  };

  // 記録行の実効値（null → 予定の値を使用）
  const effectiveActualStart = actualStart ?? plannedStart;
  const effectiveActualEnd = actualEnd ?? plannedEnd;

  // 記録行は連動なし（開始を変えても終了はそのまま）
  const handleActualStartChange = (time: string) => {
    onActualStartChange(time);
  };

  const handleActualEndChange = (time: string) => {
    onActualEndChange(time);
  };

  // Duration 計算
  const plannedDuration = useMemo(
    () => computeDuration(plannedStart, plannedEnd),
    [plannedStart, plannedEnd],
  );
  const actualDuration = useMemo(
    () => computeDuration(effectiveActualStart, effectiveActualEnd),
    [effectiveActualStart, effectiveActualEnd],
  );

  // 差分計算（予定 vs 記録）
  const diffMinutes = useMemo(
    () => actualDuration - plannedDuration,
    [actualDuration, plannedDuration],
  );

  return (
    <div className="flex flex-col gap-2 px-4 pt-2.5 pb-4">
      {/* 日付（過去ブロック: disabled / 未来ブロック: minDate=today） */}
      <DateNavigatorRow
        label={t('plan.inspector.time.date')}
        icon={Calendar}
        selectedDate={selectedDate}
        onDateChange={onDateChange}
        disabled={isPlanLocked}
        minDate={dateMinDate}
      />

      {/* 予定行（unplanned は予定がないため非表示） */}
      {!isUnplanned && (
        <TimeRow
          label={t('plan.inspector.time.planned')}
          icon={Clock}
          startTime={plannedStart}
          endTime={plannedEnd}
          onStartChange={handlePlannedStartChange}
          onEndChange={handlePlannedEndChange}
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
        onStartChange={handleActualStartChange}
        onEndChange={handleActualEndChange}
        disabled={disabled}
      />

      {/* 予定 vs 記録の差分（プログレスバー + バッジ） */}
      {plannedDuration > 0 && !isUnplanned && (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <TimeProgressBar plannedMinutes={plannedDuration} actualMinutes={actualDuration} />
          </div>
          <span
            className={cn(
              'shrink-0 rounded-md px-1.5 py-0.5 text-xs font-medium tabular-nums',
              diffMinutes > 0
                ? 'bg-warning/15 text-warning'
                : diffMinutes < 0
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-success/15 text-success',
            )}
          >
            {formatDiffDisplay(diffMinutes)}
          </span>
        </div>
      )}

      {/* 充実度 */}
      {onFulfillmentChange && (
        <FulfillmentRow
          label={t('plan.inspector.time.fulfillment')}
          score={fulfillmentScore ?? null}
          onScoreChange={onFulfillmentChange}
          disabled={disabled}
        />
      )}

      {/* 繰り返し・通知（記録のみのエントリでは非表示） */}
      {!isUnplanned && recurrenceRow}
      {!isUnplanned && reminderRow}

      {/* メモ */}
      {onNoteChange && (
        <InlineNoteSection
          label={t('plan.inspector.note.label')}
          icon={StickyNote}
          note={note ?? ''}
          onNoteChange={onNoteChange}
          placeholder={notePlaceholder}
          disabled={disabled}
        />
      )}
    </div>
  );
}

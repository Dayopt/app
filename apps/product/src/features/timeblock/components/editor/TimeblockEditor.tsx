'use client';

import { Calendar, Clock, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DateRow, TimeRow } from '@/features/timeblock';
import { Button, Input, Textarea } from '@dayopt/components';

import {
  isPlanTimeEditable,
  resolveTimeblockDestination,
  type TimeblockDestination,
} from '../../domain/timeblock-destination';
import { TimeblockDestinationChip } from './TimeblockDestinationChip';

export interface TimeModelEditorValue {
  title: string;
  note: string;
  tagId: string | null;
  startAt: Date;
  endAt: Date;
  /** 既存 Plan の編集時だけ指定する。 */
  source?: TimeblockDestination | undefined;
}

interface TimeModelEditorProps {
  value: TimeModelEditorValue;
  onChange: (next: TimeModelEditorValue) => void;
  onSubmit: (destination: TimeblockDestination) => void;
  isSubmitting?: boolean | undefined;
}

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function withTime(date: Date, value: string): Date {
  const [hour, minute] = value.split(':').map(Number);
  const next = new Date(date);
  next.setHours(hour ?? 0, minute ?? 0, 0, 0);
  return next;
}

/** Plan / Log 共通エディタ。保存先は end_at から表示専用で導出する。 */
export function TimeblockEditor({ value, onChange, onSubmit, isSubmitting }: TimeModelEditorProps) {
  const t = useTranslations('timeblock.editor');
  const destination = resolveTimeblockDestination(value.endAt);
  const timeLocked = value.source === 'plan' && !isPlanTimeEditable(value.endAt);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(destination);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <TimeblockDestinationChip destination={destination} />
        {timeLocked && <span className="text-muted-foreground text-xs">{t('timeLocked')}</span>}
      </div>
      <Input
        value={value.title}
        onChange={(event) => onChange({ ...value, title: event.target.value })}
        placeholder={t('titlePlaceholder')}
        aria-label={t('title')}
        disabled={isSubmitting}
      />
      <div className="bg-muted rounded-2xl px-4 py-2">
        <DateRow
          label={t('date')}
          icon={Calendar}
          selectedDate={value.startAt}
          onDateChange={(date) => {
            if (!date || timeLocked) return;
            const startAt = new Date(date);
            startAt.setHours(value.startAt.getHours(), value.startAt.getMinutes(), 0, 0);
            const endAt = new Date(date);
            endAt.setHours(value.endAt.getHours(), value.endAt.getMinutes(), 0, 0);
            onChange({ ...value, startAt, endAt });
          }}
        />
        <TimeRow
          label={t('time')}
          icon={Clock}
          startTime={formatTime(value.startAt)}
          endTime={formatTime(value.endAt)}
          onStartChange={(next) => onChange({ ...value, startAt: withTime(value.startAt, next) })}
          onEndChange={(next) => onChange({ ...value, endAt: withTime(value.endAt, next) })}
          disabled={timeLocked || isSubmitting === true}
          isPrimary={destination === 'log'}
        />
      </div>
      <div className="space-y-1">
        <label
          className="text-muted-foreground flex items-center gap-2 text-sm"
          htmlFor="time-model-note"
        >
          <StickyNote className="size-4" />
          {t('note')}
        </label>
        <Textarea
          id="time-model-note"
          value={value.note}
          onChange={(event) => onChange({ ...value, note: event.target.value })}
          placeholder={t('notePlaceholder')}
          disabled={isSubmitting}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isSubmitting || value.title.trim().length === 0}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

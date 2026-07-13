'use client';

import { Calendar, Clock, StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DateRow, TimeRow } from '@/features/timeblock';
import { Button } from '@dayopt/components';

import {
  isPlanTimeEditable,
  resolveTimeblockDestination,
  type TimeblockDestination,
} from '../../domain/timeblock-destination';
import { NoteSection } from '../inspector/fields';

export interface TimeModelEditorValue {
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

/** Plan / Record 共通エディタ。詳細画面では日時とメモだけを編集する。 */
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
      {timeLocked && (
        <div className="flex justify-end">
          <span className="text-muted-foreground text-xs">{t('timeLocked')}</span>
        </div>
      )}
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
          isPrimary={destination === 'record'}
        />
      </div>
      <NoteSection
        label={t('note')}
        icon={StickyNote}
        note={value.note}
        onNoteChange={(note) => onChange({ ...value, note })}
        placeholder={t('notePlaceholder')}
        disabled={isSubmitting}
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {t('save')}
        </Button>
      </div>
    </form>
  );
}

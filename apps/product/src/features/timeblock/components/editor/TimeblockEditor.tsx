'use client';

import { StickyNote } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DateTimeSection } from '@/features/timeblock';

import { isPlanTimeEditable, type TimeblockDestination } from '../../domain/timeblock-destination';
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
  onDateTimeChange: (next: TimeModelEditorValue) => void;
  onNoteChange: (note: string) => void;
  onNoteBlur?: (() => void) | undefined;
  disabled?: boolean | undefined;
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

export function isValidTimeModelRange(value: TimeModelEditorValue): boolean {
  return value.startAt.getTime() < value.endAt.getTime();
}

/** Plan / Record 共通エディタ。確定した入力は上位で自動保存する。 */
export function TimeblockEditor({
  value,
  onDateTimeChange,
  onNoteChange,
  onNoteBlur,
  disabled,
}: TimeModelEditorProps) {
  const t = useTranslations('timeblock.editor');
  const timeLocked = value.source === 'plan' && !isPlanTimeEditable(value.endAt);

  return (
    <div className="space-y-3">
      {timeLocked ? (
        <div className="flex justify-end">
          <span className="text-muted-foreground text-xs">{t('timeLocked')}</span>
        </div>
      ) : null}
      <div className="bg-muted rounded-2xl px-4 py-2">
        <DateTimeSection
          dateLabel={t('date')}
          timeLabel={t('time')}
          selectedDate={value.startAt}
          onDateSelect={(date) => {
            const startAt = new Date(date);
            startAt.setHours(value.startAt.getHours(), value.startAt.getMinutes(), 0, 0);
            const endAt = new Date(date);
            endAt.setHours(value.endAt.getHours(), value.endAt.getMinutes(), 0, 0);
            onDateTimeChange({ ...value, startAt, endAt });
          }}
          startTime={formatTime(value.startAt)}
          onStartChange={(next) =>
            onDateTimeChange({ ...value, startAt: withTime(value.startAt, next) })
          }
          endTime={formatTime(value.endAt)}
          onEndChange={(next) => onDateTimeChange({ ...value, endAt: withTime(value.endAt, next) })}
          disabled={disabled === true || timeLocked}
          hasError={!isValidTimeModelRange(value)}
        />
      </div>
      <div onBlurCapture={onNoteBlur}>
        <NoteSection
          label={t('note')}
          icon={StickyNote}
          note={value.note}
          onNoteChange={onNoteChange}
          placeholder={t('notePlaceholder')}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

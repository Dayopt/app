'use client';

import { Calendar, Clock } from 'lucide-react';

import { DateRow, TimeRow } from '@/features/entry';
import { TagIcon } from '@/features/tags';
import { Button } from '@/lib/components/ui/button';
import { ColonTagLabel } from '@/lib/components/ui/colon-tag-label';
import { cn } from '@/lib/utils';

export interface TagEntryCreateFormProps {
  tag: {
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
  };
  /** 選択日付（時刻 00:00） */
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  /** 開始時刻 HH:MM */
  startTime: string;
  onStartTimeChange: (hhmm: string) => void;
  /** 終了時刻 HH:MM */
  endTime: string;
  onEndTimeChange: (hhmm: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  hasError?: boolean;
  className?: string;
}

/**
 * タグエントリ作成フォーム body（Inspector 流用版）。
 *
 * 1. タグアイコン + 名前ヘッダー
 * 2. 日付行 (Inspector の `<DateRow>`)
 * 3. 予定行 (Inspector の `<TimeRow>`) — 開始 → 終了の 2 つの TimeSelect
 * 4. キャンセル / 作成 ボタン
 *
 * 旧 Duration スライダーと日付チップは撤廃。Inspector と同じ入力 UI に一本化。
 */
export function TagEntryCreateForm({
  tag,
  selectedDate,
  onDateSelect,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  hasError = false,
  className,
}: TagEntryCreateFormProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* 1. タグ名ヘッダー */}
      <div className="flex items-center gap-2 pb-1">
        <TagIcon icon={tag.icon} color={tag.color} size="sm" />
        <ColonTagLabel name={tag.name} variant="separator" className="text-base font-medium" />
      </div>

      {/* 2. 日付 */}
      <DateRow
        label="日付"
        icon={Calendar}
        selectedDate={selectedDate}
        onDateChange={(d) => {
          if (d) onDateSelect(d);
        }}
      />

      {/* 3. 予定（開始 → 終了） */}
      <TimeRow
        label="予定"
        icon={Clock}
        startTime={startTime}
        endTime={endTime}
        onStartChange={onStartTimeChange}
        onEndChange={onEndTimeChange}
        hasError={hasError}
      />

      {/* 4. アクション */}
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          キャンセル
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={isSubmitting || !startTime || !endTime}
        >
          作成
        </Button>
      </div>
    </div>
  );
}

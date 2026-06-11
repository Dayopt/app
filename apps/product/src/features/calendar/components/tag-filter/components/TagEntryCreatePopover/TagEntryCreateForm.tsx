'use client';

import { Calendar, Clock, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DateRow, TimeConflictAlert, TimeRow } from '@/features/entry';
import { TagIcon } from '@/features/tags';
import { Button } from '@/lib/components/ui/button';
import { cn } from '@/lib/utils';

export interface TagEntryCreateFormProps {
  tag: {
    id: string;
    name: string;
    color: string | null;
    icon: string | null;
  };
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  startTime: string;
  onStartTimeChange: (hhmm: string) => void;
  endTime: string;
  onEndTimeChange: (hhmm: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  hasError?: boolean;
  className?: string;
}

/**
 * タグエントリ作成フォーム body。
 *
 * レイアウト:
 * 1. タグアイコン + 名前ヘッダー
 * 2. **Inspector と同じ "スケジュールカード"** (`bg-muted rounded-2xl`) 内に
 *    - 日付行 (`DateRow`)
 *    - 予定行 (`TimeRow` = 開始 → 終了)
 * 3. キャンセル / 作成 ボタン
 *
 * Inspector (EntryInspectorForm) のスケジュールカードと同じ container 構造・
 * 色味・間隔を使うことで、視覚的一貫性を確保する。
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
  const t = useTranslations();

  return (
    // 親 row の onClick (onOpenPopover) が portal から bubble してきた click で再発火し
    // popover の close と競合するため、form 内の click は止める。
    <div
      className={cn('px-4 pt-2 pb-4 md:px-6 md:pt-4 md:pb-6', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Row 0: タグ名ヘッダー（Inspector の TagRow 相当） + 右端に close × */}
      <div className="flex min-h-9 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TagIcon icon={tag.icon} color={tag.color} size="sm" />
          <span className="truncate text-base font-medium">{tag.name}</span>
        </div>
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('common.actions.close')}
          className="text-muted-foreground hover:text-foreground hover:bg-state-hover -mr-2 flex size-10 items-center justify-center rounded-lg transition-colors"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* スケジュールカード (Inspector と同じ bg-muted rounded-2xl) */}
      <div className="bg-muted mt-2 rounded-2xl">
        <div className="flex flex-col gap-2 px-4 pt-2 pb-4">
          <DateRow
            label={t('entry.inspector.time.date')}
            icon={Calendar}
            selectedDate={selectedDate}
            onDateChange={(d) => {
              if (d) onDateSelect(d);
            }}
          />
          <TimeRow
            label={t('entry.inspector.time.planned')}
            icon={Clock}
            startTime={startTime}
            endTime={endTime}
            onStartChange={onStartTimeChange}
            onEndChange={onEndTimeChange}
            hasError={hasError}
            testId="tag-entry-create-planned-time"
          />
        </div>
      </div>

      {/* 時間重複アラート（Inspector と同じパターン） */}
      <div
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- grid expand/collapse animation
        className={`grid transition-[grid-template-rows] duration-200 ${hasError ? 'grid-rows-expanded mt-2' : 'grid-rows-collapsed'}`}
        aria-hidden={!hasError}
      >
        <div className="overflow-hidden">
          <TimeConflictAlert message={t('entry.errors.timeOverlap')} />
        </div>
      </div>

      {/* アクション（キャンセル / 作成） */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={isSubmitting}>
          {t('common.actions.cancel')}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={isSubmitting || !startTime || !endTime || hasError}
        >
          {t('common.actions.create')}
        </Button>
      </div>
    </div>
  );
}

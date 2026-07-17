'use client';

import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { DateTimeSection, TagRow, TimeConflictAlert } from '@/features/timeblock';
import { Button, cn } from '@dayopt/components';

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
  onTagChange: (tagId: string | null) => void;
  onCreateAndSelect: (
    name: string,
    color?: string | null,
    icon?: string | null,
    parentId?: string | null,
  ) => Promise<void> | void;
  surface?: 'card' | 'sheet';
  className?: string;
}

/**
 * タグエントリ作成フォーム body。
 *
 * レイアウト:
 * 1. タグアイコン + 名前ヘッダー
 * 2. 日付行 (`DateRow`) と予定行 (`TimeRow` = 開始 → 終了)
 * 3. キャンセル / 作成 ボタン
 *
 * PC popover では Inspector と同じカード面、mobile sheet では sheet の地色を使う。
 */
export function TagTimeblockCreateForm({
  tag,
  selectedDate,
  onDateSelect,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
  onSubmit,
  onCancel,
  onTagChange,
  onCreateAndSelect,
  isSubmitting = false,
  hasError = false,
  surface = 'card',
  className,
}: TagEntryCreateFormProps) {
  const t = useTranslations();
  const tEditor = useTranslations('timeblock.editor');
  const scheduleClassName = surface === 'sheet' ? 'mt-2' : 'bg-muted mt-2 rounded-2xl';
  const scheduleBodyClassName =
    surface === 'sheet' ? 'flex flex-col gap-2' : 'flex flex-col gap-2 px-4 pt-2 pb-4';

  return (
    // 親 row の onClick (onOpenPopover) が portal から bubble してきた click で再発火し
    // popover の close と競合するため、form 内の click は止める。
    <div
      className={cn('px-4 pt-2 pb-4 md:px-6 md:pt-4 md:pb-6', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Row 0: 詳細と同様に TagRow を使ってタグを切り替え可能にする */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <TagRow
          tagId={tag.id}
          tagName={tag.name}
          tagIcon={tag.icon}
          tagColor={tag.color}
          onTagChange={onTagChange}
          onCreateAndSelect={onCreateAndSelect}
        />
        <button
          type="button"
          onClick={onCancel}
          aria-label={t('common.actions.close')}
          className={cn(
            'text-muted-foreground hover:text-foreground hover:bg-state-hover -mr-2 flex items-center justify-center rounded-lg transition-colors',
            surface === 'sheet' ? 'size-11' : 'size-10',
          )}
        >
          <X className="size-5" />
        </button>
      </div>

      {/* スケジュール */}
      <div className={scheduleClassName}>
        <div className={scheduleBodyClassName}>
          <DateTimeSection
            dateLabel={tEditor('date')}
            timeLabel={tEditor('time')}
            selectedDate={selectedDate}
            onDateSelect={onDateSelect}
            startTime={startTime}
            onStartChange={onStartTimeChange}
            endTime={endTime}
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
          <TimeConflictAlert message={t('timeblock.errors.timeOverlap')} />
        </div>
      </div>

      {/* アクション（キャンセル / 作成） */}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size={surface === 'sheet' ? 'lg' : 'sm'}
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {t('common.actions.cancel')}
        </Button>
        <Button
          type="button"
          size={surface === 'sheet' ? 'lg' : 'sm'}
          onClick={onSubmit}
          disabled={isSubmitting || !startTime || !endTime || hasError}
        >
          {t('common.actions.create')}
        </Button>
      </div>
    </div>
  );
}

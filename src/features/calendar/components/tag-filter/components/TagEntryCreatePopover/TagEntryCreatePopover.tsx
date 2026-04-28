'use client';

import { useCallback, useState } from 'react';

import { isSameDay, startOfDay } from 'date-fns';
import { useTranslations } from 'next-intl';

import { useEntryMutations } from '@/features/entry';
import { Drawer, DrawerContent, DrawerTitle } from '@/lib/components/ui/drawer';
import { Popover, PopoverAnchor, PopoverContent } from '@/lib/components/ui/popover';
import { toast } from '@/lib/toast';

import { TagEntryCreateForm, type TagEntryCreateFormProps } from './TagEntryCreateForm';

export interface TagEntryCreatePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagEntryCreateFormProps['tag'];
  /** 既定の duration（分）。end time の初期値 = start + this */
  defaultDurationMinutes: number;
  /** モバイル時は bottom sheet (vaul Drawer)、PC 時は Popover。指定なしは PC 扱い */
  isMobile?: boolean;
}

/** Date を HH:MM 文字列に */
function toHHMM(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** 選択日 + HH:MM → Date */
function combineDateAndHHMM(date: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const next = startOfDay(date);
  next.setHours(h ?? 0, m ?? 0, 0, 0);
  return next;
}

/** 開始時刻 HH:MM に分を足して HH:MM を返す（24h 折り返しなし。範囲外なら 23:59 に丸め） */
function addMinutesToHHMM(hhmm: string, minutesToAdd: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + minutesToAdd;
  const clamped = Math.min(Math.max(total, 0), 23 * 60 + 59);
  const nh = Math.floor(clamped / 60);
  const nm = clamped % 60;
  return `${String(nh).padStart(2, '0')}:${String(nm).padStart(2, '0')}`;
}

/** 開始時刻の default: today なら現在時刻を次の 15 分境界に ceil、それ以外は 09:00 */
function defaultStartHHMM(forDate: Date): string {
  const now = new Date();
  if (isSameDay(forDate, now)) {
    const FIFTEEN_MIN_MS = 15 * 60 * 1000;
    const ceiled = new Date(Math.ceil(now.getTime() / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS);
    return toHHMM(ceiled);
  }
  return '09:00';
}

/**
 * sidebar タグ行クリック → エントリ作成ポップアップ。
 *
 * Inspector 流用のミニマル構成:
 *   [icon] タグ名
 *   📅 日付    04/22/2026
 *   🕐 予定    07:15 → 08:45
 *              [キャンセル] [作成]
 *
 * - 日付行 `DateRow`: 既存 DatePickerPopover を内包（Inspector と同じ UX）
 * - 予定行 `TimeRow`: 開始 → 終了 の 2 TimeInput（1 分粒度）、duration は自動算出
 * - 既定 end = 既定 start + `defaultDurationMinutes`
 * - 作成成功で popover close + 5s undo トースト、失敗時は popover 維持
 */
export function TagEntryCreatePopover({
  open,
  onOpenChange,
  tag,
  defaultDurationMinutes,
  isMobile,
}: TagEntryCreatePopoverProps) {
  const t = useTranslations();
  const { createEntry, deleteEntry } = useEntryMutations({ suppressCreateToast: true });

  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()));
  const [startTime, setStartTime] = useState<string>(() => defaultStartHHMM(selectedDate));
  const [endTime, setEndTime] = useState<string>(() =>
    addMinutesToHHMM(defaultStartHHMM(selectedDate), defaultDurationMinutes),
  );

  const handleDateSelect = useCallback(
    (next: Date) => {
      const normalized = startOfDay(next);
      setSelectedDate(normalized);
      const nextStart = defaultStartHHMM(normalized);
      setStartTime(nextStart);
      setEndTime(addMinutesToHHMM(nextStart, defaultDurationMinutes));
    },
    [defaultDurationMinutes],
  );

  const handleStartChange = useCallback(
    (nextStart: string) => {
      setStartTime(nextStart);
      // 開始を変えたら、既存 duration を維持する形で終了も追従
      const [sh, sm] = nextStart.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const startMin = (sh ?? 0) * 60 + (sm ?? 0);
      const endMin = (eh ?? 0) * 60 + (em ?? 0);
      if (endMin <= startMin) {
        // 終了が開始より早い/同じになったら default duration で付け直し
        setEndTime(addMinutesToHHMM(nextStart, defaultDurationMinutes));
      }
    },
    [endTime, defaultDurationMinutes],
  );

  const handleSubmit = useCallback(() => {
    const startDate = combineDateAndHHMM(selectedDate, startTime);
    const endDate = combineDateAndHHMM(selectedDate, endTime);

    createEntry.mutate(
      {
        title: tag.name,
        tagId: tag.id,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
      },
      {
        onSuccess: (newEntry) => {
          const displayTitle = tag.name;
          if (newEntry?.id) {
            toast.success(t('entry.toast.created', { title: displayTitle }), {
              duration: 5000,
              action: {
                label: t('common.undo'),
                onClick: () => deleteEntry.mutate({ id: newEntry.id }),
              },
            });
          } else {
            toast.success(t('entry.toast.created', { title: displayTitle }));
          }
          onOpenChange(false);
        },
        // onError: useEntryMutations 側でエラートースト + 楽観的更新ロールバック。
        // popover は閉じない（意図的）。time overlap 時はユーザーが時刻を調整して再試行できる。
      },
    );
  }, [
    createEntry,
    deleteEntry,
    endTime,
    onOpenChange,
    selectedDate,
    startTime,
    t,
    tag.id,
    tag.name,
  ]);

  const formNode = (
    <TagEntryCreateForm
      tag={tag}
      selectedDate={selectedDate}
      onDateSelect={handleDateSelect}
      startTime={startTime}
      onStartTimeChange={handleStartChange}
      endTime={endTime}
      onEndTimeChange={setEndTime}
      onSubmit={handleSubmit}
      onCancel={() => onOpenChange(false)}
      isSubmitting={createEntry.isPending}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange} handleOnly repositionInputs={false}>
        <DrawerContent className="bg-card z-modal shadow-card flex flex-col gap-0 overflow-hidden rounded-t-2xl p-0">
          <DrawerTitle className="sr-only">{tag.name}</DrawerTitle>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-lg">{formNode}</div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor aria-hidden className="pointer-events-none absolute inset-0" />
      <PopoverContent
        side="right"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="w-80 p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
        }}
      >
        {formNode}
      </PopoverContent>
    </Popover>
  );
}

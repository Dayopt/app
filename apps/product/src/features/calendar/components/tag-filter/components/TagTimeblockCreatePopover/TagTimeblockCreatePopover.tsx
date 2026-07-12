'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { isSameDay, startOfDay } from 'date-fns';
import { useTranslations } from 'next-intl';

import {
  collectTimeModelLaneItems,
  hasTimeModelLaneConflict,
} from '@/features/calendar/lib/overlap';
import { resolveTimeblockDestination, useTimeblockWriteMutations } from '@/features/timeblock';
import { toast } from '@/lib/toast';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@dayopt/components';

import { useTagDraftStore } from '../../../../stores/useTagDraftStore';
import { TagTimeblockCreateForm, type TagEntryCreateFormProps } from './TagTimeblockCreateForm';

/** 開始時刻の default: today なら現在時刻を次の 15 分境界に ceil、それ以外は 09:00 */
function defaultStartHHMM(forDate: Date): string {
  const now = new Date();
  if (isSameDay(forDate, now)) {
    const FIFTEEN_MIN_MS = 15 * 60 * 1000;
    const ceiled = new Date(Math.ceil(now.getTime() / FIFTEEN_MIN_MS) * FIFTEEN_MIN_MS);
    const h = String(ceiled.getHours()).padStart(2, '0');
    const m = String(ceiled.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return '09:00';
}

interface TagEntryCreatePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagEntryCreateFormProps['tag'];
  /** モバイル時は bottom sheet (vaul Drawer)、PC 時は Popover。指定なしは PC 扱い */
  isMobile?: boolean;
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

const FALLBACK_DURATION_MINUTES = 60;

/**
 * sidebar タグ行クリック → エントリ作成ポップアップ。
 *
 * state は {@link useTagDraftStore} に持つため、calendar 上の draft block の resize と
 * popover の time input の双方が同じ store を経由して相互反映する。
 *
 * - tap 時に TagFlatList 側が `openDraft({ tag, date, startTime, endTime })` を call
 * - popover はその draft を read/write
 * - 作成成功で `closeDraft()` + 5s undo トースト、失敗時は popover 維持
 */
export function TagTimeblockCreatePopover({
  open,
  onOpenChange,
  tag,
  isMobile,
}: TagEntryCreatePopoverProps) {
  const t = useTranslations();
  const { createRecord, createPlan, deleteRecord, deletePlan } = useTimeblockWriteMutations();
  const queryClient = useQueryClient();

  const draft = useTagDraftStore((s) => s.draft);
  const openDraft = useTagDraftStore((s) => s.openDraft);
  const updateTimes = useTagDraftStore((s) => s.updateTimes);
  const closeDraft = useTagDraftStore((s) => s.closeDraft);

  const isThisTag = draft?.tag.id === tag.id;
  const selectedDate = isThisTag ? draft.date : startOfDay(new Date());
  const startTime = isThisTag ? draft.startTime : '09:00';
  const endTime = isThisTag ? draft.endTime : '10:00';

  // open=true & store に対応する draft が無いとき seed する（tap 時に TagFlatList 側で
  // call する代替。row 側の handler を変更しなくて済む）
  useEffect(() => {
    if (!open) return;
    if (draft?.tag.id === tag.id) return;
    const date = startOfDay(new Date());
    const seedStart = defaultStartHHMM(date);
    openDraft({
      tag,
      date,
      startTime: seedStart,
      endTime: addMinutesToHHMM(seedStart, FALLBACK_DURATION_MINUTES),
    });
  }, [open, draft?.tag.id, tag, openDraft]);

  const handleDateSelect = useCallback(
    (next: Date) => {
      const normalized = startOfDay(next);
      updateTimes({ date: normalized });
    },
    [updateTimes],
  );

  const handleStartChange = useCallback(
    (nextStart: string) => {
      const [sh, sm] = nextStart.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const startMin = (sh ?? 0) * 60 + (sm ?? 0);
      const endMin = (eh ?? 0) * 60 + (em ?? 0);
      if (endMin <= startMin) {
        // 終了が開始より早い/同じになったら default duration で付け直し
        updateTimes({
          startTime: nextStart,
          endTime: addMinutesToHHMM(nextStart, FALLBACK_DURATION_MINUTES),
        });
      } else {
        updateTimes({ startTime: nextStart });
      }
    },
    [endTime, updateTimes],
  );

  const handleEndChange = useCallback(
    (nextEnd: string) => {
      updateTimes({ endTime: nextEnd });
    },
    [updateTimes],
  );

  const handleClose = useCallback(() => {
    onOpenChange(false);
    closeDraft();
  }, [closeDraft, onOpenChange]);

  // クライアント側で時間重複を判定（drag / Inspector と同じ規範）。
  // 重複時は inline alert + submit disabled で hard-block し、mutation を発火させない。
  // 同一レーンのみ判定（plan×plan / log×log）。plan×log は許可。
  const hasConflict = useMemo(() => {
    if (!startTime || !endTime) return false;
    const startDate = combineDateAndHHMM(selectedDate, startTime);
    const endDate = combineDateAndHHMM(selectedDate, endTime);
    if (endDate.getTime() <= startDate.getTime()) return false;

    const destination = resolveTimeblockDestination(endDate);
    const laneItems = collectTimeModelLaneItems(
      queryClient,
      destination === 'plan' ? 'plans' : 'records',
    );
    return hasTimeModelLaneConflict(laneItems, startDate, endDate);
  }, [queryClient, selectedDate, startTime, endTime]);

  const handleSubmit = useCallback(() => {
    if (hasConflict) return; // defensive: button is already disabled

    const startDate = combineDateAndHHMM(selectedDate, startTime);
    const endDate = combineDateAndHHMM(selectedDate, endTime);
    const destination = resolveTimeblockDestination(endDate);
    const displayTitle = tag.name;
    const input = {
      title: tag.name,
      tagId: tag.id,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
    };
    const onSuccess = (created: { id: string } | undefined) => {
      if (created?.id) {
        const deletePayload = { id: created.id };
        toast.success(t('timeblock.toast.created', { title: displayTitle }), {
          duration: 5000,
          action: {
            label: t('common.undo'),
            onClick: () =>
              destination === 'plan'
                ? deletePlan.mutate(deletePayload)
                : deleteRecord.mutate(deletePayload),
          },
        });
      } else {
        toast.success(t('timeblock.toast.created', { title: displayTitle }));
      }
      handleClose();
    };

    // onError: useTimeblockWriteMutations 側でエラートースト + 楽観的更新ロールバック。
    // popover は閉じない（意図的）。time overlap 時はユーザーが時刻を調整して再試行できる。
    if (destination === 'plan') {
      createPlan.mutate(input, { onSuccess });
    } else {
      createRecord.mutate(input, { onSuccess });
    }
  }, [
    createRecord,
    createPlan,
    deleteRecord,
    deletePlan,
    endTime,
    handleClose,
    hasConflict,
    selectedDate,
    startTime,
    t,
    tag.id,
    tag.name,
  ]);

  const formNode = (
    <TagTimeblockCreateForm
      tag={tag}
      selectedDate={selectedDate}
      onDateSelect={handleDateSelect}
      startTime={startTime}
      onStartTimeChange={handleStartChange}
      endTime={endTime}
      onEndTimeChange={handleEndChange}
      onSubmit={handleSubmit}
      onCancel={handleClose}
      isSubmitting={createPlan.isPending || createRecord.isPending}
      hasError={hasConflict}
      surface={isMobile ? 'sheet' : 'card'}
    />
  );

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onOpenChange={(next) => {
          if (!next) handleClose();
        }}
        handleOnly
        repositionInputs={false}
      >
        <DrawerContent className="flex flex-col gap-0 overflow-hidden p-0">
          <DrawerTitle className="sr-only">{tag.name}</DrawerTitle>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-lg">{formNode}</div>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
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

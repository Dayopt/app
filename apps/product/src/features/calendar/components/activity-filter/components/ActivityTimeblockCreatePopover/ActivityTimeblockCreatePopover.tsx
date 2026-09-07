'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { isSameDay, startOfDay } from 'date-fns';
import { useTranslations } from 'next-intl';

import { resolveCategoryColor, useActivitiesMap, useCreateActivity } from '@/features/activities';
import {
  collectTimeblockLaneItems,
  hasTimeblockLaneConflict,
  resolveTimeblockKindChoice,
  useTimeblockWriteMutations,
} from '@/features/timeblock';
import { toast } from '@/lib/toast';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@dayopt/components';

import { useActivityDraftStore } from '../../../../stores/useActivityDraftStore';
import {
  ActivityTimeblockCreateForm,
  type ActivityEntryCreateFormProps,
} from './ActivityTimeblockCreateForm';

/** 開始時刻の default: today なら現在時刻を次の 1 分境界に ceil、それ以外は 09:00 */
function defaultStartHHMM(forDate: Date): string {
  const now = new Date();
  if (isSameDay(forDate, now)) {
    const ONE_MIN_MS = 60 * 1000;
    const ceiled = new Date(Math.ceil(now.getTime() / ONE_MIN_MS) * ONE_MIN_MS);
    const h = String(ceiled.getHours()).padStart(2, '0');
    const m = String(ceiled.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return '09:00';
}

interface ActivityEntryCreatePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activity: ActivityEntryCreateFormProps['activity'];
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
 * sidebar アクティビティ行クリック → エントリ作成ポップアップ。
 *
 * state は {@link useActivityDraftStore} に持つため、calendar 上の draft block の resize と
 * popover の time input の双方が同じ store を経由して相互反映する。
 *
 * - tap 時に呼び出し側が `openDraft({ activity, date, startTime, endTime })` を call
 * - popover はその draft を read/write
 * - 作成成功で `closeDraft()` + 5s undo トースト、失敗時は popover 維持
 */
export function ActivityTimeblockCreatePopover({
  open,
  onOpenChange,
  activity,
  isMobile,
}: ActivityEntryCreatePopoverProps) {
  const t = useTranslations();
  const { createRecord, createPlan, deleteRecord, deletePlan } = useTimeblockWriteMutations();
  const queryClient = useQueryClient();
  const createActivityMutation = useCreateActivity({ showToast: false });
  const { getActivityById } = useActivitiesMap();

  const draft = useActivityDraftStore((s) => s.draft);
  const openDraft = useActivityDraftStore((s) => s.openDraft);
  const updateTimes = useActivityDraftStore((s) => s.updateTimes);
  const updateActivity = useActivityDraftStore((s) => s.updateActivity);
  const updateKind = useActivityDraftStore((s) => s.updateKind);
  const closeDraft = useActivityDraftStore((s) => s.closeDraft);

  const currentActivity = draft?.activity ?? activity;
  const selectedDate = draft ? draft.date : startOfDay(new Date());
  const startTime = draft ? draft.startTime : '09:00';
  const endTime = draft ? draft.endTime : '10:00';
  const requestedKind = draft?.kind;

  // 既定は end_at 判定。過去スロットだけタブで Plan / Record を選び直せる。
  const { kind: destination, canRecord } = resolveTimeblockKindChoice(
    combineDateAndHHMM(selectedDate, endTime),
    requestedKind,
  );

  // open=true & store に対応する draft が無いとき seed する（tap 時に呼び出し側で
  // call する代替。row 側の handler を変更しなくて済む）
  useEffect(() => {
    if (!open) return;
    if (draft) return;
    const date = startOfDay(new Date());
    const seedStart = defaultStartHHMM(date);
    openDraft({
      activity,
      date,
      startTime: seedStart,
      endTime: addMinutesToHHMM(seedStart, FALLBACK_DURATION_MINUTES),
    });
  }, [open, draft, activity, openDraft]);

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

  const handleActivityChange = useCallback(
    (nextActivityId: string | null) => {
      if (!nextActivityId) return;
      const nextActivity = getActivityById(nextActivityId);
      if (!nextActivity) return;

      updateActivity({
        id: nextActivity.id,
        name: nextActivity.name,
        // 色・アイコンは所属カテゴリーからの継承値。未分類なら null のまま持つ
        color: nextActivity.color === null ? null : resolveCategoryColor(nextActivity.color),
        icon: nextActivity.icon,
      });
    },
    [getActivityById, updateActivity],
  );

  const handleCreateAndSelectActivity = useCallback(
    async (
      name: string,
      _color?: string | null,
      _icon?: string | null,
      categoryId?: string | null,
    ) => {
      try {
        // 色・アイコンはカテゴリーだけが持つ（#2162 §4-6）。作成時に受け取っても
        // アクティビティ側には保存せず、所属カテゴリーの指定だけを渡す。
        const created = await createActivityMutation.mutateAsync({
          name,
          categoryId: categoryId ?? undefined,
        });
        handleActivityChange(created.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('duplicate') || message.includes('already exists')) {
          toast.error(t('activities.activity.duplicateName'));
        } else {
          toast.error(t('activities.activity.createFailed'));
        }
      }
    },
    [createActivityMutation, handleActivityChange, t],
  );

  // クライアント側で時間重複を判定（drag / Inspector と同じ規範）。
  // 重複時は inline alert + submit disabled で hard-block し、mutation を発火させない。
  // 同一レーンのみ判定（plan×plan / record×record）。plan×record は許可。
  const hasConflict = useMemo(() => {
    if (!startTime || !endTime) return false;
    const startDate = combineDateAndHHMM(selectedDate, startTime);
    const endDate = combineDateAndHHMM(selectedDate, endTime);
    if (endDate.getTime() <= startDate.getTime()) return false;

    const laneItems = collectTimeblockLaneItems(
      queryClient,
      destination === 'plan' ? 'plans' : 'records',
    );
    return hasTimeblockLaneConflict(laneItems, startDate, endDate);
  }, [queryClient, selectedDate, startTime, endTime, destination]);

  const handleSubmit = useCallback(() => {
    if (hasConflict) return; // defensive: button is already disabled

    const startDate = combineDateAndHHMM(selectedDate, startTime);
    const endDate = combineDateAndHHMM(selectedDate, endTime);
    const displayTitle = currentActivity.name;
    const input = {
      title: currentActivity.name,
      activityId: currentActivity.id,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
    };
    const onSuccess = (created: { id: string; updated_at: string } | undefined) => {
      if (created?.id) {
        const deletePayload = { id: created.id, expectedUpdatedAt: created.updated_at };
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
    destination,
    endTime,
    handleClose,
    hasConflict,
    selectedDate,
    startTime,
    t,
    currentActivity.id,
    currentActivity.name,
  ]);

  const formNode = (
    <ActivityTimeblockCreateForm
      activity={currentActivity}
      onActivityChange={handleActivityChange}
      onCreateAndSelect={handleCreateAndSelectActivity}
      kind={destination}
      canRecord={canRecord}
      onKindChange={updateKind}
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
          <DrawerTitle className="sr-only">{currentActivity.name}</DrawerTitle>
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

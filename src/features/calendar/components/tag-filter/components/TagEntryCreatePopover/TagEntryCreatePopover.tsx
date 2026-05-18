'use client';

import { useCallback, useEffect, useMemo } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { isSameDay, startOfDay } from 'date-fns';
import { useTranslations } from 'next-intl';

import { useEntryMutations } from '@/features/entry';
import { Drawer, DrawerContent, DrawerTitle } from '@/lib/components/ui/drawer';
import { Popover, PopoverAnchor, PopoverContent } from '@/lib/components/ui/popover';
import { hasTwoLayerTimeConflict } from '@/lib/time/two-layer-overlap';
import { toast } from '@/lib/toast';

import { useTagDraftStore } from '../../../../stores/useTagDraftStore';
import { TagEntryCreateForm, type TagEntryCreateFormProps } from './TagEntryCreateForm';

/** entries.list の cached query を判定する predicate（tRPC v11 key 形式） */
function isEntriesListQuery(query: { queryKey: unknown }): boolean {
  const key = query.queryKey;
  return (
    Array.isArray(key) &&
    key.length >= 1 &&
    Array.isArray(key[0]) &&
    key[0][0] === 'entries' &&
    key[0][1] === 'list'
  );
}

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

export interface TagEntryCreatePopoverProps {
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
export function TagEntryCreatePopover({
  open,
  onOpenChange,
  tag,
  isMobile,
}: TagEntryCreatePopoverProps) {
  const t = useTranslations();
  const { createEntry, deleteEntry } = useEntryMutations({ suppressCreateToast: true });
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

  // past 時間帯は保存時に unplanned になるため、判定も actual として渡す。
  // useMemo の外で計算しないと react-hooks/purity に引っかかる。
  // eslint-disable-next-line react-hooks/purity -- transient form, no observable side effect
  const nowForPastCheck = Date.now();
  const willBeUnplanned = (() => {
    if (!startTime || !endTime) return false;
    const endDate = combineDateAndHHMM(selectedDate, endTime);
    return endDate.getTime() <= nowForPastCheck;
  })();

  // クライアント側で時間重複を判定（drag / Inspector と同じ規範）。
  // 重複時は inline alert + submit disabled で hard-block し、mutation を発火させない。
  const hasConflict = useMemo(() => {
    if (!startTime || !endTime) return false;
    const startDate = combineDateAndHHMM(selectedDate, startTime);
    const endDate = combineDateAndHHMM(selectedDate, endTime);
    if (endDate.getTime() <= startDate.getTime()) return false;

    const cachedLists = queryClient.getQueriesData<
      Array<{
        id: string;
        start_time: string | null;
        end_time: string | null;
        actual_start_time: string | null;
        actual_end_time: string | null;
      }>
    >({ predicate: isEntriesListQuery });

    const seen = new Set<string>();
    const events: Array<{
      id: string;
      plannedStart: string | null;
      plannedEnd: string | null;
      actualStart: string | null;
      actualEnd: string | null;
    }> = [];
    for (const [, data] of cachedLists) {
      if (!data) continue;
      for (const e of data) {
        if (seen.has(e.id)) continue;
        seen.add(e.id);
        events.push({
          id: e.id,
          plannedStart: e.start_time,
          plannedEnd: e.end_time,
          actualStart: e.actual_start_time,
          actualEnd: e.actual_end_time,
        });
      }
    }

    // past は unplanned で planned 範囲なし、future は planned で planned/actual 両方持つ。
    // hasTwoLayerTimeConflict は target.actualStart/End が必須なので future planned 作成でも
    // 同じ範囲を actual に mirror する（server も create 時に actual を planned に mirror する）。
    return hasTwoLayerTimeConflict(events, {
      id: '',
      plannedStart: willBeUnplanned ? null : startDate.toISOString(),
      plannedEnd: willBeUnplanned ? null : endDate.toISOString(),
      actualStart: startDate.toISOString(),
      actualEnd: endDate.toISOString(),
    });
  }, [queryClient, selectedDate, startTime, endTime, willBeUnplanned]);

  const handleSubmit = useCallback(() => {
    if (hasConflict) return; // defensive: button is already disabled

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
          handleClose();
        },
        // onError: useEntryMutations 側でエラートースト + 楽観的更新ロールバック。
        // popover は閉じない（意図的）。time overlap 時はユーザーが時刻を調整して再試行できる。
      },
    );
  }, [
    createEntry,
    deleteEntry,
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
    <TagEntryCreateForm
      tag={tag}
      selectedDate={selectedDate}
      onDateSelect={handleDateSelect}
      startTime={startTime}
      onStartTimeChange={handleStartChange}
      endTime={endTime}
      onEndTimeChange={handleEndChange}
      onSubmit={handleSubmit}
      onCancel={handleClose}
      isSubmitting={createEntry.isPending}
      hasError={hasConflict}
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
        modal={false}
      >
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

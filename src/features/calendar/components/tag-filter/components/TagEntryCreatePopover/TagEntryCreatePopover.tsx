'use client';

import { useCallback, useMemo } from 'react';

import { useTranslations } from 'next-intl';

import { useEntryMutations } from '@/features/entry';
import { Drawer, DrawerContent } from '@/lib/components/ui/drawer';
import { Popover, PopoverAnchor, PopoverContent } from '@/lib/components/ui/popover';
import { toast } from '@/lib/toast';
import { trpc } from '@/lib/trpc/client';

import { computeDurationDistribution } from './computeDurationDistribution';
import {
  computeStartTimeCandidates,
  formatTimeLabel,
  type EntryRange,
} from './computeStartTimeCandidates';
import {
  TagEntryCreateForm,
  type TagEntryCreateFormProps,
  type TagEntryCreateSubmit,
} from './TagEntryCreateForm';
import type { TimeChip } from './TimeChipRow';

export interface TagEntryCreatePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tag: TagEntryCreateFormProps['tag'];
  defaultDurationMinutes: number;
  onCustomTimeClick?: (() => void) | undefined;
  /** モバイル時は bottom sheet (vaul Drawer)、PC 時は Popover。指定なしは PC 扱い */
  isMobile?: boolean;
}

/** 今日の 00:00 と翌日 00:00 の ISO 文字列（local time 基準） */
function getTodayBounds(now: Date): { startISO: string; endISO: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/**
 * sidebar タグ行クリック → エントリ作成ポップアップ。
 *
 * - **PC**: Radix Popover（`side="right" align="start"`）。親を `position: relative` にし、
 *   `<PopoverAnchor>` が inset-0 で親を埋めて Radix が親の bounding box に対して配置する。
 * - **モバイル**: vaul Drawer（画面下から bottom sheet）。安全領域を `pb-[env(safe-area-inset-bottom)]` で確保。
 *
 * Popover 自体は controlled（open/onOpenChange）。dnd-kit の listeners と競合しない。
 *
 * データ:
 * - 分布データは open 時のみ `trpc.tags.durationDistribution` を fetch
 * - 開始時刻チップは open 時に `trpc.entries.list`（今日分）を fetch して動的算出
 *
 * エントリ作成:
 * - 「作成」押下で `useEntryMutations.createEntry` を発火（楽観的更新は既存 hook に委譲）
 * - `suppressCreateToast: true` で既定の「編集詳細」トーストを抑止、代わりに undo トーストを表示
 * - undo (5 秒) → `deleteEntry` で soft delete
 * - 成功時に `tags.durationDistribution` を invalidate（次回 open で新エントリが分布に反映）
 */
export function TagEntryCreatePopover({
  open,
  onOpenChange,
  tag,
  defaultDurationMinutes,
  onCustomTimeClick,
  isMobile,
}: TagEntryCreatePopoverProps) {
  const t = useTranslations();
  const utils = trpc.useUtils();
  const { createEntry, deleteEntry } = useEntryMutations({ suppressCreateToast: true });

  // 分布データ
  const {
    data: distributionData,
    isLoading,
    isError,
  } = trpc.tags.durationDistribution.useQuery(
    { tagId: tag.id },
    { enabled: open, staleTime: 60_000 },
  );

  const distribution = useMemo(() => {
    const samples = distributionData?.samples ?? [];
    return computeDurationDistribution(samples);
  }, [distributionData]);

  // 今日のエントリ一覧（chip 算出用）
  const todayBoundsRef = useMemo(() => getTodayBounds(new Date()), []);
  const { data: entriesData } = trpc.entries.list.useQuery(
    {
      startDate: todayBoundsRef.startISO,
      endDate: todayBoundsRef.endISO,
      limit: 100,
    },
    { enabled: open, staleTime: 30_000 },
  );

  // startKey → Date をまとめて持つ。onSubmit 時に startKey から実時刻に変換する
  const { timeChips, defaultStartKey, candidatesByKey } = useMemo(() => {
    const now = new Date();
    const ranges: EntryRange[] = (entriesData ?? [])
      .filter(
        (e): e is typeof e & { start_time: string; end_time: string } =>
          Boolean(e.start_time) && Boolean(e.end_time),
      )
      .map((e) => ({ start: new Date(e.start_time), end: new Date(e.end_time) }));

    const candidates = computeStartTimeCandidates(now, ranges);

    const chips: TimeChip[] = [];
    const map: Record<string, Date | null> = {
      now: candidates.now,
      slot30: candidates.slot30,
      nextFree: candidates.nextFree,
    };
    if (candidates.now) chips.push({ key: 'now', label: '今' });
    if (candidates.slot30) chips.push({ key: 'slot30', label: formatTimeLabel(candidates.slot30) });
    if (candidates.nextFree) {
      chips.push({ key: 'nextFree', label: formatTimeLabel(candidates.nextFree) });
    }

    return {
      timeChips: chips,
      defaultStartKey: chips[0]?.key ?? '',
      candidatesByKey: map,
    };
  }, [entriesData]);

  const handleSubmit = useCallback(
    (payload: TagEntryCreateSubmit) => {
      const startDate = candidatesByKey[payload.startKey];
      if (!startDate) {
        // 候補が null のキーは UI 上表示されないので通常は到達しない。安全弁
        return;
      }
      const endDate = new Date(startDate.getTime() + payload.durationMinutes * 60 * 1000);

      createEntry.mutate(
        {
          title: tag.name,
          tagId: tag.id,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        },
        {
          onSuccess: (newEntry) => {
            // 新エントリ id を使った undo トースト。サーバー応答が壊れていて id が取れない
            // 場合は undo action を付けずに通常トーストに fallback する。
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
            // 分布キャッシュを invalidate → 次回 open 時に新エントリが candidates に反映
            void utils.tags.durationDistribution.invalidate({ tagId: tag.id });
          },
          // onError: useEntryMutations 側がエラートースト表示 + 楽観的更新ロールバックまで完了。
          // ここでは popover を閉じない（意図的）。時間重複等で失敗した場合、ユーザーは
          // 同じ popover 上で slider / chip を調整して再試行できる。form の state は
          // popover が mount されたままなので保持される。
        },
      );
    },
    [candidatesByKey, createEntry, deleteEntry, onOpenChange, t, tag.id, tag.name, utils],
  );

  const formNode = (
    <TagEntryCreateForm
      tag={tag}
      distribution={distribution}
      timeChips={timeChips}
      defaultStartKey={defaultStartKey}
      defaultDurationMinutes={defaultDurationMinutes}
      onSubmit={handleSubmit}
      onCancel={() => onOpenChange(false)}
      onCustomTimeClick={onCustomTimeClick}
      isLoading={isLoading}
      isError={isError}
      isSubmitting={createEntry.isPending}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- env() safe-area */}
        <DrawerContent className="px-4 pt-2 pb-[env(safe-area-inset-bottom)]">
          {formNode}
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
        className="w-80"
        onOpenAutoFocus={(e) => {
          // ヘッダーに focus が吸い込まれると時刻チップから始まらずぎこちない。
          // 最初のインタラクティブ要素にフォーカスが行くまで譲る。
          e.preventDefault();
        }}
      >
        {formNode}
      </PopoverContent>
    </Popover>
  );
}

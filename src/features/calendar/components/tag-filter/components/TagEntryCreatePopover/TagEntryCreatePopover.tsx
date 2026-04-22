'use client';

import { useMemo } from 'react';

import { Drawer, DrawerContent } from '@/lib/components/ui/drawer';
import { Popover, PopoverAnchor, PopoverContent } from '@/lib/components/ui/popover';
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
  onSubmit: (payload: TagEntryCreateSubmit) => void;
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
 * useIsMobile はここでは呼ばず、caller が isMobile を明示的に渡す（テスト容易性重視）。
 *
 * - 分布データは open 時のみ `trpc.tags.durationDistribution` を fetch
 * - 開始時刻チップは open 時に `trpc.entries.list`（今日分）を fetch して動的算出
 * - どちらも staleTime で軽くキャッシュ、作成時に invalidate は (g) で実装
 */
export function TagEntryCreatePopover({
  open,
  onOpenChange,
  tag,
  defaultDurationMinutes,
  onSubmit,
  onCustomTimeClick,
  isMobile,
}: TagEntryCreatePopoverProps) {
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

  // 今日のエントリ一覧（chip 算出用）。open 時のみ fetch。
  // open 中に now が経過しても再計算は open-to-open 単位でよい（UX として許容）。
  const todayBoundsRef = useMemo(() => getTodayBounds(new Date()), []);
  const { data: entriesData } = trpc.entries.list.useQuery(
    {
      startDate: todayBoundsRef.startISO,
      endDate: todayBoundsRef.endISO,
      limit: 100,
    },
    { enabled: open, staleTime: 30_000 },
  );

  // 開始時刻チップ: 動的算出（3 項目のうち null でないものだけ chip 化）
  const { timeChips, defaultStartKey } = useMemo(() => {
    const now = new Date();
    const ranges: EntryRange[] = (entriesData ?? [])
      .filter(
        (e): e is typeof e & { start_time: string; end_time: string } =>
          Boolean(e.start_time) && Boolean(e.end_time),
      )
      .map((e) => ({ start: new Date(e.start_time), end: new Date(e.end_time) }));

    const candidates = computeStartTimeCandidates(now, ranges);

    const chips: TimeChip[] = [];
    if (candidates.now) chips.push({ key: 'now', label: '今' });
    if (candidates.slot30) chips.push({ key: 'slot30', label: formatTimeLabel(candidates.slot30) });
    if (candidates.nextFree) {
      chips.push({ key: 'nextFree', label: formatTimeLabel(candidates.nextFree) });
    }

    // default 選択: 利用可能な順に now > slot30 > nextFree。全部 null なら空文字（カスタム前提）
    const defaultKey = chips[0]?.key ?? '';
    return { timeChips: chips, defaultStartKey: defaultKey };
  }, [entriesData]);

  const formNode = (
    <TagEntryCreateForm
      tag={tag}
      distribution={distribution}
      timeChips={timeChips}
      defaultStartKey={defaultStartKey}
      defaultDurationMinutes={defaultDurationMinutes}
      onSubmit={onSubmit}
      onCancel={() => onOpenChange(false)}
      onCustomTimeClick={onCustomTimeClick}
      isLoading={isLoading}
      isError={isError}
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

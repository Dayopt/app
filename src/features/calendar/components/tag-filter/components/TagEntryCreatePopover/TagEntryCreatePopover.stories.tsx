import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';

import type { DurationSample } from './computeDurationDistribution';
import { TagEntryCreatePopover } from './TagEntryCreatePopover';

/** 分ごとの duration から mock raw サンプルを生成 */
function makeSamples(durations: number[]): DurationSample[] {
  return durations.map((durationMinutes, i) => ({
    entryId: `mock-${i}`,
    durationMinutes,
    startedAt: new Date(Date.UTC(2026, 3, (i % 28) + 1, 10, 0)).toISOString(),
  }));
}

const MOCK_TAG = {
  id: 'tag-deep-work',
  name: '仕事:Deep Work',
  color: 'blue',
};

/**
 * trpcMocks で配線する最小セット:
 * - `tags.durationDistribution`: duration 分布の raw サンプル
 * - `entries.list`: 今日のエントリ（空配列）→ 開始時刻チップは「今」のみ表示
 *
 * Story 側で `entries.list` に実データを詰めれば、blocking entry / chained entry のケースも再現可能。
 */
function mockTrpc(samples: DurationSample[], entries: unknown[] = []) {
  return {
    'tags.durationDistribution': { samples },
    'entries.list': entries,
  };
}

/**
 * sidebar タグ行クリックで開くエントリ作成ポップアップ。
 *
 * 役割分担: chip row = 即入力、sidebar = 精密入力（1 タップ多く、時間指定の自由度が高い）。
 * - タグ名ヘッダー / 開始時刻チップ / duration 候補チップ / ヒストグラム / スライダー / 作成・キャンセル
 * - 候補 / ヒストグラムは client 側で raw サンプルから集計
 * - variance 高いデータは候補に `~` プレフィックス + `opacity-60`
 * - 分布は `trpc.tags.durationDistribution` を open 時に fetch。story では `parameters.trpcMocks`
 *   にサンプル配列を仕込む。loading / error は別 story で検証。
 */
const meta = {
  title: 'Features/Calendar/Sidebar/TagFilter/TagEntryCreatePopover',
  component: TagEntryCreatePopover,
  parameters: {
    layout: 'centered',
    // aria-dialog-name: Radix Popover portal has role="dialog" without accessible name
    a11y: { test: 'todo' },
  },
  tags: ['autodocs'],
  args: {
    open: true,
    onOpenChange: fn(),
    tag: MOCK_TAG,
    defaultDurationMinutes: 30,
    onSubmit: fn(),
  },
} satisfies Meta<typeof TagEntryCreatePopover>;

export default meta;
type Story = StoryObj<typeof meta>;

/** 共通 render: controlled state + relative な親（sidebar タグ行の代用） */
function renderPopover(defaultDuration: number, isMobile = false) {
  function Renderer() {
    const [open, setOpen] = useState(true);
    return (
      <div className="w-64">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className="border-border hover:bg-state-hover relative flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm"
        >
          <span aria-hidden className="bg-tag-blue size-2 shrink-0 rounded-full" />
          <span className="truncate">仕事:Deep Work</span>
          <TagEntryCreatePopover
            open={open}
            onOpenChange={setOpen}
            tag={MOCK_TAG}
            defaultDurationMinutes={defaultDuration}
            onSubmit={fn()}
            onCustomTimeClick={fn()}
            isMobile={isMobile}
          />
        </div>
      </div>
    );
  }
  return <Renderer />;
}

/** 15 件。候補 [60, 45, 25]（2 票タイは duration 昇順で 25 が 30/90 に勝つ）、histogram 表示、variance 低。 */
export const FullData: Story = {
  parameters: {
    trpcMocks: mockTrpc(makeSamples([25, 25, 30, 30, 45, 45, 45, 60, 60, 60, 60, 60, 90, 90, 120])),
  },
  render: () => renderPopover(60),
};

/** 2 件。候補 2 個のみ、histogram 非表示（領域は 80px 確保）、variance は sample_size<10 で false 固定。 */
export const SingleCandidate: Story = {
  parameters: { trpcMocks: mockTrpc(makeSamples([45, 50])) },
  render: () => renderPopover(45),
};

/** 0 件。candidates 空（40px 領域確保）、histogram 非表示、スライダーのみが操作可能。 */
export const NoData: Story = {
  parameters: { trpcMocks: mockTrpc([]) },
  render: () => renderPopover(30),
};

/** 12 件で std/mean > 0.6。候補は出るが `opacity-60` + `~` プレフィックスで「目安」感を出す。 */
export const HighVariance: Story = {
  parameters: {
    trpcMocks: mockTrpc(makeSamples([5, 10, 15, 30, 45, 90, 120, 180, 240, 15, 30, 60])),
  },
  render: () => renderPopover(45),
};

/**
 * Loading state: trpc query 未 resolve。candidates / histogram 領域に shimmer skeleton、
 * 領域サイズ（min-h-10 / min-h-20）は data 到着後と同じで layout shift しない。
 */
export const Loading: Story = {
  parameters: { trpcPending: true },
  render: () => renderPopover(30),
};

/**
 * Error state: trpc query がエラー。candidates / histogram は hide（領域だけ確保）、
 * slider のみで duration を指定可能。
 */
export const Error: Story = {
  parameters: { trpcError: 'Failed to fetch duration distribution' },
  render: () => renderPopover(30),
};

/**
 * モバイル: bottom sheet（vaul Drawer）で画面下から開く。FullData と同じ分布。
 * Storybook viewport は mobile1 固定。実機では `isMobile` を TagFlatList から渡す。
 */
export const Mobile: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
    layout: 'fullscreen',
    trpcMocks: mockTrpc(makeSamples([25, 25, 30, 30, 45, 45, 45, 60, 60, 60, 60, 60, 90, 90, 120])),
  },
  render: () => renderPopover(60, true),
};
